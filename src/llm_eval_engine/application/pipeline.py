"""Use case: run evaluation with pluggable evaluators."""

from __future__ import annotations

import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict

import pandas as pd

from .registry import EvaluatorRegistry
from ..domain.models import EvaluatedSample, EvaluationSample, JudgeResult
from validators import FusingRegistry
try:
    from src.target_adapter import AdapterFactory, BaseTargetAdapter
except ImportError:
    from target_adapter import AdapterFactory, BaseTargetAdapter

PLACEHOLDER_PATTERNS = [
    "your_key_here",
    "your_key",
    "placeholder",
    "sk-xxx",
    "sk_test",
    "insert_key",
    "add_key",
    "api_key_here",
]


def _is_placeholder(value: str) -> bool:
    lowered = value.strip().lower()
    return any(pattern in lowered for pattern in PLACEHOLDER_PATTERNS)


class EvaluationPipeline:
    def __init__(
        self,
        config: dict,
        evaluator_registry: EvaluatorRegistry,
        max_workers: int = 1,
    ) -> None:
        self._config = config
        self._evaluator_registry = evaluator_registry
        self._max_workers = max_workers
        self._target_adapter = self._build_target_adapter(config)

    def _build_target_adapter(self, config: dict) -> BaseTargetAdapter:
        target_config = config.get("target_model")
        if not isinstance(target_config, dict):
            raise ValueError("Missing 'target_model' config. Add target adapter settings in config.yaml.")
        return AdapterFactory.from_config(target_config)

    def run(
        self,
        file_path: str | None = None,
        samples: list[dict] | None = None,
        judge_model: str | None = None,
    ) -> list[dict]:
        providers = self._resolve_providers(judge_model)
        loaded_evaluators, skipped = self._load_evaluators(providers)

        if not loaded_evaluators:
            raise RuntimeError(
                "No providers could be loaded. "
                f"Skipped: {[provider for provider, _ in skipped]}. "
                "Make sure Ollama is running or add real API keys to .env"
            )

        evaluation_samples = self._load_samples(file_path=file_path, samples=samples)
        rows = [None] * len(evaluation_samples)

        with ThreadPoolExecutor(max_workers=self._max_workers) as executor:
            futures = {
                executor.submit(
                    self._evaluate_single_sample,
                    sample,
                    loaded_evaluators,
                    skipped,
                ): idx
                for idx, sample in enumerate(evaluation_samples)
            }
            for future in as_completed(futures):
                rows[futures[future]] = asdict(future.result())

        return rows

    def _resolve_providers(self, judge_model: str | None) -> list[str]:
        if judge_model:
            return [judge_model]

        raw = self._config.get("judge_providers", self._config.get("judge_provider", "ollama"))
        return raw if isinstance(raw, list) else [raw]

    def _load_evaluators(self, providers: list[str]):
        evaluators = {}
        skipped = []

        for provider in providers:
            provider_key = provider.strip().lower()
            definition = self._evaluator_registry.get(provider_key)

            if definition.required_env_var:
                env_value = os.environ.get(definition.required_env_var, "")
                if not env_value:
                    skipped.append((provider_key, f"no {definition.required_env_var} in .env"))
                    continue
                if _is_placeholder(env_value):
                    skipped.append((provider_key, f"{definition.required_env_var} is still a placeholder - add a real key"))
                    continue

            try:
                evaluators[provider_key] = definition.factory(self._config)
            except ImportError as exc:
                skipped.append((provider_key, f"SDK not installed: {exc}"))
            except Exception as exc:
                skipped.append((provider_key, str(exc)))

        return evaluators, skipped

    def _load_samples(self, file_path: str | None, samples: list[dict] | None) -> list[EvaluationSample]:
        if samples is not None:
            return [
                EvaluationSample(
                    question=str(sample["question"]),
                    ground_truth=str(sample["ground_truth"]),
                    model_answer=str(sample.get("model_answer", "")),
                    context=str(sample.get("context")) if sample.get("context") is not None else None,
                    question_type=str(sample.get("question_type")) if sample.get("question_type") is not None else None,
                )
                for sample in samples
            ]

        if file_path:
            frame = pd.read_csv(file_path)
            required_columns = {"question", "ground_truth"}
            missing = required_columns - set(frame.columns)
            if missing:
                raise ValueError(f"CSV missing columns: {missing}")
            return [
                EvaluationSample(
                    question=str(row["question"]),
                    ground_truth=str(row["ground_truth"]),
                    model_answer=str(row.get("model_answer", "")),
                    context=str(row["context"]) if row.get("context") is not None else None,
                    question_type=str(row.get("question_type")) if row.get("question_type") is not None else None,
                )
                for row in frame.to_dict(orient="records")
            ]

        raise ValueError("Provide either file_path or samples")

    def _evaluate_single_sample(self, sample, evaluators: dict, skipped: list[tuple[str, str]]) -> EvaluatedSample:
        try:
            target_answer = self._target_adapter.call(sample.question)
        except Exception as exc:
            failure_reason = f"Target adapter error: {exc}"
            fusing_result = None
            if getattr(sample, "question_type", None):
                validator = FusingRegistry.get(sample.question_type)
                if validator:
                    fusing_result = validator.validate("")
            unavailable = {
                provider: JudgeResult(
                    correctness=None,
                    relevance=None,
                    hallucination=None,
                    reason=failure_reason,
                    available=False,
                )
                for provider in set(list(evaluators.keys()) + [provider for provider, _ in skipped])
            }
            return EvaluatedSample(
                question=sample.question,
                ground_truth=sample.ground_truth,
                model_answer="",
                context=sample.context,
                correctness=0.0,
                relevance=0.0,
                hallucination=True,
                reason=failure_reason,
                judges=unavailable,
                fusing_result=fusing_result,
            )

        judge_results: dict[str, JudgeResult] = {
            provider: JudgeResult(
                correctness=None,
                relevance=None,
                hallucination=None,
                reason=f"N/A - {reason}",
                available=False,
            )
            for provider, reason in skipped
        }

        for provider, evaluator in evaluators.items():
            started = time.perf_counter()
            try:
                raw = evaluator.evaluate_answer(
                    question=sample.question,
                    ground_truth=sample.ground_truth,
                    model_answer=target_answer,
                )
                latency_ms = raw.get("latency_ms")
                if latency_ms is None:
                    latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
                judge_results[provider] = JudgeResult(
                    correctness=raw.get("correctness"),
                    relevance=raw.get("relevance"),
                    hallucination=raw.get("hallucination"),
                    reason=str(raw.get("reason", "")),
                    available=True,
                    latency_ms=float(latency_ms) if latency_ms is not None else None,
                    tokens_used=int(raw.get("tokens_used")) if raw.get("tokens_used") is not None else None,
                    cost_estimate_usd=float(raw.get("cost_estimate_usd")) if raw.get("cost_estimate_usd") is not None else None,
                )
            except Exception as exc:
                judge_results[provider] = JudgeResult(
                    correctness=None,
                    relevance=None,
                    hallucination=None,
                    reason=f"Error: {exc}",
                    available=False,
                    latency_ms=round((time.perf_counter() - started) * 1000.0, 2),
                )

        available = [result for result in judge_results.values() if result.available]

        clean = [
            result for result in available
            if not result.reason.startswith((
                "GeminiEvaluator error",
                "OpenAIEvaluator error",
                "AnthropicEvaluator error",
                "OllamaEvaluator error",
            ))
        ]
        hallucination_source = clean if clean else available

        if available:
            avg_correctness = round(sum(float(item.correctness) for item in available) / len(available), 2)
            avg_relevance = round(sum(float(item.relevance) for item in available) / len(available), 2)
            hallucination = any(bool(item.hallucination) for item in hallucination_source) if hallucination_source else False
        else:
            avg_correctness, avg_relevance, hallucination = 0.0, 0.0, True

        composed_reason = " | ".join(
            f"{provider}: {result.reason}" for provider, result in judge_results.items()
        )

        fusing_result = None
        if getattr(sample, "question_type", None):
            validator = FusingRegistry.get(sample.question_type)
            if validator:
                fusing_result = validator.validate(target_answer)

        return EvaluatedSample(
            question=sample.question,
            ground_truth=sample.ground_truth,
            model_answer=target_answer,
            context=sample.context,
            correctness=avg_correctness,
            relevance=avg_relevance,
            hallucination=hallucination,
            reason=composed_reason,
            judges=judge_results,
            fusing_result=fusing_result,
        )
