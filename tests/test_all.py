"""Tests for multi-judge logic, SDK models, and the GitHub Action runner."""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE not in sys.path:
    sys.path.insert(0, BASE)

import api.multi_judge as mj


def load_action_run_module():
    module_path = os.path.join(BASE, "github-action", "_run.py")
    spec = importlib.util.spec_from_file_location("github_action_run", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class TestAgreement(unittest.TestCase):
    def test_single_judge_always_agrees(self):
        agreed, gap = mj._agreement({"groq": {"correctness": 3.0, "relevance": 4.0, "available": True}})
        self.assertTrue(agreed)
        self.assertEqual(gap, 0.0)

    def test_two_judges_far_scores_disagree(self):
        agreed, gap = mj._agreement(
            {
                "groq": {"correctness": 9.0, "relevance": 9.0, "available": True},
                "secondary": {"correctness": 2.0, "relevance": 2.0, "available": True},
            }
        )
        self.assertFalse(agreed)
        self.assertGreater(gap, 2.5)

    def test_agreement_rate_half_agreed(self):
        results = [{"_judge_agreed": True}, {"_judge_agreed": False}]
        self.assertEqual(mj.compute_agreement_rate(results), 0.5)


class TestConsensus(unittest.TestCase):
    def test_two_judge_average(self):
        c, r, hall, reason = mj._consensus(
            {
                "groq": {"correctness": 8.0, "relevance": 6.0, "hallucination": False, "reason": "ok", "available": True},
                "secondary": {"correctness": 6.0, "relevance": 8.0, "hallucination": False, "reason": "fine", "available": True},
            }
        )
        self.assertAlmostEqual(c, 7.0)
        self.assertAlmostEqual(r, 7.0)
        self.assertFalse(hall)
        self.assertIn("groq", reason)
        self.assertIn("secondary", reason)

    def test_all_unavailable_fallback(self):
        c, r, hall, reason = mj._consensus(
            {"groq": {"correctness": 9.0, "relevance": 9.0, "hallucination": False, "reason": "x", "available": False}}
        )
        self.assertEqual(c, 0.0)
        self.assertEqual(r, 0.0)
        self.assertTrue(hall)
        self.assertIn("failed", reason.lower())


class TestScoreAnswers(unittest.TestCase):
    def _make_judge(self, name, correctness, relevance, hallucination=False):
        judge = mj._Judge(name=name, api_key="x", base_url="http://x", model="m")
        judge.score = lambda q, g, a: {
            "correctness": correctness,
            "relevance": relevance,
            "hallucination": hallucination,
            "reason": f"{name}-reason",
            "available": True,
        }
        return judge

    def test_target_failure_produces_row(self):
        adapter = MagicMock()
        adapter.call.side_effect = RuntimeError("timeout")
        rows = mj.score_answers(
            [{"question": "q", "ground_truth": "gt", "test_type": "adversarial"}],
            adapter,
            [self._make_judge("groq", 8.0, 7.0)],
            call_delay_seconds=0,
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["model_answer"], "")
        self.assertIn("Target call failed", rows[0]["reason"])

    def test_two_judges_produce_consensus(self):
        adapter = MagicMock()
        adapter.call.return_value = "answer"
        rows = mj.score_answers(
            [{"question": "q", "ground_truth": "gt", "test_type": "factual"}],
            adapter,
            [self._make_judge("groq", 8.0, 8.0), self._make_judge("secondary", 6.0, 6.0)],
            call_delay_seconds=0,
        )
        self.assertAlmostEqual(rows[0]["correctness"], 7.0)
        self.assertIn("secondary", rows[0]["judges"])


class TestBuildJudges(unittest.TestCase):
    def test_single_judge_when_no_second_key(self):
        original = mj.SECOND_JUDGE_API_KEY
        try:
            mj.SECOND_JUDGE_API_KEY = ""
            judges = mj.build_judges("groq-key")
        finally:
            mj.SECOND_JUDGE_API_KEY = original
        self.assertEqual(len(judges), 1)
        self.assertEqual(judges[0].name, "groq")

    def test_two_judges_when_second_key_set(self):
        original = mj.SECOND_JUDGE_API_KEY
        try:
            mj.SECOND_JUDGE_API_KEY = "openai-key"
            judges = mj.build_judges("groq-key")
        finally:
            mj.SECOND_JUDGE_API_KEY = original
        self.assertEqual(len(judges), 2)
        self.assertEqual(judges[1].name, "secondary")


class TestMetricsModel(unittest.TestCase):
    def test_defaults_on_empty_dict(self):
        from aibreaker.models import Metrics

        metrics = Metrics._from_dict({})
        self.assertEqual(metrics.average_score, 0.0)
        self.assertEqual(metrics.judges_agreement, 1.0)


class TestApiModels(unittest.TestCase):
    def test_break_request_defaults_language_to_auto(self):
        from api.models import BreakRequest

        payload = BreakRequest(
            target={"type": "openai", "model_name": "gpt-4o-mini"},
            description="Arabic support test",
        )
        self.assertEqual(payload.language, "auto")
        self.assertFalse(payload.force_refresh)


class TestReportModel(unittest.TestCase):
    def test_report_parses_failures(self):
        from aibreaker.models import Report

        report = Report._from_api(
            {
                "report_id": "abc-123",
                "status": "done",
                "metrics": {
                    "average_score": 7.0,
                    "total_samples": 10,
                    "hallucinations_detected": 1,
                    "low_quality_answers": 2,
                    "fail_threshold": 5.0,
                    "consistency_score": 7.0,
                    "judges_agreement": 1.0,
                    "red_flags": [],
                    "breakdown_by_type": {},
                    "judges": {},
                    "failed_rows": [
                        {
                            "question": "q",
                            "ground_truth": "gt",
                            "model_answer": "ma",
                            "test_type": "factual",
                            "score": 2.0,
                            "hallucination": False,
                            "reason": "wrong",
                        }
                    ],
                },
                "results": [],
                "html_report_url": "/report/abc-123/html",
            },
            base_url="https://example.com",
            fail_threshold=5.0,
        )
        self.assertTrue(report.passed)
        self.assertEqual(report.failure_count, 1)
        self.assertIn("example.com", report.html_report_url)


class TestActionRunner(unittest.TestCase):
    def test_build_target_openai(self):
        module = load_action_run_module()
        with patch.dict(
            os.environ,
            {
                "INPUT_TARGET_TYPE": "openai",
                "INPUT_TARGET_BASE_URL": "https://api.openai.com",
                "INPUT_TARGET_MODEL_NAME": "gpt-4o-mini",
                "INPUT_TARGET_API_KEY": "sk-xxx",
            },
            clear=False,
        ):
            target = module._build_target()
        self.assertEqual(target["type"], "openai")
        self.assertEqual(target["model_name"], "gpt-4o-mini")
        self.assertEqual(target["api_key"], "sk-xxx")

    def test_unknown_target_raises(self):
        module = load_action_run_module()
        with patch.dict(os.environ, {"INPUT_TARGET_TYPE": "bogus"}, clear=False):
            with self.assertRaises(ValueError):
                module._build_target()

    def test_main_returns_pass_exit_code(self):
        module = load_action_run_module()
        report = MagicMock()
        report.passed = True
        report.score = 7.5
        report.failure_count = 0
        report.report_url = "https://example.com/report/abc"
        report.metrics = MagicMock(red_flags=(), total_samples=20, judges_agreement=1.0)
        report.failures = []

        env = {
            "INPUT_API_KEY": "k",
            "INPUT_GROQ_API_KEY": "gk",
            "INPUT_DESCRIPTION": "test model",
            "INPUT_NUM_TESTS": "6",
            "INPUT_FAIL_THRESHOLD": "5.0",
            "INPUT_TARGET_TYPE": "openai",
            "INPUT_TARGET_MODEL_NAME": "gpt-4o-mini",
            "INPUT_ENDPOINT": "https://example.com",
            "INPUT_FORCE_REFRESH": "false",
        }
        with patch.dict(os.environ, env, clear=False):
            with patch("aibreaker.BreakerClient") as mock_client:
                mock_client.return_value.break_model.return_value = report
                code = module.main()
        self.assertEqual(code, 0)

    def test_main_returns_failure_when_missing_api_key(self):
        module = load_action_run_module()
        with patch.dict(
            os.environ,
            {"INPUT_API_KEY": "", "INPUT_DESCRIPTION": "test", "INPUT_TARGET_TYPE": "openai"},
            clear=False,
        ):
            self.assertEqual(module.main(), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
