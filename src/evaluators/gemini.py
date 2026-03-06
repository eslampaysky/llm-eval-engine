"""Gemini evaluator adapter compatible with the existing pipeline contract."""

from evaluators.gemini_evaluator import GeminiEvaluator as _GeminiEvaluator


class GeminiEvaluator(_GeminiEvaluator):
    def __init__(self, config: dict):
        merged_config = dict(config or {})
        merged_config.setdefault("gemini_model", "gemini-1.5-flash")
        super().__init__(merged_config)
