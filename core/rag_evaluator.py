from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Iterable


def _split_sentences(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    # Simple, language-agnostic sentence splitter.
    parts = re.split(r"[\.!\?]+[\s\n]+", text)
    return [p.strip() for p in parts if p.strip()]


def _tokenize(text: str) -> list[str]:
    text = (text or "").lower()
    return re.findall(r"[a-z0-9]+", text)


@dataclass
class RagEvaluationResult:
    faithfulness: float
    hit_rate: float
    mrr: float
    hallucination: bool
    reason: str
    overall_score: float


class RagEvaluator:
    """
    Lightweight RAG evaluator built on top of an LLM judge client.

    The judge_client is expected to expose a `generate(prompt: str) -> str` method,
    such as `GroqJudgeClient`. The judge is only used for the faithfulness score.
    """

    def __init__(self, judge_client: Any) -> None:
        self._judge_client = judge_client

    # ── Public API ──────────────────────────────────────────────────────────────

    def evaluate_rag_sample(
        self,
        *,
        question: str,
        context_docs: list[str],
        ground_truth: str,
        model_answer: str,
    ) -> dict:
        """
        Evaluate a single RAG sample.

        Returns a dict:
        {
          faithfulness: float (0-10),
          hit_rate: float (0-1),
          mrr: float (0-1),
          hallucination: bool,
          reason: str,
          overall_score: float (0-10)
        }
        """
        faithfulness, reason = self._compute_faithfulness(
            question=question,
            context_docs=context_docs,
            model_answer=model_answer,
        )
        hit_rate = self._compute_hit_rate(model_answer=model_answer, context_docs=context_docs)
        mrr = self._compute_mrr(question=question, context_docs=context_docs)
        hallucination = bool(faithfulness < 5.0)
        overall_score = self._compute_overall_score(
            faithfulness=faithfulness,
            hit_rate=hit_rate,
            mrr=mrr,
        )

        return {
            "faithfulness": faithfulness,
            "hit_rate": hit_rate,
            "mrr": mrr,
            "hallucination": hallucination,
            "reason": reason,
            "overall_score": overall_score,
        }

    # ── Metrics ────────────────────────────────────────────────────────────────

    def _compute_faithfulness(
        self,
        *,
        question: str,
        context_docs: list[str],
        model_answer: str,
    ) -> tuple[float, str]:
        """
        Call the judge with the RAG-specific faithfulness prompt.
        """
        docs_text = "\n\n".join(
            f"Document {i + 1}:\n{doc.strip()}"
            for i, doc in enumerate(context_docs or [])
            if str(doc or "").strip()
        )
        prompt = (
            "You are a strict evaluator for retrieval-augmented generation.\n\n"
            f"Question:\n{question.strip()}\n\n"
            f"Context documents:\n{docs_text or '[no context provided]'}\n\n"
            f"Model answer:\n{model_answer.strip()}\n\n"
            "Given these context documents — is this answer faithful to the context?\n"
            "Answer ONLY valid JSON in this format:\n"
            '{\"score\": 0-10, \"reason\": \"short explanation\"}'
        )
        try:
            raw = self._judge_client.generate(prompt)
        except Exception as exc:
            return 0.0, f"Judge call failed: {exc}"

        # Best-effort JSON extraction.
        text = str(raw or "").strip()
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start == -1 or end == -1 or end <= start:
                return 0.0, "Invalid JSON from judge"
            try:
                payload = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return 0.0, "Invalid JSON from judge"

        score = float(payload.get("score", 0) or 0)
        score = max(0.0, min(10.0, score))
        reason = str(payload.get("reason", "")).strip() or "No reason provided"
        return score, reason

    def _compute_hit_rate(
        self,
        *,
        model_answer: str,
        context_docs: list[str],
        threshold: float = 0.6,
    ) -> float:
        """
        hit_rate: fraction of answer sentences that appear (fuzzy) in any context doc.
        """
        sentences = _split_sentences(model_answer)
        if not sentences or not context_docs:
            return 0.0

        docs_text = [str(doc or "") for doc in context_docs]
        hits = 0
        for sent in sentences:
            sent_l = sent.lower()
            matched = False
            for doc in docs_text:
                ratio = SequenceMatcher(None, sent_l, doc.lower()).ratio()
                if ratio >= threshold:
                    matched = True
                    break
            if matched:
                hits += 1

        return hits / len(sentences) if sentences else 0.0

    def _compute_mrr(
        self,
        *,
        question: str,
        context_docs: list[str],
    ) -> float:
        """
        mrr: Mean Reciprocal Rank based on simple term-frequency overlap between
        the question and each context document.
        """
        if not context_docs:
            return 0.0

        q_tokens = _tokenize(question)
        if not q_tokens:
            return 0.0

        q_counter = Counter(q_tokens)

        def _score(doc: str) -> int:
            tokens = _tokenize(doc)
            if not tokens:
                return 0
            d_counter = Counter(tokens)
            overlap = 0
            for tok, q_tf in q_counter.items():
                if tok in d_counter:
                    overlap += min(q_tf, d_counter[tok])
            return overlap

        scored_docs: list[tuple[int, int]] = []
        for idx, doc in enumerate(context_docs):
            scored_docs.append((idx, _score(str(doc or ""))))

        # Sort by descending overlap score; stable for equal scores.
        scored_docs.sort(key=lambda x: x[1], reverse=True)

        rank = 1
        for original_idx, score in scored_docs:
            if score > 0:
                return 1.0 / rank
            rank += 1
        return 0.0

    def _compute_overall_score(
        self,
        *,
        faithfulness: float,
        hit_rate: float,
        mrr: float,
    ) -> float:
        """
        Combine the three metrics into a single 0-10 overall score.
        """
        # Normalize all metrics to [0, 1] and average, then rescale to [0, 10].
        components: Iterable[float] = [
            (faithfulness / 10.0) if faithfulness is not None else 0.0,
            hit_rate if hit_rate is not None else 0.0,
            mrr if mrr is not None else 0.0,
        ]
        values = [max(0.0, min(1.0, float(v))) for v in components]
        overall_norm = sum(values) / len(values) if values else 0.0
        overall = overall_norm * 10.0
        return round(max(0.0, min(10.0, overall)), 2)

