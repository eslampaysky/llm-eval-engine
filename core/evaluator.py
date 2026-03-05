"""Core evaluator API wrapper."""

from src.llm_eval_engine.infrastructure.config_loader import load_project_config
from core.pipeline import EvaluationPipeline
from core.providers import build_default_evaluator_registry

MAX_WORKERS = 1


def run_evaluation(
    file_path: str = None,
    samples: list = None,
    judge_model: str = None,
) -> list[dict]:
    config = load_project_config()
    registry = build_default_evaluator_registry()
    pipeline = EvaluationPipeline(config=config, evaluator_registry=registry, max_workers=MAX_WORKERS)
    return pipeline.run(file_path=file_path, samples=samples, judge_model=judge_model)
