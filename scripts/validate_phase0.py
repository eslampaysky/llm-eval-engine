#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sys
import time

import psycopg2
import psycopg2.extras
import requests
from dotenv import load_dotenv


def _require_env(name: str) -> str:
    value = (os.getenv(name) or "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def _login(base: str) -> str:
    response = requests.post(
        f"{base}/auth/login",
        json={
            "email": _require_env("AIBREAKER_EMAIL"),
            "password": _require_env("AIBREAKER_PASSWORD"),
        },
        timeout=20,
    )
    response.raise_for_status()
    payload = response.json()
    token = payload.get("access_token") or payload.get("token") or ""
    if not token:
        raise SystemExit("Login succeeded but no access token was returned")
    return token


def _connect_db():
    return psycopg2.connect(
        _require_env("DATABASE_URL"),
        cursor_factory=psycopg2.extras.RealDictCursor,
    )


def _get_row(conn, audit_id: str):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM agentic_qa_reports WHERE audit_id = %s", (audit_id,))
        return cur.fetchone()


def _assert_no_inline_base64(row: dict | None) -> None:
    if not row:
        raise AssertionError("Audit row was not created in agentic_qa_reports")
    for column in ("desktop_ss_b64", "mobile_ss_b64"):
        value = row.get(column)
        if isinstance(value, str) and value.startswith("data:image"):
            raise AssertionError(f"{column} still contains inline base64 data")


def _check_image(base: str, token: str, relative_url: str | None) -> bool:
    if not relative_url:
        return False
    response = requests.get(
        f"{base}{relative_url}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    return response.status_code == 200 and response.headers.get("content-type", "").startswith("image/")


def _llm_used(status_payload: dict) -> bool:
    for step in status_payload.get("step_results") or []:
        verification = step.get("verification") or {}
        if verification.get("llm_used") is True:
            return True
    return False


def main() -> int:
    load_dotenv()

    parser = argparse.ArgumentParser(description="Run one Phase 0 validation audit.")
    parser.add_argument("--base", default=os.getenv("AIBREAKER_API_BASE", "http://127.0.0.1:8000"))
    parser.add_argument("--url", required=True)
    parser.add_argument("--tier", default="deep")
    parser.add_argument("--site-description", default="")
    parser.add_argument("--poll-interval", type=int, default=5)
    parser.add_argument("--poll-timeout", type=int, default=360)
    args = parser.parse_args()

    token = _login(args.base)
    headers = {"Authorization": f"Bearer {token}"}

    start_response = requests.post(
        f"{args.base}/agentic-qa/start",
        headers=headers,
        json={
            "url": args.url,
            "tier": args.tier,
            "site_description": args.site_description,
        },
        timeout=30,
    )
    start_response.raise_for_status()
    audit_id = start_response.json()["audit_id"]

    conn = _connect_db()
    midrun_checked = False
    deadline = time.time() + args.poll_timeout
    status_payload: dict | None = None

    try:
        while time.time() < deadline:
            response = requests.get(f"{args.base}/agentic-qa/status/{audit_id}", headers=headers, timeout=20)
            response.raise_for_status()
            status_payload = response.json()
            row = _get_row(conn, audit_id)

            if not midrun_checked and status_payload.get("status") in {"queued", "processing"}:
                _assert_no_inline_base64(row)
                midrun_checked = True

            if status_payload.get("status") in {"done", "failed", "canceled"}:
                break

            time.sleep(args.poll_interval)
        else:
            raise AssertionError("Audit did not finish before timeout")

        if not status_payload or status_payload.get("status") != "done":
            raise AssertionError(f"Audit did not complete successfully: {status_payload}")

        row = _get_row(conn, audit_id)
        _assert_no_inline_base64(row)

        result = {
            "audit_id": audit_id,
            "status": status_payload.get("status"),
            "analysis_limited": status_payload.get("analysis_limited"),
            "llm_used": _llm_used(status_payload),
            "desktop_ss_path": row.get("desktop_ss_path") if row else None,
            "mobile_ss_path": row.get("mobile_ss_path") if row else None,
            "desktop_legacy_empty": row.get("desktop_ss_b64") in (None, "") if row else False,
            "mobile_legacy_empty": row.get("mobile_ss_b64") in (None, "") if row else False,
            "desktop_screenshot_ok": _check_image(args.base, token, status_payload.get("desktop_screenshot_url")),
            "mobile_screenshot_ok": _check_image(args.base, token, status_payload.get("mobile_screenshot_url")),
        }
        print(json.dumps(result, indent=2))
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
