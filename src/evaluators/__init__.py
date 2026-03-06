"""Evaluator adapters and registry compatibility package."""

from .registry import EvaluatorDefinition, EvaluatorRegistry, build_default_registry

__all__ = ["EvaluatorDefinition", "EvaluatorRegistry", "build_default_registry"]
