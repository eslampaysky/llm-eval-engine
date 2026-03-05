"""Domain contracts (ports) used by the application layer."""

from typing import Any, Protocol, Sequence

from .models import EvaluatedSample


class EvaluatorPort(Protocol):
    def evaluate_answer(self, question: str, ground_truth: str, model_answer: str) -> dict[str, Any]:
        ...


class MetricPort(Protocol):
    name: str

    def compute(self, evaluations: Sequence[EvaluatedSample]) -> dict[str, Any]:
        ...
