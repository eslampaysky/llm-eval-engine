"""aibreaker.client — BreakerClient: the main entry point for the SDK."""
from __future__ import annotations

import time
import logging
from typing import Any

import requests

from .models import Report

_log = logging.getLogger(__name__)

DEFAULT_ENDPOINT = "https://llm-eval-engine-production.up.railway.app"
DEFAULT_POLL_INTERVAL = 5       # seconds between GET /report/{id} polls
DEFAULT_TIMEOUT       = 600     # seconds before giving up on a running job


class BreakerError(Exception):
    """Raised for non-2xx responses or polling timeouts."""


class BreakerClient:
    """
    Client for AI Breaker Lab.

    Usage::

        from aibreaker import BreakerClient

        client = BreakerClient(api_key="client_key")

        report = client.break_model(
            target={
                "type": "openai",
                "base_url": "https://api.openai.com",
                "api_key": "sk-...",
                "model_name": "gpt-4o-mini",
            },
            description="Customer-support chatbot for an e-commerce platform",
            num_tests=20,
        )

        print(report)
        if not report.passed:
            for f in report.failures:
                print(f"  ✗ {f.question}")
            raise SystemExit(1)
    """

    def __init__(
        self,
        api_key:       str,
        endpoint:      str   = DEFAULT_ENDPOINT,
        groq_api_key:  str | None = None,
        poll_interval: int   = DEFAULT_POLL_INTERVAL,
        timeout:       int   = DEFAULT_TIMEOUT,
    ) -> None:
        """
        Parameters
        ----------
        api_key
            Your Breaker Lab client key (X-API-KEY header).
        endpoint
            Base URL of your deployed Breaker Lab backend.
        groq_api_key
            Groq API key forwarded to the backend.  Falls back to
            the GROQ_API_KEY env var on the backend if omitted.
        poll_interval
            Seconds between status polls while a job is running.
        timeout
            Maximum seconds to wait for a job to complete before raising.
        """
        self._base = endpoint.rstrip("/")
        self._headers = {
            "X-API-KEY":    api_key,
            "Content-Type": "application/json",
        }
        self._groq_api_key  = groq_api_key
        self._poll_interval = poll_interval
        self._timeout       = timeout

    # ── Core method ───────────────────────────────────────────────────────────

    def break_model(
        self,
        target:         dict[str, Any],
        description:    str,
        num_tests:      int   = 20,
        fail_threshold: float = 5.0,
        force_refresh:  bool  = False,
    ) -> Report:
        """
        Submit an adversarial evaluation run and block until it completes.

        Parameters
        ----------
        target
            Adapter config dict.  Supported shapes:

            OpenAI-compatible::

                {"type": "openai", "base_url": "https://api.openai.com",
                 "api_key": "sk-...", "model_name": "gpt-4o-mini"}

            HuggingFace::

                {"type": "huggingface", "repo_id": "mistralai/Mistral-7B-v0.1",
                 "api_token": "hf-..."}

            Webhook::

                {"type": "webhook", "endpoint_url": "https://...",
                 "payload_template": '{"question": "{question}"}'}

        description
            Free-text description of the model under test.
        num_tests
            Number of adversarial tests to generate (6–50).
        fail_threshold
            Score below which the report is considered failing (0–10).
        force_refresh
            Bypass test-suite cache and regenerate from scratch.

        Returns
        -------
        Report
            Typed report object.  ``report.passed`` is False when
            ``report.score < fail_threshold``.

        Raises
        ------
        BreakerError
            On API errors or polling timeout.
        """
        body: dict[str, Any] = {
            "target":       target,
            "description":  description,
            "num_tests":    num_tests,
            "force_refresh": force_refresh,
        }
        if self._groq_api_key:
            body["groq_api_key"] = self._groq_api_key

        _log.info("[aibreaker] Submitting /break  description=%r  num_tests=%d",
                  description, num_tests)

        resp = self._post("/break", body)
        report_id = resp["report_id"]
        _log.info("[aibreaker] Job queued  report_id=%s", report_id)

        row = self._poll(report_id)
        return Report._from_api(row, base_url=self._base, fail_threshold=fail_threshold)

    # ── Lower-level helpers ───────────────────────────────────────────────────

    def get_report(self, report_id: str) -> dict[str, Any]:
        """Fetch a raw report dict by ID (no polling)."""
        return self._get(f"/report/{report_id}")

    def list_reports(self) -> list[dict[str, Any]]:
        """List all reports for the authenticated client."""
        return self._get("/reports")

    def delete_report(self, report_id: str) -> bool:
        """Delete a report. Returns True on success."""
        resp = self._request("DELETE", f"/report/{report_id}")
        return resp.get("deleted", False)

    # ── Internal ─────────────────────────────────────────────────────────────

    def _poll(self, report_id: str) -> dict[str, Any]:
        deadline = time.monotonic() + self._timeout
        while True:
            path = f"/report/{report_id}"
            url = f"{self._base}{path}"

            delays = [2, 4, 8]
            last_exc: Exception | None = None
            last_resp: requests.Response | None = None
            row: dict[str, Any] | None = None

            for attempt in range(len(delays) + 1):
                last_exc = None
                last_resp = None

                try:
                    resp = requests.request(
                        "GET",
                        url,
                        headers=self._headers,
                        timeout=30,
                    )
                    last_resp = resp
                except (requests.ConnectionError, requests.Timeout) as exc:
                    last_exc = exc
                    if attempt >= len(delays):
                        raise BreakerError(f"GET {url} network error: {exc}") from exc

                    wait_s = delays[attempt]
                    _log.warning(
                        "[aibreaker] Poll transient network error; retrying in %ss  "
                        "report_id=%s  attempt=%d/%d  error=%s",
                        wait_s,
                        report_id,
                        attempt + 1,
                        len(delays),
                        exc,
                    )

                    if time.monotonic() + wait_s >= deadline:
                        raise BreakerError(
                            f"Timed out waiting for report {report_id} after {self._timeout}s "
                            f"(last error: {exc})"
                        ) from exc

                    time.sleep(wait_s)
                    continue

                if 200 <= resp.status_code < 300:
                    row = resp.json()
                    break

                if resp.status_code == 429:
                    if attempt >= len(delays):
                        raise BreakerError(f"GET {url} \u2192 429: {resp.text[:300]}")

                    retry_after = resp.headers.get("Retry-After", "").strip()
                    try:
                        wait_s = int(retry_after) if retry_after else 60
                    except ValueError:
                        wait_s = 60

                    _log.warning(
                        "[aibreaker] Poll rate limited (429); retrying in %ss  "
                        "report_id=%s  attempt=%d/%d",
                        wait_s,
                        report_id,
                        attempt + 1,
                        len(delays),
                    )

                    if time.monotonic() + wait_s >= deadline:
                        raise BreakerError(
                            f"Timed out waiting for report {report_id} after {self._timeout}s "
                            f"(last status: 429)"
                        )

                    time.sleep(wait_s)
                    continue

                if 500 <= resp.status_code <= 599:
                    if attempt >= len(delays):
                        raise BreakerError(f"GET {url} \u2192 {resp.status_code}: {resp.text[:300]}")

                    wait_s = delays[attempt]
                    _log.warning(
                        "[aibreaker] Poll transient HTTP %d; retrying in %ss  "
                        "report_id=%s  attempt=%d/%d",
                        resp.status_code,
                        wait_s,
                        report_id,
                        attempt + 1,
                        len(delays),
                    )

                    if time.monotonic() + wait_s >= deadline:
                        raise BreakerError(
                            f"Timed out waiting for report {report_id} after {self._timeout}s "
                            f"(last status: {resp.status_code})"
                        )

                    time.sleep(wait_s)
                    continue

                # Permanent errors: 4xx except 429.
                if 400 <= resp.status_code <= 499:
                    raise BreakerError(f"GET {url} \u2192 {resp.status_code}: {resp.text[:300]}")

                raise BreakerError(f"GET {url} \u2192 {resp.status_code}: {resp.text[:300]}")

            if row is None:
                if last_exc is not None:
                    raise BreakerError(f"GET {url} network error: {last_exc}") from last_exc
                if last_resp is not None:
                    raise BreakerError(f"GET {url} \u2192 {last_resp.status_code}: {last_resp.text[:300]}")
                raise BreakerError(f"GET {url} failed unexpectedly")

            status = row.get("status")

            if status == "done":
                _log.info("[aibreaker] Job complete  report_id=%s  score=%.2f",
                          report_id, (row.get("metrics") or {}).get("average_score", 0))
                return row

            if status in ("failed", "stale"):
                err = row.get("error") or status
                raise BreakerError(f"Job {report_id} ended with status '{status}': {err}")

            if time.monotonic() >= deadline:
                raise BreakerError(
                    f"Timed out waiting for report {report_id} after {self._timeout}s "
                    f"(last status: {status!r})"
                )

            _log.debug("[aibreaker] Polling  report_id=%s  status=%s", report_id, status)
            time.sleep(self._poll_interval)

    def _get(self, path: str) -> Any:
        return self._request("GET", path)

    def _post(self, path: str, body: dict) -> Any:
        return self._request("POST", path, json=body)

    def _request(self, method: str, path: str, **kwargs) -> Any:
        url = f"{self._base}{path}"
        try:
            resp = requests.request(method, url, headers=self._headers,
                                    timeout=30, **kwargs)
        except requests.RequestException as exc:
            raise BreakerError(f"{method} {url} network error: {exc}") from exc

        if not resp.ok:
            raise BreakerError(
                f"{method} {url} → {resp.status_code}: {resp.text[:300]}"
            )
        return resp.json()
