"""Evaluator registry shim for src/evaluators import paths."""

from dataclasses import dataclass
from typing import Callable


EvaluatorFactory = Callable[[dict], object]


@dataclass(frozen=True)
class EvaluatorDefinition:
    required_env_var: str | None
    factory: EvaluatorFactory


class EvaluatorRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, EvaluatorDefinition] = {}

    def register(self, provider_key: str, definition: EvaluatorDefinition) -> None:
        self._definitions[provider_key.strip().lower()] = definition

    def get(self, provider_key: str) -> EvaluatorDefinition:
        key = provider_key.strip().lower()
        if key not in self._definitions:
            raise ValueError(f"Unknown provider '{provider_key}'.")
        return self._definitions[key]


def build_default_registry() -> EvaluatorRegistry:
    from evaluators.anthropic_evaluator import AnthropicEvaluator
    from src.evaluators.gemini import GeminiEvaluator
    from evaluators.ollama_evaluator import OllamaEvaluator
    from evaluators.openai_evaluator import OpenAIEvaluator

    registry = EvaluatorRegistry()
    registry.register("gemini", EvaluatorDefinition(required_env_var="GEMINI_API_KEY", factory=lambda cfg: GeminiEvaluator(cfg)))
    registry.register("openai", EvaluatorDefinition(required_env_var="OPENAI_API_KEY", factory=lambda cfg: OpenAIEvaluator(cfg)))
    registry.register("anthropic", EvaluatorDefinition(required_env_var="ANTHROPIC_API_KEY", factory=lambda cfg: AnthropicEvaluator(cfg)))
    registry.register("ollama", EvaluatorDefinition(required_env_var=None, factory=lambda cfg: OllamaEvaluator(cfg)))
    return registry
