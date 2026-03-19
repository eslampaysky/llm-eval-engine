from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_BASE_URL = "https://llm-eval-engine-production.up.railway.app"
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parents[1] / "configs" / "calibration_targets.json"
DEFAULT_OUTPUT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "calibration"


@dataclass
class Target:
    name: str
    url: str
    expected_type: str
    tier: str
    site_description: str


def _env(name: str, default: str | None = None) -> str:
    value = os.getenv(name, default)
    if value is None or not str(value).strip():
        raise RuntimeError(f"{name} is required")
    return str(value).strip()


def _request(url: str, *, method: str = "GET", headers: dict[str, str] | None = None, data: dict[str, Any] | None = None) -> dict[str, Any]:
    payload = json.dumps(data).encode("utf-8") if data is not None else None
    request = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers=headers or {},
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed: {exc.code} {exc.reason} :: {body}") from exc


def _login(base_url: str, email: str, password: str) -> str:
    response = _request(
        f"{base_url}/auth/login",
        method="POST",
        headers={"Content-Type": "application/json"},
        data={"email": email, "password": password},
    )
    token = response.get("access_token")
    if not token:
        raise RuntimeError(f"Login succeeded but no access token was returned: {response}")
    return str(token)


def _load_targets(config_path: Path, group: str) -> list[Target]:
    with config_path.open(encoding="utf-8") as fh:
        config = json.load(fh)
    targets = config.get("groups", {}).get(group)
    if not isinstance(targets, list) or not targets:
        raise RuntimeError(f"No targets found for group '{group}' in {config_path}")
    return [Target(**item) for item in targets]


def _poll_status(base_url: str, audit_id: str, headers: dict[str, str], timeout_seconds: int) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        status = _request(
            f"{base_url}/agentic-qa/status/{audit_id}",
            headers=headers,
        )
        if status.get("status") in {"done", "failed", "stale", "completed"}:
            return status
        time.sleep(5)
    raise TimeoutError(f"Audit {audit_id} did not complete within {timeout_seconds} seconds")


def _extract_predicted_type(status: dict[str, Any]) -> str | None:
    prompt = status.get("bundled_fix_prompt") or ""
    marker = 'inferred_context": {"app_type": "'
    if marker in prompt:
        remainder = prompt.split(marker, 1)[1]
        return remainder.split('"', 1)[0]
    return None


def _truth_over_exception_notes(status: dict[str, Any]) -> list[str]:
    notes: list[str] = []
    for step in status.get("step_results") or []:
        for note in step.get("notes") or []:
            if "Action error overruled by success signals" in note:
                notes.append(note)
    return notes


def _recovery_summary(status: dict[str, Any]) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for step in status.get("step_results") or []:
        for event in step.get("recovery_attempts") or []:
            if isinstance(event, dict):
                events.append(event)
    return events


def _journey_statuses(status: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "journey": item.get("journey"),
            "status": item.get("status"),
            "failed_step": item.get("failed_step"),
            "reason": item.get("reason"),
        }
        for item in (status.get("journey_timeline") or [])
    ]


def run_group(group: str, *, base_url: str, email: str, password: str, api_key: str, config_path: Path, timeout_seconds: int, output_dir: Path) -> tuple[Path, Path]:
    token = _login(base_url, email, password)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "X-API-KEY": api_key,
    }
    targets = _load_targets(config_path, group)
    output_dir.mkdir(parents=True, exist_ok=True)

    json_rows: list[dict[str, Any]] = []
    csv_path = output_dir / f"{group}_summary.csv"
    json_path = output_dir / f"{group}_results.json"

    for index, target in enumerate(targets, start=1):
        print(f"[{group} {index}/{len(targets)}] Starting {target.name} -> {target.url}")
        start = _request(
            f"{base_url}/agentic-qa/start",
            method="POST",
            headers=headers,
            data={
                "url": target.url,
                "tier": target.tier,
                "site_description": target.site_description,
            },
        )
        audit_id = str(start["audit_id"])
        print(f"  audit_id={audit_id}")
        status = _poll_status(base_url, audit_id, headers, timeout_seconds)
        predicted_type = _extract_predicted_type(status)
        recovery_events = _recovery_summary(status)
        truth_notes = _truth_over_exception_notes(status)
        journeys = _journey_statuses(status)
        row = {
            "group": group,
            "name": target.name,
            "url": target.url,
            "expected_type": target.expected_type,
            "predicted_type": predicted_type,
            "classification_correct": predicted_type == target.expected_type if predicted_type else None,
            "final_status": status.get("status"),
            "journey_result": " / ".join(
                f"{journey['journey']}:{journey['status']}" for journey in journeys
            ),
            "journey_count": len(journeys),
            "recovery_count": len(recovery_events),
            "recovery_types": ", ".join(sorted({str(event.get('blocker_type')) for event in recovery_events})),
            "truth_over_exception_count": len(truth_notes),
            "notes": " | ".join(
                note for note in (
                    [journey.get("reason") for journey in journeys if journey.get("reason")] + truth_notes
                ) if note
            ),
            "audit_id": audit_id,
            "raw_status": status,
        }
        json_rows.append(row)
        print(
            f"  predicted={predicted_type} expected={target.expected_type} "
            f"journeys={row['journey_result']} recovery={row['recovery_count']}"
        )

    with json_path.open("w", encoding="utf-8") as fh:
        json.dump(json_rows, fh, indent=2)

    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "group",
                "name",
                "url",
                "expected_type",
                "predicted_type",
                "classification_correct",
                "final_status",
                "journey_result",
                "journey_count",
                "recovery_count",
                "recovery_types",
                "truth_over_exception_count",
                "notes",
                "audit_id",
            ],
        )
        writer.writeheader()
        for row in json_rows:
            serializable = dict(row)
            serializable.pop("raw_status", None)
            writer.writerow(serializable)

    return json_path, csv_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a hosted AiBreaker calibration group against Railway.")
    parser.add_argument("--group", required=True, help="Calibration group name from configs/calibration_targets.json")
    parser.add_argument("--timeout-seconds", type=int, default=240, help="Per-audit timeout while polling")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="Path to calibration target manifest")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Where to save JSON/CSV results")
    args = parser.parse_args()

    base_url = _env("AIBREAKER_API_BASE", DEFAULT_BASE_URL)
    email = _env("AIBREAKER_EMAIL")
    password = _env("AIBREAKER_PASSWORD")
    api_key = _env("AIBREAKER_API_KEY", "client_key")

    json_path, csv_path = run_group(
        args.group,
        base_url=base_url,
        email=email,
        password=password,
        api_key=api_key,
        config_path=args.config,
        timeout_seconds=args.timeout_seconds,
        output_dir=args.output_dir,
    )
    print(f"Saved JSON results to {json_path}")
    print(f"Saved CSV summary to {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
