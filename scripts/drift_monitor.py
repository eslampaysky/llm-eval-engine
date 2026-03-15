from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from typing import Any, List, Dict

import requests

from api.database import init_db, get_model_scores


def _compute_drift(series: List[Dict[str, Any]], threshold: float) -> Dict[str, Any]:
    """
    Compute baseline/current scores and drift percentage from a time-ordered series.

    series: list of {"created_at": str, "score": float}, oldest first.
    """
    run_count = len(series)
    if run_count == 0:
        return {
            "baseline_score": 0.0,
            "current_score": 0.0,
            "drift_pct": 0.0,
            "drift_detected": False,
            "run_count": 0,
            "series": [],
        }

    # Use oldest 20% for baseline and newest 20% for current, at least 1 each.
    window_size = max(1, run_count // 5)
    baseline_slice = series[:window_size]
    current_slice = series[-window_size:]

    def _avg(scores: List[Dict[str, Any]]) -> float:
        if not scores:
            return 0.0
        return sum(float(r["score"] or 0.0) for r in scores) / len(scores)

    baseline_score = _avg(baseline_slice)
    current_score = _avg(current_slice)

    if baseline_score <= 0:
        drift_pct = 0.0
    else:
        drift_pct = (baseline_score - current_score) / baseline_score

    drift_detected = drift_pct > threshold

    # Normalize series payload for output (date-only for charting).
    normalized_series = [
        {
            "date": str(r["created_at"])[:10],
            "score": float(r["score"] or 0.0),
        }
        for r in series
    ]

    return {
        "baseline_score": baseline_score,
        "current_score": current_score,
        "drift_pct": drift_pct,
        "drift_detected": drift_detected,
        "run_count": run_count,
        "series": normalized_series,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Drift monitor for evaluation reports.")
    parser.add_argument(
        "--model-version",
        required=True,
        help="Model version identifier to monitor (matches evaluation_reports.model_version).",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.05,
        help="Relative drop threshold for drift detection (default 0.05 = 5%% drop).",
    )
    parser.add_argument(
        "--window",
        type=int,
        default=7,
        help="Rolling window in days to consider (default 7).",
    )
    parser.add_argument(
        "--alert-webhook",
        type=str,
        default="",
        help="Optional Slack webhook URL to receive drift alerts.",
    )

    args = parser.parse_args(argv)
    model_version: str = args.model_version
    threshold: float = float(args.threshold)
    window_days: int = int(args.window)
    alert_webhook: str | None = (args.alert_webhook or "").strip() or None

    if window_days <= 0:
        print("window must be a positive integer (days)", file=sys.stderr)
        return 1

    # Ensure DB schema is ready (especially when using Postgres via DATABASE_URL).
    init_db()

    # Compute cutoff timestamp string for SQL filtering.
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=window_days)

    rows = get_model_scores(model_version=model_version, cutoff_iso=cutoff.isoformat())
    if not rows:
        print(f"No completed reports found for model_version={model_version!r} in the last {window_days} days.")
        return 0

    drift = _compute_drift(rows, threshold=threshold)

    print(json.dumps(
        {
            "model_version": model_version,
            **{k: v for k, v in drift.items() if k != "series"},
        },
        indent=2,
        ensure_ascii=False,
    ))

    if drift["drift_detected"]:
        warning_msg = (
            f"[DRIFT] model_version={model_version} "
            f"baseline={drift['baseline_score']:.4f} "
            f"current={drift['current_score']:.4f} "
            f"drift_pct={drift['drift_pct']:.4f}"
        )
        print(warning_msg, file=sys.stderr)

        if alert_webhook:
            try:
                text = (
                    f"⚠️ Drift detected for `{model_version}`\n"
                    f"Baseline score: {drift['baseline_score']:.4f}\n"
                    f"Current score: {drift['current_score']:.4f}\n"
                    f"Drift: {drift['drift_pct'] * 100:.2f}% over last {window_days} days "
                    f"(threshold {threshold * 100:.2f}%)."
                )
                resp = requests.post(
                    alert_webhook,
                    json={"text": text},
                    timeout=5,
                )
                if resp.status_code >= 400:
                    print(
                        f"Slack webhook returned HTTP {resp.status_code}: {(resp.text or '')[:200]}",
                        file=sys.stderr,
                    )
            except Exception as exc:
                print(f"Failed to send Slack alert: {exc}", file=sys.stderr)

        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

