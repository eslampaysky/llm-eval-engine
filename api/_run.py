"""
_run.py — evaluation logic for the aibreaker GitHub Action.
Called by action.yml's inline Python step.
"""
from __future__ import annotations

import os
import sys


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default).strip()


def _write_output(key: str, value: str) -> None:
    """Append key=value to $GITHUB_OUTPUT (Actions output protocol)."""
    output_file = os.environ.get("GITHUB_OUTPUT")
    if output_file:
        with open(output_file, "a") as f:
            f.write(f"{key}={value}\n")
    else:
        # Fallback for local testing
        print(f"::set-output name={key}::{value}")


def _build_target() -> dict:
    target_type = _env("INPUT_TARGET_TYPE", "openai")

    if target_type == "openai":
        target: dict = {
            "type":       "openai",
            "base_url":   _env("INPUT_TARGET_BASE_URL", "https://api.openai.com"),
            "model_name": _env("INPUT_TARGET_MODEL_NAME"),
        }
        api_key = _env("INPUT_TARGET_API_KEY")
        if api_key:
            target["api_key"] = api_key
        return target

    if target_type == "huggingface":
        return {
            "type":      "huggingface",
            "repo_id":   _env("INPUT_TARGET_REPO_ID"),
            "api_token": _env("INPUT_TARGET_API_TOKEN"),
        }

    if target_type == "webhook":
        return {
            "type":             "webhook",
            "endpoint_url":     _env("INPUT_TARGET_ENDPOINT_URL"),
            "payload_template": _env("INPUT_TARGET_PAYLOAD_TEMPLATE"),
        }

    raise ValueError(f"Unknown target_type: {target_type!r}. Must be openai|huggingface|webhook.")


def main() -> int:
    """Returns 0 (pass) or 1 (fail / error)."""
    try:
        from aibreaker import BreakerClient
        from aibreaker.client import BreakerError
    except ImportError as exc:
        print(f"::error::Failed to import aibreaker SDK: {exc}")
        return 1

    api_key      = _env("INPUT_API_KEY")
    endpoint     = _env("INPUT_ENDPOINT", "https://ai-breaker-labs.vercel.app")
    description  = _env("INPUT_DESCRIPTION")
    num_tests    = int(_env("INPUT_NUM_TESTS", "20"))
    threshold    = float(_env("INPUT_FAIL_THRESHOLD", "5.0"))
    force_refresh = _env("INPUT_FORCE_REFRESH", "false").lower() == "true"

    # Validate required inputs
    missing = []
    if not api_key:
        missing.append("api_key")
    if not description:
        missing.append("description")
    if missing:
        print(f"::error::Missing required inputs: {', '.join(missing)}")
        return 1

    # Build target config
    try:
        target = _build_target()
    except ValueError as exc:
        print(f"::error::{exc}")
        return 1

    print(f"▶ AI Breaker Lab evaluation")
    print(f"  Endpoint    : {endpoint}")
    print(f"  Description : {description}")
    print(f"  Num tests   : {num_tests}")
    print(f"  Threshold   : {threshold}/10")
    print(f"  Target type : {target['type']}")
    if target.get("model_name"):
        print(f"  Model       : {target['model_name']}")
    print()

    client = BreakerClient(
        api_key=api_key,
        endpoint=endpoint,
        poll_interval=8,
        timeout=600,
    )

    try:
        report = client.break_model(
            target=target,
            description=description,
            num_tests=num_tests,
            fail_threshold=threshold,
            force_refresh=force_refresh,
        )
    except BreakerError as exc:
        print(f"::error::Breaker Lab evaluation failed: {exc}")
        return 1
    except Exception as exc:
        print(f"::error::Unexpected error: {exc}")
        return 1

    # ── Print summary ─────────────────────────────────────────────────────────
    print(report)
    print()

    if report.metrics.red_flags:
        print("⚠ Red flags:")
        for flag in report.metrics.red_flags:
            print(f"  • {flag}")
        print()

    if report.failures:
        print(f"✗ Failed tests ({report.failure_count}):")
        for f in report.failures[:10]:   # cap at 10 in CI output
            print(f"  [{f.test_type}] score={f.score:.1f}  {f.question[:80]}")
        if report.failure_count > 10:
            print(f"  ... and {report.failure_count - 10} more (see full report)")
        print()

    # ── Set outputs ───────────────────────────────────────────────────────────
    _write_output("score",         f"{report.score:.2f}")
    _write_output("passed",        str(report.passed).lower())
    _write_output("report_url",    report.report_url)
    _write_output("failure_count", str(report.failure_count))

    if report.passed:
        print(f"✓ Evaluation passed  (score {report.score:.2f} ≥ threshold {threshold})")
        return 0
    else:
        # Use GitHub Actions error annotation
        print(
            f"::error::Model evaluation FAILED — "
            f"score {report.score:.2f}/10 is below threshold {threshold}/10. "
            f"{report.failure_count} test(s) failed. "
            f"Report: {report.report_url}"
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
