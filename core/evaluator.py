"""Core evaluator API wrapper."""

import logging
import os
import time

from src.llm_eval_engine.infrastructure.config_loader import load_project_config
from src.llm_eval_engine.application.pipeline import EvaluationPipeline
from core.providers import build_default_evaluator_registry

MAX_WORKERS = int(os.getenv("MAX_WORKERS", "4"))
_log = logging.getLogger(__name__)


def run_evaluation(
    file_path: str = None,
    samples: list = None,
    judge_model: str = None,
) -> list[dict]:
    _log.info(
        "[Eval] Started file_path=%s samples=%d judge_model=%s",
        file_path,
        len(samples) if samples is not None else 0,
        judge_model,
    )
    started = time.monotonic()
    try:
        config = load_project_config()
        registry = build_default_evaluator_registry()
        pipeline = EvaluationPipeline(config=config, evaluator_registry=registry, max_workers=MAX_WORKERS)
        results = pipeline.run(file_path=file_path, samples=samples, judge_model=judge_model)
    except Exception as exc:
        _log.error("[Eval] Failed: %s", exc, exc_info=True)
        raise

    _log.info(
        "[Eval] Completed results=%d elapsed_s=%.3f",
        len(results) if results is not None else 0,
        time.monotonic() - started,
    )
    return results
