"""
api/multi_judge.py
==================
Parallel judge helpers for the /break evaluation flow.

Supports 1-N OpenAI-compatible judges running in parallel per test.
Always includes Groq as primary. Adds a secondary judge when
SECOND_JUDGE_API_KEY is set in the environment.

Wire-in — two changes to routes.py:
  1. Replace `from api.multi_judge import ...` import (see bottom of file).
  2. Replace _process_break_job body (see patch at bottom of file).
"""
from __future__ import annotations

import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import requests

_log = logging.getLogger(__name__)

# ── Secondary judge config (env-driven, opt-in) ───────────────────────────────
SECOND_JUDGE_BASE_URL = os.getenv("SECOND_JUDGE_BASE_URL", "https://api.openai.com/v1")
SECOND_JUDGE_MODEL    = os.getenv("SECOND_JUDGE_MODEL",    "gpt-4o-mini")
SECOND_JUDGE_API_KEY  = os.getenv("SECOND_JUDGE_API_KEY",  "")

# Scores (weighted 0–10) must differ by more than this to be flagged as disagreement
DISAGREEMENT_THRESHOLD = float(os.getenv("JUDGE_DISAGREEMENT_THRESHOLD", "2.5"))

_SCORE_PROMPT = """\
You are a strict evaluator for AI Breaker Lab.

Question: {question}
Ground Truth: {ground_truth}
Model Answer: {model_answer}

Return JSON only — no markdown, no extra text:
{{"correctness":0-10,"relevance":0-10,"hallucination":true/false,"reason":"one sentence"}}\
"""


# ── Single judge ──────────────────────────────────────────────────────────────

class _Judge:
    """Calls any OpenAI-compatible /chat/completions endpoint."""

    def __init__(self, name: str, api_key: str, base_url: str, model: str,
                 timeout: int = 120) -> None:
        self.name     = name
        self.api_key  = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.model    = model
        self.timeout  = timeout

    def score(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = _SCORE_PROMPT.format(
            question=question,
            ground_truth=ground_truth,
            model_answer=model_answer,
        )
        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}",
                         "Content-Type": "application/json"},
                json={"model": self.model, "temperature": 0.0,
                      "messages": [{"role": "system", "content": "Return valid JSON only."},
                                   {"role": "user",   "content": prompt}]},
                timeout=self.timeout,
            )
            resp.raise_for_status()
            raw = resp.json()["choices"][0]["message"]["content"]
            result = _parse_judge_json(raw)
            result["available"] = True
            return result
        except Exception as exc:
            _log.warning("[Judge:%s] failed: %s", self.name, exc)
            return {"correctness": 0.0, "relevance": 0.0, "hallucination": True,
                    "reason": f"Judge {self.name} error: {exc}", "available": False}


def _parse_judge_json(raw: str) -> dict:
    text = raw.strip()
    try:
        p = json.loads(text)
    except json.JSONDecodeError:
        s, e = text.find("{"), text.rfind("}")
        if s == -1 or e == -1:
            return {"correctness": 0.0, "relevance": 0.0,
                    "hallucination": True, "reason": "Invalid JSON from judge"}
        p = json.loads(text[s:e + 1])
    return {
        "correctness":   float(p.get("correctness",  0) or 0),
        "relevance":     float(p.get("relevance",    0) or 0),
        "hallucination": bool(p.get("hallucination", True)),
        "reason":        str(p.get("reason", "")).strip() or "No reason provided",
    }


# ── Agreement ─────────────────────────────────────────────────────────────────

def _weighted(c: float, r: float) -> float:
    return round(c * 0.6 + r * 0.4, 2)


def _agreement(judge_results: dict[str, dict]) -> tuple[bool, float]:
    """Returns (agreed, score_gap). agreed=True when gap <= threshold."""
    scores = [_weighted(v["correctness"], v["relevance"])
               for v in judge_results.values() if v.get("available", True)]
    if len(scores) < 2:
        return True, 0.0
    gap = max(scores) - min(scores)
    return gap <= DISAGREEMENT_THRESHOLD, round(gap, 2)


def compute_agreement_rate(results: list[dict]) -> float:
    """Fraction of rows where all judges agreed. 1.0 for single-judge runs."""
    if not results:
        return 1.0
    agreed = sum(1 for r in results if r.get("_judge_agreed", True))
    return round(agreed / len(results), 4)


# ── Core: score one test with all judges in parallel ─────────────────────────

