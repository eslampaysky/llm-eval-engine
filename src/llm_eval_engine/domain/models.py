"""Canonical domain dataclasses for the packaged architecture."""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class EvaluationSample:
    question: str
    ground_truth: str
    model_answer: str
    context: Optional[str] = None
    question_type: Optional[str] = None


@dataclass
class JudgeResult:
    correctness: Optional[float]
    relevance: Optional[float]
    hallucination: Optional[bool]
    reason: str
    available: bool
    latency_ms: Optional[float] = None
    tokens_used: Optional[int] = None
    cost_estimate_usd: Optional[float] = None


@dataclass
class EvaluatedSample:
    question: str
    ground_truth: str
    model_answer: str
    context: Optional[str]
    correctness: float
    relevance: float
    hallucination: bool
    reason: str
    judges: dict[str, JudgeResult]
    fusing_result: Optional[dict] = None


__all__ = ["EvaluationSample", "EvaluatedSample", "JudgeResult"]
