"""Infrastructure factories for concrete evaluator adapters."""

from ..application.registry import EvaluatorDefinition, EvaluatorRegistry


def build_default_evaluator_registry() -> EvaluatorRegistry:
    registry = EvaluatorRegistry()

    from evaluators.anthropic_evaluator import AnthropicEvaluator
    from evaluators.ollama_evaluator import OllamaEvaluator
    from evaluators.openai_evaluator import OpenAIEvaluator
    from src.evaluators.gemini import GeminiEvaluator

    registry.register(
        EvaluatorDefinition(
            name="ollama",
            factory=lambda cfg: OllamaEvaluator(cfg),
            required_env_var=None,
        )
    )
    registry.register(
        EvaluatorDefinition(
            name="openai",
            factory=lambda cfg: OpenAIEvaluator(cfg),
            required_env_var="OPENAI_API_KEY",
        )
    )
    registry.register(
        EvaluatorDefinition(
            name="anthropic",
            factory=lambda cfg: AnthropicEvaluator(cfg),
            required_env_var="ANTHROPIC_API_KEY",
        )
    )
    registry.register(
        EvaluatorDefinition(
            name="gemini",
            factory=lambda cfg: GeminiEvaluator(cfg),
            required_env_var="GEMINI_API_KEY",
        )
    )
    registry.register(
        EvaluatorDefinition(
            name="google",
            factory=lambda cfg: GeminiEvaluator(cfg),
            required_env_var="GEMINI_API_KEY",
        )
    )

    return registry
