"""
gemini_evaluator.py
Evaluator backed by Google's Gemini API.

Setup:
    pip install google-generativeai
    export GEMINI_API_KEY="AIza..."
"""

import json
import os
import re
import threading
import time

from evaluators.base_evaluator import BaseEvaluator

MAX_RETRIES = 3

_GEMINI_LOCK = threading.Lock()
_GEMINI_MIN_GAP = 4.0
_gemini_last_call = 0.0
_gemini_daily_cap_hit = False


def _acquire_gemini_slot():
    global _gemini_last_call
    with _GEMINI_LOCK:
        now = time.monotonic()
        wait = _GEMINI_MIN_GAP - (now - _gemini_last_call)
        if wait > 0:
            time.sleep(wait)
        _gemini_last_call = time.monotonic()


def _is_daily_cap(exc) -> bool:
    msg = str(exc)
    return "PerDay" in msg or "per_day" in msg.lower() or "GenerateRequestsPerDay" in msg


def _parse_retry_delay(exc) -> float | None:
    msg = str(exc)
    match = re.search(r"retry_delay\s*\{\s*seconds:\s*(\d+)", msg)
    if match:
        return float(match.group(1)) + 1.0
    match = re.search(r"retry in ([\d.]+)s", msg)
    if match:
        return float(match.group(1)) + 1.0
    return None


class GeminiEvaluator(BaseEvaluator):
    """Calls Google Gemini via the generativeai SDK."""

    def __init__(self, config: dict):
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY is not set. "
                "Get a key at https://aistudio.google.com/app/apikey then export GEMINI_API_KEY='AIza...'"
            )

        try:
            import google.generativeai as genai
        except ImportError:
            raise ImportError("Run: pip install google-generativeai")

        genai.configure(api_key=api_key)
        model_name = config.get("gemini_model", "gemini-2.0-flash")
        self.temperature = float(config.get("temperature", 0.0))

        generation_config = genai.GenerationConfig(
            temperature=self.temperature,
            response_mime_type="application/json",
        )
        self.input_cost_per_1k = float(config.get("gemini_input_cost_per_1k", 0.000075))
        self.output_cost_per_1k = float(config.get("gemini_output_cost_per_1k", 0.0003))
        self.model = genai.GenerativeModel(
            model_name=model_name,
            generation_config=generation_config,
            system_instruction=(
                "You are a strict AI evaluator. "
                "Always respond with valid JSON only - no markdown, no prose."
            ),
        )

    def evaluate_answer(self, question: str, ground_truth: str, model_answer: str) -> dict:
        global _gemini_daily_cap_hit

        if _gemini_daily_cap_hit:
            result = dict(self.FALLBACK_RESULT)
            result["reason"] = "Gemini daily quota exhausted - skipped for remainder of run. Try again tomorrow."
            result["latency_ms"] = None
            result["tokens_used"] = None
            result["cost_estimate_usd"] = None
            return result

        prompt = self.build_prompt(question, ground_truth, model_answer)
        started = time.perf_counter()

        for attempt in range(1, MAX_RETRIES + 1):
            _acquire_gemini_slot()

            try:
                response = self.model.generate_content(prompt)
                raw_text = response.text or ""
                parsed = self._parse(raw_text)
                usage = getattr(response, "usage_metadata", None)
                prompt_tokens = int(getattr(usage, "prompt_token_count", 0) or 0) if usage else 0
                completion_tokens = int(getattr(usage, "candidates_token_count", 0) or 0) if usage else 0
                total_tokens = int(getattr(usage, "total_token_count", 0) or (prompt_tokens + completion_tokens))
                estimated_cost = ((prompt_tokens / 1000.0) * self.input_cost_per_1k) + ((completion_tokens / 1000.0) * self.output_cost_per_1k)
                parsed["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 2)
                parsed["tokens_used"] = total_tokens if total_tokens > 0 else None
                parsed["cost_estimate_usd"] = round(estimated_cost, 6) if total_tokens > 0 else None
                return parsed

            except Exception as exc:
                is_rate_limit = "429" in str(exc) or "quota" in str(exc).lower()

                if is_rate_limit:
                    if _is_daily_cap(exc):
                        _gemini_daily_cap_hit = True
                        result = dict(self.FALLBACK_RESULT)
                        result["reason"] = "Gemini daily quota exhausted - skipped for remainder of run. Try again tomorrow."
                        result["latency_ms"] = round((time.perf_counter() - started) * 1000.0, 2)
                        result["tokens_used"] = None
                        result["cost_estimate_usd"] = None
                        return result

                    if attempt < MAX_RETRIES:
                        extra = _parse_retry_delay(exc) or (15.0 * attempt)
                        time.sleep(extra)
                        continue

                result = dict(self.FALLBACK_RESULT)
                result["reason"] = f"GeminiEvaluator error: {exc}"
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
