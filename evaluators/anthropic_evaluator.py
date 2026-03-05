"""
anthropic_evaluator.py
Evaluator backed by Anthropic's Messages API (Claude models).

Setup:
    pip install anthropic
    export ANTHROPIC_API_KEY="sk-ant-..."
"""

import json
import os
import re
import time

from evaluators.base_evaluator import BaseEvaluator


class AnthropicEvaluator(BaseEvaluator):
    """Calls Anthropic's Messages endpoint."""

    def __init__(self, config: dict):
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "ANTHROPIC_API_KEY is not set. "
                "Export it with: export ANTHROPIC_API_KEY='sk-ant-...'"
            )

        try:
            import anthropic as _anthropic
        except ImportError:
            raise ImportError("Run: pip install anthropic")

        self.client = _anthropic.Anthropic(api_key=api_key)
        self.model = config.get("anthropic_model", "claude-haiku-4-5-20251001")
        self.temperature = float(config.get("temperature", 0.0))
        self.input_cost_per_1k = float(config.get("anthropic_input_cost_per_1k", 0.0008))
        self.output_cost_per_1k = float(config.get("anthropic_output_cost_per_1k", 0.004))

    def evaluate_answer(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = self.build_prompt(question, ground_truth, model_answer)
        started = time.perf_counter()

        try:
            message = self.client.messages.create(
                model=self.model,
                max_tokens=256,
                temperature=self.temperature,
                system=(
                    "You are a strict AI evaluator. "
                    "Always respond with valid JSON only - no markdown, no prose."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            raw_text = message.content[0].text if message.content else ""
            parsed = self._parse(raw_text)
            usage = getattr(message, "usage", None)
            input_tokens = int(getattr(usage, "input_tokens", 0) or 0) if usage else 0
            output_tokens = int(getattr(usage, "output_tokens", 0) or 0) if usage else 0
            total_tokens = input_tokens + output_tokens
            estimated_cost = ((input_tokens / 1000.0) * self.input_cost_per_1k) + ((output_tokens / 1000.0) * self.output_cost_per_1k)
            parsed["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 2)
            parsed["tokens_used"] = total_tokens if total_tokens > 0 else None
            parsed["cost_estimate_usd"] = round(estimated_cost, 6) if total_tokens > 0 else None
            return parsed

        except Exception as exc:
            result = dict(self.FALLBACK_RESULT)
            result["reason"] = f"AnthropicEvaluator error: {exc}"
            result["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 2)
            result["tokens_used"] = None
            result["cost_estimate_usd"] = None
            return result

    def _parse(self, text: str) -> dict:
        text = re.sub(r"```(?:json)?", "", text).strip()
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return dict(self.FALLBACK_RESULT)
        try:
            data = json.loads(match.group(0))
            return {
                "correctness": int(data.get("correctness", 0)),
                "relevance": int(data.get("relevance", 0)),
                "hallucination": bool(data.get("hallucination", True)),
                "reason": str(data.get("reason", "")),
            }
        except (json.JSONDecodeError, ValueError):
            return dict(self.FALLBACK_RESULT)
