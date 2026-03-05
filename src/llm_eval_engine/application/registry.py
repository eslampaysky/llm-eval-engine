"""Application-level registries for pluggable evaluators and metrics."""

from dataclasses import dataclass
from typing import Callable

from ..domain.contracts import EvaluatorPort, MetricPort


EvaluatorFactory = Callable[[dict], EvaluatorPort]


@dataclass(frozen=True)
class EvaluatorDefinition:
    name: str
    factory: EvaluatorFactory
    required_env_var: str | None = None


class EvaluatorRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, EvaluatorDefinition] = {}

    def register(self, definition: EvaluatorDefinition) -> None:
        self._definitions[definition.name.lower()] = definition

    def get(self, provider_name: str) -> EvaluatorDefinition:
        key = provider_name.strip().lower()
        if key not in self._definitions:
            raise ValueError(f"Unknown provider '{provider_name}'.")
        return self._definitions[key]


class MetricRegistry:
    def __init__(self) -> None:
        self._metrics: dict[str, MetricPort] = {}

    def register(self, metric: MetricPort) -> None:
        self._metrics[metric.name] = metric

    def compute_all(self, evaluations):
        output: dict[str, object] = {}
        for metric in self._metrics.values():
            output.update(metric.compute(evaluations))
        return output
