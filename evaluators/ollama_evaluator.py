"""
ollama_evaluator.py
Free, local evaluator using Ollama. No API key required.
"""

import json
import re
import time

import requests

from evaluators.base_evaluator import BaseEvaluator


class OllamaEvaluator(BaseEvaluator):
    """Calls a locally-running Ollama server."""

    def __init__(self, config: dict):
        self.url = config.get("ollama_url", "http://localhost:11434") + "/api/generate"
        self.model = config.get("ollama_model", "llama3")
        self.temperature = float(config.get("temperature", 0.0))

    def evaluate_answer(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = self.build_prompt(question, ground_truth, model_answer)
        started = time.perf_counter()

        try:
            response = requests.post(
                self.url,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": self.temperature},
                },
                timeout=60,
            )
            response.raise_for_status()
            payload = response.json()
            raw_text = payload["response"]
            parsed = self._parse(raw_text)
            tokens_used = int((payload.get("prompt_eval_count") or 0) + (payload.get("eval_count") or 0)) or None
            latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
            parsed["latency_ms"] = latency_ms
            parsed["tokens_used"] = tokens_used
            parsed["cost_estimate_usd"] = 0.0 if tokens_used is not None else None
            return parsed

        except Exception as exc:
            result = dict(self.FALLBACK_RESULT)
            result["reason"] = f"OllamaEvaluator error: {exc}"
            result["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 2)
            result["tokens_used"] = None
            result["cost_estimate_usd"] = None
            return result

    def _parse(self, text: str) -> dict:
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
