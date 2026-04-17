#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agentic_qa import discover_site
from core.models import AppType
from core.web_agent import run_web_audit

_SUPPORTED_EXPECTED_TYPES = {
    AppType.ECOMMERCE.value,
    AppType.SAAS_AUTH.value,
    AppType.MARKETING.value,
    AppType.TASK_MANAGER.value,
    AppType.GENERIC.value,
}


def _load_targets(manifest_path: Path, limit: int | None = None) -> list[dict[str, Any]]:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    targets: list[dict[str, Any]] = []

    groups = payload.get("groups") or {}
    for items in groups.values():
        for item in items or []:
            if not isinstance(item, dict):
                continue
            if item.get("skip_reason"):
                continue
            expected_type = str(item.get("expected_type") or "").strip().lower()
            if expected_type not in _SUPPORTED_EXPECTED_TYPES:
                continue
            targets.append(item)

    if limit is not None:
        return targets[:limit]
    return targets


async def _crawl_target(url: str) -> dict[str, Any]:
    return await run_web_audit(
        url,
        record_video=False,
        run_journeys=None,
        max_pages=1,
    )


def _classify_target(target: dict[str, Any]) -> dict[str, Any]:
    crawl = asyncio.run(_crawl_target(target["url"]))
    context = discover_site(crawl, description=target.get("site_description"))
    predicted = str(context.get("app_type") or AppType.GENERIC.value)
    expected = str(target.get("expected_type") or "")
    return {
        "name": target.get("name") or "",
        "url": target["url"],
        "predicted": predicted,
        "expected": expected,
        "correct": predicted == expected,
        "classifier_source": context.get("classification_source"),
        "confidence": context.get("confidence"),
        "signals": context.get("signals") or [],
    }


def _print_summary(rows: list[dict[str, Any]]) -> None:
    headers = ["URL", "predicted", "expected", "correct"]
    widths = {
        "URL": max(len(headers[0]), *(len(str(row["url"])) for row in rows)) if rows else len(headers[0]),
        "predicted": max(len(headers[1]), *(len(str(row["predicted"])) for row in rows)) if rows else len(headers[1]),
        "expected": max(len(headers[2]), *(len(str(row["expected"])) for row in rows)) if rows else len(headers[2]),
        "correct": len(headers[3]),
    }

    header_line = (
        f"{headers[0]:<{widths['URL']}}  "
        f"{headers[1]:<{widths['predicted']}}  "
        f"{headers[2]:<{widths['expected']}}  "
        f"{headers[3]}"
    )
    print(header_line)
    print("-" * len(header_line))
    for row in rows:
        print(
            f"{str(row['url']):<{widths['URL']}}  "
            f"{str(row['predicted']):<{widths['predicted']}}  "
            f"{str(row['expected']):<{widths['expected']}}  "
            f"{str(row['correct']).lower()}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate AiBreaker app-type classifier accuracy.")
    parser.add_argument(
        "--manifest",
        default="configs/calibration_targets.json",
        help="Path to a JSON manifest with expected_type labels.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=16,
        help="Number of real sites to validate.",
    )
    parser.add_argument(
        "--min-accuracy",
        type=float,
        default=0.80,
        help="Minimum required accuracy ratio.",
    )
    parser.add_argument(
        "--output-json",
        default="artifacts/classification_validation.json",
        help="Where to write the raw validation results.",
    )
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    targets = _load_targets(manifest_path, limit=args.limit)
    rows = [_classify_target(target) for target in targets]

    correct_count = sum(1 for row in rows if row["correct"])
    total = len(rows)
    accuracy = (correct_count / total) if total else 0.0

    _print_summary(rows)
    print()
    print(f"accuracy: {correct_count}/{total} = {accuracy:.2%}")
    print(f"success_threshold: {args.min_accuracy:.0%}")
    print(f"success: {str(accuracy >= args.min_accuracy).lower()}")

    output_path = Path(args.output_json)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "manifest": str(manifest_path),
                "rows": rows,
                "correct": correct_count,
                "total": total,
                "accuracy": accuracy,
                "success_threshold": args.min_accuracy,
                "success": accuracy >= args.min_accuracy,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    return 0 if accuracy >= args.min_accuracy else 1


if __name__ == "__main__":
    raise SystemExit(main())
