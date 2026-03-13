"""Backward-compatible entrypoint for running evaluations.

This module keeps the original public function `run_evaluation` while delegating
execution to the Clean Architecture pipeline.
"""

import os

try:
    from src.llm_eval_engine.application.pipeline import EvaluationPipeline
    from src.llm_eval_engine.infrastructure.config_loader import load_project_config
    from src.llm_eval_engine.infrastructure.evaluator_factories import build_default_evaluator_registry
except ImportError:
    from llm_eval_engine.application.pipeline import EvaluationPipeline
    from llm_eval_engine.infrastructure.config_loader import load_project_config
    from llm_eval_engine.infrastructure.evaluator_factories import build_default_evaluator_registry

MAX_WORKERS = int(os.getenv("MAX_WORKERS", "4"))


def run_evaluation(
    file_path: str = None,
    samples: list = None,
    judge_model: str = None,
) -> list[dict]:
    config = load_project_config()
    evaluator_registry = build_default_evaluator_registry()
    pipeline = EvaluationPipeline(
        config=config,
        evaluator_registry=evaluator_registry,
        max_workers=MAX_WORKERS,
    )
    return pipeline.run(file_path=file_path, samples=samples, judge_model=judge_model)