def _score_one(
    question: str,
    ground_truth: str,
    model_answer: str,
    judges: list[_Judge],
) -> tuple[dict[str, dict], bool, float]:
    """
    Returns (judge_results, agreed, gap).
    Runs all judges concurrently.
    """
    judge_results: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=len(judges)) as pool:
        futures = {pool.submit(j.score, question, ground_truth, model_answer): j.name
                   for j in judges}
        for fut in as_completed(futures):
            name = futures[fut]
            try:
                judge_results[name] = fut.result()
            except Exception as exc:
                judge_results[name] = {"correctness": 0.0, "relevance": 0.0,
                                       "hallucination": True,
                                       "reason": f"Judge {name} exception: {exc}",
                                       "available": False}

    agreed, gap = _agreement(judge_results)
    return judge_results, agreed, gap


def _consensus(judge_results: dict[str, dict]) -> tuple[float, float, bool, str]:
    """Average available judges → consensus correctness/relevance/hallucination/reason."""
    available = {k: v for k, v in judge_results.items() if v.get("available", True)}
    if not available:
        return 0.0, 0.0, True, "All judges failed"

    n = len(available)
    avg_c = round(sum(v["correctness"] for v in available.values()) / n, 2)
    avg_r = round(sum(v["relevance"]   for v in available.values()) / n, 2)
    hall  = any(v["hallucination"] for v in available.values())   # conservative: any = True
    reason = " | ".join(f"{name}: {v['reason']}" for name, v in available.items())
    return avg_c, avg_r, hall, reason


# ── Public: score full test suite ─────────────────────────────────────────────

def score_answers(
    tests: list[dict],
    target_adapter: Any,
    judges: list[_Judge],
    call_delay_seconds: float = 5.0,
) -> list[dict]:
    """
    For every test:
      1. Call target model once.
      2. Score with all judges in parallel.
      3. Compute consensus (average available scores).
      4. Record agreement metadata.

    Preserves the exact row shape `compute_metrics()` and the report expect:
      correctness, relevance, hallucination, reason, judges{}, test_type, ...
    """
    rows: list[dict] = []

    for i, test in enumerate(tests):
        if i > 0 and call_delay_seconds > 0:
            time.sleep(call_delay_seconds)

        question     = str(test.get("question", ""))
        ground_truth = str(test.get("ground_truth", ""))
        test_type    = str(test.get("test_type", "factual"))

        # 1. Call target
        try:
            model_answer = target_adapter.call(question)
        except Exception as exc:
            # Synthesise a failed row — all judges get target-failure reason
            fail_reason = f"Target call failed: {exc}"
            rows.append({
                "question": question, "ground_truth": ground_truth,
                "model_answer": "", "test_type": test_type,
                "correctness": 0.0, "relevance": 0.0,
                "hallucination": True, "reason": fail_reason,
                "judges": {j.name: {"correctness": 0.0, "relevance": 0.0,
                                     "hallucination": True, "reason": fail_reason,
                                     "available": True}
                           for j in judges},
                "_judge_agreed": True, "_judge_gap": 0.0,
            })
            continue

        # 2. Score with all judges (parallel)
        judge_results, agreed, gap = _score_one(question, ground_truth, model_answer, judges)

        # 3. Consensus
        avg_c, avg_r, hall, reason = _consensus(judge_results)

        rows.append({
            "question":     question,
            "ground_truth": ground_truth,
            "model_answer": model_answer,
            "test_type":    test_type,
            "correctness":  avg_c,
            "relevance":    avg_r,
            "hallucination": hall,
            "reason":       reason,
            "judges":       judge_results,
            # Private agreement fields — consumed by compute_metrics + report
            "_judge_agreed": agreed,
            "_judge_gap":    gap,
        })

    return rows


# ── Public: build judge list from per-request key + env ──────────────────────

def build_judges(groq_api_key: str) -> list[_Judge]:
    """
    Always includes Groq as primary judge.
    Appends secondary judge when SECOND_JUDGE_API_KEY is set.
    """
    judges: list[_Judge] = [
        _Judge(name="groq", api_key=groq_api_key,
               base_url="https://api.groq.com/openai/v1",
               model="llama-3.3-70b-versatile"),
    ]
    second_key = SECOND_JUDGE_API_KEY.strip()
    if second_key:
        judges.append(
            _Judge(name="secondary", api_key=second_key,
                   base_url=SECOND_JUDGE_BASE_URL, model=SECOND_JUDGE_MODEL)
        )
        _log.info("[MultiJudge] secondary judge: %s @ %s", SECOND_JUDGE_MODEL, SECOND_JUDGE_BASE_URL)
    else:
        _log.info("[MultiJudge] single-judge mode (set SECOND_JUDGE_API_KEY to add a second judge)")
    return judges


