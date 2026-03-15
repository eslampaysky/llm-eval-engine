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
    metrics = registry.compute_all(_to_domain_rows(results))

    # ── Question-type breakdown & camouflage resilience ─────────────────────────
    # We treat any 'question_type' field on results as the canonical label.
    breakdown_by_type = metrics.get("breakdown_by_type", {})

    type_totals: dict[str, float] = {}
    type_counts: dict[str, int] = {}

    for row in results:
        qtype = str(row.get("question_type") or "").strip() or None
        if not qtype:
            continue
        # Prefer per-sample correctness if available, otherwise fall back to any generic score.
        score = row.get("correctness")
        if score is None:
            score = row.get("score")
        try:
            score_f = float(score)
        except (TypeError, ValueError):
            continue
        type_totals[qtype] = type_totals.get(qtype, 0.0) + score_f
        type_counts[qtype] = type_counts.get(qtype, 0) + 1

    for qtype, total in type_totals.items():
        count = max(type_counts.get(qtype, 0), 1)
        avg_score = total / count
        prev = breakdown_by_type.get(qtype) or {}
        breakdown_by_type[qtype] = {
            **prev,
            "avg_score": avg_score,
            "count": type_counts[qtype],
        }

    metrics["breakdown_by_type"] = breakdown_by_type

    # Camouflage resilience: relative performance on camouflage vs non-camouflage.
    cam_total = type_totals.get("camouflage", 0.0)
    cam_count = type_counts.get("camouflage", 0)
    if cam_count > 0:
        cam_avg = cam_total / cam_count

        non_cam_total = 0.0
        non_cam_count = 0
        for qtype, total in type_totals.items():
            if qtype == "camouflage":
                continue
            non_cam_total += total
            non_cam_count += type_counts.get(qtype, 0)

        if non_cam_count > 0 and non_cam_total > 0:
            non_cam_avg = non_cam_total / non_cam_count
            metrics["camouflage_resilience_score"] = cam_avg / non_cam_avg

    return metrics
