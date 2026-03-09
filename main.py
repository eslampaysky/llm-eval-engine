from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import yaml
from dotenv import load_dotenv

from reports.report_generator import ReportGenerator
from src.metrics import compute_metrics
from src.target_adapter import AdapterFactory
from src.test_generator import GroqJudgeClient, TestSuiteGenerator

load_dotenv()


class GroqAnswerJudge:
    """Judge model answers using Groq Chat Completions."""

    def __init__(self, api_key: str, model: str, base_url: str = "https://api.groq.com/openai/v1") -> None:
        self.client = GroqJudgeClient(
            api_key=api_key,
            base_url=base_url,
            model=model,
            timeout_seconds=120,
        )

    def score(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = f"""
You are a strict evaluator for AI Breaker Lab.

Question: {question}
Ground Truth: {ground_truth}
Model Answer: {model_answer}

Score and return JSON only:
{{
  "correctness": 0-10,
  "relevance": 0-10,
  "hallucination": true/false,
  "reason": "short explanation"
}}
""".strip()
        raw = self.client.generate(prompt)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find("{")
            end = raw.rfind("}")
            if start == -1 or end == -1:
                return {
                    "correctness": 0,
                    "relevance": 0,
                    "hallucination": True,
                    "reason": "Judge returned invalid JSON",
                }
            payload = json.loads(raw[start : end + 1])

        return {
            "correctness": float(payload.get("correctness", 0) or 0),
            "relevance": float(payload.get("relevance", 0) or 0),
            "hallucination": bool(payload.get("hallucination", True)),
            "reason": str(payload.get("reason", "")).strip() or "No reason provided",
        }


def _load_config(path: str | None) -> dict:
    if not path:
        return {}
    if not Path(path).exists():
        raise FileNotFoundError(f"Config file not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    return _expand_env(raw)


def _expand_env(value):
    if isinstance(value, dict):
        return {k: _expand_env(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_expand_env(v) for v in value]
    if isinstance(value, str):
        return os.path.expandvars(value)
    return value


def _resolve_test_suite(generator: TestSuiteGenerator, config: dict) -> list[dict]:
    test_cfg = config.get("test_suite", {}) or {}
    domain = str(test_cfg.get("domain", "")).strip()
    description = str(test_cfg.get("model_description", "")).strip()
    num_tests = int(test_cfg.get("num_tests", 20) or 20)

    if description:
        return generator.generate_from_description(description=description, num_tests=num_tests)
    if domain:
        return generator.generate(domain=domain, num_tests=num_tests)
    raise ValueError("test_suite requires at least one of: domain or model_description")


def _run_eval(test_suite: list[dict], target_cfg: dict, judge_cfg: dict) -> tuple[list[dict], dict]:
    target_adapter = AdapterFactory.from_config(target_cfg)
    judge = GroqAnswerJudge(
        api_key=str(judge_cfg.get("api_key", "")).strip() or os.getenv("GROQ_API_KEY", "").strip(),
        model=str(judge_cfg.get("model", "llama-3.3-70b-versatile")),
    )

    if not judge.client.api_key:
        raise ValueError("Missing judge.api_key and GROQ_API_KEY")

    rows: list[dict] = []
    for test in test_suite:
        question = str(test.get("question", ""))
        ground_truth = str(test.get("ground_truth", ""))
        test_type = str(test.get("test_type", "factual"))

        try:
            model_answer = target_adapter.call(question)
        except Exception as exc:
            model_answer = ""
            scored = {
                "correctness": 0.0,
                "relevance": 0.0,
                "hallucination": True,
                "reason": f"Target call failed: {exc}",
            }
        else:
            try:
                scored = judge.score(question, ground_truth, model_answer)
            except Exception as exc:
                scored = {
                    "correctness": 0.0,
                    "relevance": 0.0,
                    "hallucination": True,
                    "reason": f"Judge failed: {exc}",
                }

        rows.append(
            {
                "question": question,
                "ground_truth": ground_truth,
                "model_answer": model_answer,
                "test_type": test_type,
                "correctness": scored["correctness"],
                "relevance": scored["relevance"],
                "hallucination": scored["hallucination"],
                "reason": scored["reason"],
                "judges": {
                    "groq": {
                        "correctness": scored["correctness"],
                        "relevance": scored["relevance"],
                        "hallucination": scored["hallucination"],
                        "reason": scored["reason"],
                        "available": True,
                    }
                },
            }
        )

    return rows, compute_metrics(rows)


def _save_json(path: Path, data: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def run(config_path: str | None) -> dict:
    config = _load_config(config_path)
    judge_cfg = config.get("judge", {}) or {}
    provider = str(judge_cfg.get("provider", "groq")).strip().lower()
    if provider and provider != "groq":
        raise ValueError(f"Unsupported judge provider '{provider}'. Only 'groq' is supported.")

    judge_client = GroqJudgeClient(
        api_key=str(judge_cfg.get("api_key", "")).strip() or os.getenv("GROQ_API_KEY", "").strip(),
        base_url="https://api.groq.com/openai/v1",
        model=str(judge_cfg.get("model", "llama-3.3-70b-versatile")),
    )
    generator = TestSuiteGenerator(judge_client=judge_client)
    tests = _resolve_test_suite(generator, config)

    run_id = str(uuid.uuid4())
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    reports_dir = Path("reports")
    suite_path = reports_dir / f"suite_{timestamp}_{run_id[:8]}.json"
    _save_json(suite_path, tests)

    target_cfg = config.get("target")
    if not isinstance(target_cfg, dict):
        return {
            "status": "tests_generated_only",
            "run_id": run_id,
            "tests_count": len(tests),
            "tests_path": str(suite_path),
            "note": "No target config provided. Add `target` to run full evaluation.",
        }

    results, metrics = _run_eval(tests, target_cfg=target_cfg, judge_cfg=judge_cfg)
    report_path = reports_dir / f"report_{timestamp}_{run_id[:8]}.html"
    ReportGenerator().generate(
        metrics=metrics,
        results=results,
        output_path=str(report_path),
        metadata={
            "target_type": str(target_cfg.get("type", "unknown")),
            "judge_model": str(judge_cfg.get("model", "llama-3.3-70b-versatile")),
        },
    )

    results_path = reports_dir / f"run_{timestamp}_{run_id[:8]}.json"
    _save_json(
        results_path,
        {
            "run_id": run_id,
            "tests": tests,
            "results": results,
            "metrics": metrics,
            "report_path": str(report_path),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        },
    )

    return {
        "status": "done",
        "run_id": run_id,
        "tests_count": len(tests),
        "overall_score": metrics.get("average_score", 0),
        "report_path": str(report_path),
        "results_path": str(results_path),
        "tests_path": str(suite_path),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AI Breaker Lab runner")
    parser.add_argument(
        "--config",
        type=str,
        default="configs/ai_breaker_lab.yaml",
        help="Path to AI Breaker Lab YAML config.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    output = run(args.config)
    print(json.dumps(output, indent=2))
