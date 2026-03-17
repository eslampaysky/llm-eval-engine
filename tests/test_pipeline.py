"""Tests for the evaluation pipeline and metrics."""

from __future__ import annotations

from unittest.mock import patch

from src.core_engine.application.registry import EvaluatorDefinition, EvaluatorRegistry
from src.metrics import compute_metrics
from src.core_engine.application.pipeline import EvaluationPipeline


class _FakeEvaluator:
    def evaluate_answer(self, *, question: str, ground_truth: str, model_answer: str) -> dict:
        if question == "q1":
            return {
                "correctness": 8.0,
                "relevance": 8.0,
                "hallucination": False,
                "reason": "ok",
            }
        return {
            "correctness": 2.0,
            "relevance": 2.0,
            "hallucination": True,
            "reason": "bad",
        }


class _FakeAdapter:
    def call(self, question: str) -> str:
        return f"answer to {question}"


def test_pipeline_and_metrics() -> None:
    registry = EvaluatorRegistry()
    registry.register(EvaluatorDefinition(name="fake", factory=lambda _cfg: _FakeEvaluator()))

    config = {"target_model": {"type": "openai", "base_url": "http://example.com", "model_name": "x"}}

    with patch("src.core_engine.application.pipeline.AdapterFactory.from_config", return_value=_FakeAdapter()):
        pipeline = EvaluationPipeline(config=config, evaluator_registry=registry, max_workers=1)
        rows = pipeline.run(
            samples=[
                {"question": "q1", "ground_truth": "gt1"},
                {"question": "q2", "ground_truth": "gt2"},
            ],
            judge_model="fake",
        )

    metrics = compute_metrics(rows, fail_threshold=5.0)
    assert metrics["average_score"] == 5.0
    assert metrics["hallucinations_detected"] == 1
    assert metrics["breakdown_by_type"]["unknown"]["count"] == 2
    assert len(metrics["failed_rows"]) == 1
    assert metrics["failed_rows"][0]["question"] == "q2"
