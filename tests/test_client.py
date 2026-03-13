"""Tests for the core aibreaker SDK (BreakerClient + Report)."""

from __future__ import annotations

import os
import sys
import unittest
from unittest.mock import patch

import json

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from aibreaker.client import BreakerClient, BreakerError
from aibreaker.models import Report


class _FakeResponse:
    def __init__(self, *, status: int, json_body: dict | None = None, text: str | None = None, headers: dict | None = None):
        self.status_code = status
        self._json_body = json_body
        self.headers = headers or {}
        if text is not None:
            self.text = text
        else:
            self.text = json.dumps(json_body) if json_body is not None else ""
        self.ok = 200 <= status < 300

    def json(self):
        if self._json_body is None:
            raise ValueError("No JSON body set")
        return self._json_body


def _report_row(*, report_id: str, status: str, average_score: float) -> dict:
    return {
        "report_id": report_id,
        "status": status,
        "metrics": {
            "average_score": average_score,
            "total_samples": 2,
            "hallucinations_detected": 0,
            "low_quality_answers": 0,
            "fail_threshold": 5.0,
            "consistency_score": 0.0,
            "judges_agreement": 1.0,
            "red_flags": [],
            "breakdown_by_type": {},
            "judges": {},
            "failed_rows": [
                {
                    "question": "q1",
                    "ground_truth": "gt1",
                    "model_answer": "ma1",
                    "test_type": "adversarial",
                    "score": 2.0,
                    "hallucination": False,
                    "reason": "wrong",
                }
            ],
        },
        "results": [],
        "html_report_url": f"/report/{report_id}/html",
    }


class TestBreakerClient(unittest.TestCase):
    def test_break_model_success_polls_until_done(self):
        base = "https://example.com"
        client = BreakerClient(
            api_key="k",
            endpoint=base,
            poll_interval=0,
            timeout=5,
        )

        expected = [
            ("POST", f"{base}/break", _FakeResponse(status=200, json_body={"report_id": "r1"})),
            ("GET", f"{base}/report/r1", _FakeResponse(status=200, json_body=_report_row(report_id="r1", status="processing", average_score=0.0))),
            ("GET", f"{base}/report/r1", _FakeResponse(status=200, json_body=_report_row(report_id="r1", status="done", average_score=7.0))),
        ]
        expected_calls = expected.copy()

        def _side_effect(method, url, **_kwargs):
            exp_method, exp_url, resp = expected_calls.pop(0)
            self.assertEqual(method, exp_method)
            self.assertEqual(url, exp_url)
            return resp

        with patch("aibreaker.client.requests.request", side_effect=_side_effect):
            report = client.break_model(
                target={"type": "openai", "model_name": "gpt-4o-mini"},
                description="test",
                num_tests=6,
            )

        self.assertIsInstance(report, Report)
        self.assertEqual(report.report_id, "r1")
        self.assertTrue(report.passed)
        self.assertEqual(expected_calls, [])

    def test_break_model_raises_on_4xx_from_break(self):
        base = "https://example.com"
        client = BreakerClient(api_key="k", endpoint=base, poll_interval=0, timeout=5)

        expected_calls = [
            ("POST", f"{base}/break", _FakeResponse(status=400, text="bad request")),
        ]

        def _side_effect(method, url, **_kwargs):
            exp_method, exp_url, resp = expected_calls.pop(0)
            self.assertEqual(method, exp_method)
            self.assertEqual(url, exp_url)
            return resp

        with patch("aibreaker.client.requests.request", side_effect=_side_effect):
            with self.assertRaises(BreakerError):
                client.break_model(
                    target={"type": "openai", "model_name": "gpt-4o-mini"},
                    description="test",
                    num_tests=6,
                )

    def test_break_model_raises_on_poll_timeout(self):
        base = "https://example.com"
        client = BreakerClient(api_key="k", endpoint=base, poll_interval=0, timeout=0)

        expected_calls = [
            ("POST", f"{base}/break", _FakeResponse(status=200, json_body={"report_id": "r2"})),
            ("GET", f"{base}/report/r2", _FakeResponse(status=200, json_body=_report_row(report_id="r2", status="processing", average_score=0.0))),
        ]

        def _side_effect(method, url, **_kwargs):
            exp_method, exp_url, resp = expected_calls.pop(0)
            self.assertEqual(method, exp_method)
            self.assertEqual(url, exp_url)
            return resp

        with patch("aibreaker.client.requests.request", side_effect=_side_effect):
            with self.assertRaises(BreakerError):
                client.break_model(
                    target={"type": "openai", "model_name": "gpt-4o-mini"},
                    description="test",
                    num_tests=6,
                )

    def test_break_model_fail_threshold_marks_report_failed(self):
        base = "https://example.com"
        client = BreakerClient(api_key="k", endpoint=base, poll_interval=0, timeout=5)

        expected_calls = [
            ("POST", f"{base}/break", _FakeResponse(status=200, json_body={"report_id": "r3"})),
            ("GET", f"{base}/report/r3", _FakeResponse(status=200, json_body=_report_row(report_id="r3", status="done", average_score=4.0))),
        ]

        def _side_effect(method, url, **_kwargs):
            exp_method, exp_url, resp = expected_calls.pop(0)
            self.assertEqual(method, exp_method)
            self.assertEqual(url, exp_url)
            return resp

        with patch("aibreaker.client.requests.request", side_effect=_side_effect):
            report = client.break_model(
                target={"type": "openai", "model_name": "gpt-4o-mini"},
                description="test",
                num_tests=6,
                fail_threshold=5.0,
            )
        self.assertFalse(report.passed)


class TestReportFromApi(unittest.TestCase):
    def test_from_api_deserializes_fields(self):
        row = _report_row(report_id="abc-123", status="done", average_score=7.2)
        report = Report._from_api(row, base_url="https://example.com", fail_threshold=5.0)

        self.assertAlmostEqual(report.score, 7.2)
        self.assertTrue(report.passed)
        self.assertEqual(report.failure_count, 1)
        self.assertEqual(len(report.failures), 1)
        self.assertEqual(report.failures[0].question, "q1")
        self.assertEqual(report.failures[0].score, 2.0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
