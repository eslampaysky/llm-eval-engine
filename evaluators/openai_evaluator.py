"""
openai_evaluator.py
Evaluator backed by OpenAI's Chat Completions API.

Setup:
    pip install openai
    export OPENAI_API_KEY="sk-..."
"""

import json
import os
import re
import time

from evaluators.base_evaluator import BaseEvaluator


class OpenAIEvaluator(BaseEvaluator):
    """Calls OpenAI's Chat Completions endpoint."""

    def __init__(self, config: dict):
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "OPENAI_API_KEY is not set. "
                "Export it with: export OPENAI_API_KEY='sk-...'"
            )

        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("Run: pip install openai")

        self.client = OpenAI(api_key=api_key)
        self.model = config.get("openai_model", "gpt-4o-mini")
        self.temperature = float(config.get("temperature", 0.0))
        self.input_cost_per_1k = float(config.get("openai_input_cost_per_1k", 0.00015))
        self.output_cost_per_1k = float(config.get("openai_output_cost_per_1k", 0.0006))

    def evaluate_answer(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = self.build_prompt(question, ground_truth, model_answer)
        started = time.perf_counter()

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                temperature=self.temperature,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are a strict AI evaluator. "
                            "Always respond with valid JSON only."
                        ),
                    },
                    {"role": "user", "content": prompt},
                ],
            )
            raw_text = response.choices[0].message.content or ""
            parsed = self._parse(raw_text)
            usage = getattr(response, "usage", None)
            prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0) if usage else 0
            completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0) if usage else 0
            total_tokens = int(getattr(usage, "total_tokens", 0) or (prompt_tokens + completion_tokens))
            estimated_cost = ((prompt_tokens / 1000.0) * self.input_cost_per_1k) + ((completion_tokens / 1000.0) * self.output_cost_per_1k)
            parsed["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 2)
            parsed["tokens_used"] = total_tokens if total_tokens > 0 else None
            parsed["cost_estimate_usd"] = round(estimated_cost, 6) if total_tokens > 0 else None
            return parsed

        except Exception as exc:
            result = dict(self.FALLBACK_RESULT)
            result["reason"] = f"OpenAIEvaluator error: {exc}"
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
