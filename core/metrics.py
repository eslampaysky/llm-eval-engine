"""Core metrics API wrapper."""

from src.llm_eval_engine.application.metrics import build_default_metric_registry
from src.llm_eval_engine.domain.models import EvaluatedSample, JudgeResult
from src.llm_eval_engine.infrastructure.config_loader import load_project_config


def _to_domain_rows(results: list[dict]) -> list[EvaluatedSample]:
    rows: list[EvaluatedSample] = []
    for result in results:
        judges = {
            provider: JudgeResult(
                correctness=payload.get("correctness"),
                relevance=payload.get("relevance"),
                hallucination=payload.get("hallucination"),
                reason=str(payload.get("reason", "")),
                available=bool(payload.get("available", False)),
                latency_ms=float(payload.get("latency_ms")) if payload.get("latency_ms") is not None else None,
                tokens_used=int(payload.get("tokens_used")) if payload.get("tokens_used") is not None else None,
                cost_estimate_usd=float(payload.get("cost_estimate_usd")) if payload.get("cost_estimate_usd") is not None else None,
            )
            for provider, payload in result.get("judges", {}).items()
        }
        rows.append(
            EvaluatedSample(
                question=str(result.get("question", "")),
                ground_truth=str(result.get("ground_truth", "")),
                model_answer=str(result.get("model_answer", "")),
                context=str(result.get("context")) if result.get("context") is not None else None,
                correctness=float(result.get("correctness", 0) or 0),
                relevance=float(result.get("relevance", 0) or 0),
                hallucination=bool(result.get("hallucination", False)),
                reason=str(result.get("reason", "")),
                judges=judges,
            )
        )
    return rows


def compute_metrics(results: list[dict], fail_threshold: float = 5.0) -> dict:
    if not results:
        raise ValueError("results list is empty - nothing to compute metrics on.")

    config = load_project_config()
    correctness_weight = float(config.get("correctness_weight", 0.6))
    relevance_weight = float(config.get("relevance_weight", 0.4))
    toxicity_threshold = float(config.get("toxicity_threshold", 0.1))

    registry = build_default_metric_registry(
        correctness_weight=correctness_weight,
        relevance_weight=relevance_weight,
        fail_threshold=fail_threshold,
        toxicity_threshold=toxicity_threshold,
    )
    return registry.compute_all(_to_domain_rows(results))
