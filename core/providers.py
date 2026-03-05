"""Core provider wiring entrypoint."""

from src.llm_eval_engine.infrastructure.evaluator_factories import build_default_evaluator_registry

__all__ = ["build_default_evaluator_registry"]
