"""Tests for the core aibreaker SDK (BreakerClient + Report)."""

from __future__ import annotations

import os
import sys
import unittest

import responses

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

from aibreaker.client import BreakerClient, BreakerError
from aibreaker.models import Report


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
    @responses.activate
    def test_break_model_success_polls_until_done(self):
        base = "https://example.com"
        client = BreakerClient(
            api_key="k",
            endpoint=base,
            poll_interval=0,
            timeout=5,
        )

        responses.add(
            responses.POST,
            f"{base}/break",
            json={"report_id": "r1"},
            status=200,
        )
        responses.add(
            responses.GET,
            f"{base}/report/r1",
            json=_report_row(report_id="r1", status="processing", average_score=0.0),
            status=200,
        )
        responses.add(
            responses.GET,
            f"{base}/report/r1",
            json=_report_row(report_id="r1", status="done", average_score=7.0),
            status=200,
        )

        report = client.break_model(
            target={"type": "openai", "model_name": "gpt-4o-mini"},
            description="test",
            num_tests=6,
        )
        self.assertIsInstance(report, Report)
        self.assertEqual(report.report_id, "r1")
        self.assertTrue(report.passed)

    @responses.activate
    def test_break_model_raises_on_4xx_from_break(self):
        base = "https://example.com"
        client = BreakerClient(api_key="k", endpoint=base, poll_interval=0, timeout=5)

        responses.add(
            responses.POST,
            f"{base}/break",
            body="bad request",
            status=400,
        )

        with self.assertRaises(BreakerError):
            client.break_model(
                target={"type": "openai", "model_name": "gpt-4o-mini"},
                description="test",
                num_tests=6,
            )

    @responses.activate
    def test_break_model_raises_on_poll_timeout(self):
        base = "https://example.com"
        client = BreakerClient(api_key="k", endpoint=base, poll_interval=0, timeout=0)

        responses.add(
            responses.POST,
            f"{base}/break",
            json={"report_id": "r2"},
            status=200,
        )
        responses.add(
            responses.GET,
            f"{base}/report/r2",
            json=_report_row(report_id="r2", status="processing", average_score=0.0),
            status=200,
        )

        with self.assertRaises(BreakerError):
            client.break_model(
                target={"type": "openai", "model_name": "gpt-4o-mini"},
                description="test",
                num_tests=6,
            )

    @responses.activate
    def test_break_model_fail_threshold_marks_report_failed(self):
        base = "https://example.com"
        client = BreakerClient(api_key="k", endpoint=base, poll_interval=0, timeout=5)

        responses.add(
            responses.POST,
            f"{base}/break",
            json={"report_id": "r3"},
            status=200,
        )
        responses.add(
            responses.GET,
            f"{base}/report/r3",
            json=_report_row(report_id="r3", status="done", average_score=4.0),
            status=200,
        )

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

