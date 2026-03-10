from __future__ import annotations

import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from api.database import (
    DB_FILE,
    get_client_by_api_key,
    init_db,
    log_usage,
    register_client,
)
from api.models import EvaluationRequest
from reports.report_generator import ReportGenerator, generate_html_report
from src.llm_eval_engine.infrastructure.config_loader import load_project_config
from src.llm_eval_engine.infrastructure.evaluator_factories import (
    build_default_evaluator_registry,
)
from src.metrics import compute_metrics
from src.target_adapter import AdapterFactory
from src.test_generator import GroqJudgeClient, TestSuiteGenerator
from src.use_cases.run_evaluation import EvaluationPipeline

load_dotenv()

router = APIRouter()
REPORT_DIR = Path("reports")
REVIEW_RULES_PATH = Path("configs/review_rules.json")

GROQ_JUDGE_MODEL = "llama-3.3-70b-versatile"
GROQ_BASE_URL = "https://api.groq.com/openai/v1"


# ── Pydantic models ───────────────────────────────────────────────────────────

class HumanReviewItem(BaseModel):
    index: int
    score: float
    comment: str | None = None
    approved: bool


class HumanReviewRequest(BaseModel):
    reviews: list[HumanReviewItem] = Field(default_factory=list)


class BreakTarget(BaseModel):
    type: str  # "openai" | "huggingface" | "webhook"
    base_url: str | None = None
    api_key: str | None = None
    model_name: str | None = None
    repo_id: str | None = None
    api_token: str | None = None
    endpoint_url: str | None = None
    headers: dict | None = None
    payload_template: str | None = None


class BreakRequest(BaseModel):
    target: BreakTarget
    description: str = Field(..., min_length=5)
    num_tests: int = Field(default=20, ge=6, le=50)
    groq_api_key: str | None = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def _create_extra_tables() -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS evaluation_reports(
            report_id TEXT PRIMARY KEY,
            client_id INTEGER,
            client_name TEXT,
            status TEXT NOT NULL,
            judge_model TEXT,
            sample_count INTEGER NOT NULL,
            dataset_id TEXT,
            model_version TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            results_json TEXT,
            metrics_json TEXT,
            html_path TEXT,
            total_tokens INTEGER,
            total_cost_usd REAL,
            error TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS human_reviews(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            report_id TEXT NOT NULL,
            item_index INTEGER NOT NULL,
            score REAL NOT NULL,
            comment TEXT,
            approved INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(report_id) REFERENCES evaluation_reports(report_id)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_eval_reports_created_at ON evaluation_reports(created_at DESC)"
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS idx_human_reviews_report_id ON human_reviews(report_id)"
    )
    conn.commit()
    conn.close()


def initialize_api_storage() -> None:
    init_db()
    _create_extra_tables()


def _api_keys_from_env() -> dict[str, str]:
    entries = [part.strip() for part in os.getenv("API_KEYS", "").split(",") if part.strip()]
    keys: dict[str, str] = {}
    for idx, entry in enumerate(entries):
        if ":" in entry:
            name, key = entry.split(":", 1)
            keys[key.strip()] = name.strip() or f"client_{idx + 1}"
        else:
            keys[entry] = f"client_{idx + 1}"
    return keys


def validate_api_key(
    x_api_key: Annotated[str, Header(..., alias="X-API-KEY")],
) -> dict[str, Any]:
    key_map = _api_keys_from_env()
    if not key_map:
        raise HTTPException(status_code=500, detail="API_KEYS is not configured in .env")
    if x_api_key not in key_map:
        raise HTTPException(status_code=401, detail="Invalid API Key")

    client_name = key_map[x_api_key]
    client = get_client_by_api_key(x_api_key)
    if not client:
        register_client(name=client_name, api_key=x_api_key)
        client = get_client_by_api_key(x_api_key)

    return {"api_key": x_api_key, "client_name": client_name, "client": client}


def _insert_report(
    *,
    report_id: str,
    auth_ctx: dict[str, Any],
    sample_count: int,
    judge_model: str | None,
    dataset_id: str | None,
    model_version: str | None,
    status: str,
) -> None:
    now = _utc_now_iso()
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO evaluation_reports(
            report_id, client_id, client_name, status, judge_model, sample_count,
            dataset_id, model_version, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report_id,
            auth_ctx.get("client", {}).get("id") if auth_ctx.get("client") else None,
            auth_ctx.get("client_name"),
            status,
            judge_model,
            sample_count,
            dataset_id,
            model_version,
            now,
            now,
        ),
    )
    conn.commit()
    conn.close()


def _aggregate_usage(results: list[dict]) -> tuple[int, float]:
    total_tokens = 0
    total_cost = 0.0
    for row in results:
        for judge in row.get("judges", {}).values():
            tokens = judge.get("tokens_used")
            cost = judge.get("cost_estimate_usd")
            if tokens is not None:
                total_tokens += int(tokens)
            if cost is not None:
                total_cost += float(cost)
    return total_tokens, round(total_cost, 6)


def _finalize_report_success(
    report_id: str,
    results: list[dict],
    metrics: dict[str, Any],
    html_path: str,
) -> None:
    total_tokens, total_cost = _aggregate_usage(results)
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE evaluation_reports
        SET status = ?, updated_at = ?, results_json = ?, metrics_json = ?,
            html_path = ?, total_tokens = ?, total_cost_usd = ?, error = NULL
        WHERE report_id = ?
        """,
        (
            "done",
            _utc_now_iso(),
            json.dumps(results, ensure_ascii=False),
            json.dumps(metrics, ensure_ascii=False),
            html_path,
            total_tokens,
            total_cost,
            report_id,
        ),
    )
    conn.commit()
    conn.close()


def _finalize_report_failure(report_id: str, error_message: str) -> None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE evaluation_reports
        SET status = ?, updated_at = ?, error = ?
        WHERE report_id = ?
        """,
        ("failed", _utc_now_iso(), error_message[:2000], report_id),
    )
    conn.commit()
    conn.close()


def _run_pipeline(samples: list[dict], judge_model: str | None) -> tuple[list[dict], dict[str, Any]]:
    config = load_project_config()
    evaluator_registry = build_default_evaluator_registry()
    pipeline = EvaluationPipeline(config=config, evaluator_registry=evaluator_registry, max_workers=1)
    results = pipeline.run(samples=samples, judge_model=judge_model)
    metrics = compute_metrics(results)
    return results, metrics


def _process_evaluation_job(report_id: str, samples: list[dict], judge_model: str | None) -> None:
    try:
        results, metrics = _run_pipeline(samples=samples, judge_model=judge_model)
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        html_path = str(REPORT_DIR / f"report_{report_id}.html")
        generate_html_report(metrics=metrics, results=results, output_path=html_path)
        _finalize_report_success(report_id=report_id, results=results, metrics=metrics, html_path=html_path)
    except Exception as exc:
        _finalize_report_failure(report_id=report_id, error_message=str(exc))


def _get_report_row(report_id: str) -> sqlite3.Row | None:
    conn = _connect()
    cur = conn.cursor()
    cur.execute("SELECT * FROM evaluation_reports WHERE report_id = ? LIMIT 1", (report_id,))
    row = cur.fetchone()
    conn.close()
    return row


def _load_review_rules() -> dict[str, Any]:
    if REVIEW_RULES_PATH.exists():
        with open(REVIEW_RULES_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    return {
        "total_reviews": 0,
        "approval_rate": 0.0,
        "average_human_score": 0.0,
        "min_auto_flag_score": 4.0,
        "updated_at": None,
    }


def _update_review_rules(reviews: list[HumanReviewItem]) -> dict[str, Any]:
    rules = _load_review_rules()
    review_count = len(reviews)
    if review_count == 0:
        return rules

    approved_count = sum(1 for item in reviews if item.approved)
    avg_score = sum(item.score for item in reviews) / review_count
    historical_total = int(rules.get("total_reviews", 0))
    historical_avg = float(rules.get("average_human_score", 0.0))

    new_total = historical_total + review_count
    merged_avg = ((historical_avg * historical_total) + (avg_score * review_count)) / new_total

    rules["total_reviews"] = new_total
    rules["approval_rate"] = round(approved_count / review_count, 4)
    rules["average_human_score"] = round(merged_avg, 4)
    rules["min_auto_flag_score"] = round(max(0.0, min(10.0, merged_avg - 2.0)), 2)
    rules["updated_at"] = _utc_now_iso()

    REVIEW_RULES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REVIEW_RULES_PATH, "w", encoding="utf-8") as handle:
        json.dump(rules, handle, indent=2, ensure_ascii=False)

    return rules


# ── /break background job ─────────────────────────────────────────────────────

def _score_answers(
    tests: list[dict],
    target_adapter: Any,
    judge: Any,
) -> list[dict]:
    """Call the target model on each test, score with Groq judge, return rows."""
    rows: list[dict] = []
    for test in tests:
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

        rows.append({
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
        })
    return rows


class _GroqAnswerJudge:
    """Score a model answer against ground truth using Groq."""

    def __init__(self, api_key: str, model: str = GROQ_JUDGE_MODEL) -> None:
        self._client = GroqJudgeClient(
            api_key=api_key,
            base_url=GROQ_BASE_URL,
            model=model,
            timeout_seconds=120,
        )

    def score(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = (
            f"You are a strict evaluator for AI Breaker Lab.\n\n"
            f"Question: {question}\n"
            f"Ground Truth: {ground_truth}\n"
            f"Model Answer: {model_answer}\n\n"
            f"Return JSON only:\n"
            f'{{"correctness":0-10,"relevance":0-10,"hallucination":true/false,"reason":"short explanation"}}'
        )
        raw = self._client.generate(prompt)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            start, end = raw.find("{"), raw.rfind("}")
            if start == -1 or end == -1:
                return {"correctness": 0.0, "relevance": 0.0, "hallucination": True, "reason": "Invalid JSON from judge"}
            payload = json.loads(raw[start: end + 1])

        return {
            "correctness": float(payload.get("correctness", 0) or 0),
            "relevance": float(payload.get("relevance", 0) or 0),
            "hallucination": bool(payload.get("hallucination", True)),
            "reason": str(payload.get("reason", "")).strip() or "No reason provided",
        }


def _process_break_job(
    report_id: str,
    target_cfg: dict,
    description: str,
    num_tests: int,
    groq_api_key: str,
) -> None:
    try:
        # 1. Generate adversarial test suite from description
        judge_client = GroqJudgeClient(
            api_key=groq_api_key,
            base_url=GROQ_BASE_URL,
            model=GROQ_JUDGE_MODEL,
        )
        generator = TestSuiteGenerator(judge_client=judge_client)
        tests = generator.generate_from_description(
            description=description,
            num_tests=num_tests,
        )

        # 2. Call target model + score each answer
        target_adapter = AdapterFactory.from_config(target_cfg)
        judge = _GroqAnswerJudge(api_key=groq_api_key)
        results = _score_answers(tests, target_adapter, judge)

        # 3. Compute metrics
        metrics = compute_metrics(results)

        # 4. Generate Breaker HTML report
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        html_path = str(REPORT_DIR / f"report_{report_id}.html")
        ReportGenerator().generate(
            metrics=metrics,
            results=results,
            output_path=html_path,
            metadata={
                "target_type": target_cfg.get("type", "unknown"),
                "judge_model": GROQ_JUDGE_MODEL,
            },
        )

        _finalize_report_success(
            report_id=report_id,
            results=results,
            metrics=metrics,
            html_path=html_path,
        )

    except Exception as exc:
        _finalize_report_failure(report_id=report_id, error_message=str(exc))


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/evaluate")
def evaluate(
    payload: EvaluationRequest,
    background_tasks: BackgroundTasks,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    samples = [sample.model_dump() for sample in payload.get_samples()]
    if not samples:
        raise HTTPException(status_code=422, detail="Request body must include non-empty 'samples'")

    report_id = str(uuid.uuid4())
    _insert_report(
        report_id=report_id,
        auth_ctx=auth_ctx,
        sample_count=len(samples),
        judge_model=payload.judge_model,
        dataset_id=payload.dataset_id,
        model_version=payload.model_version,
        status="processing",
    )
    log_usage(
        report_id=report_id,
        api_key=auth_ctx["api_key"],
        sample_count=len(samples),
        client=auth_ctx.get("client"),
        dataset_id=payload.dataset_id,
        model_version=payload.model_version,
        evaluation_date=datetime.now(timezone.utc).date().isoformat(),
    )

    if len(samples) > 20:
        background_tasks.add_task(_process_evaluation_job, report_id, samples, payload.judge_model)
        return {"report_id": report_id, "status": "processing", "results": [], "metrics": {}}

    try:
        results, metrics = _run_pipeline(samples=samples, judge_model=payload.judge_model)
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        html_path = str(REPORT_DIR / f"report_{report_id}.html")
        generate_html_report(metrics=metrics, results=results, output_path=html_path)
        _finalize_report_success(report_id=report_id, results=results, metrics=metrics, html_path=html_path)
        return {"report_id": report_id, "status": "done", "results": results, "metrics": metrics}
    except Exception as exc:
        _finalize_report_failure(report_id=report_id, error_message=str(exc))
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")


@router.post("/break")
def break_model(
    payload: BreakRequest,
    background_tasks: BackgroundTasks,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    """
    New core endpoint. Accepts a target model config + plain-text description,
    auto-generates adversarial tests, calls the target, scores everything,
    and returns a Breaker Report.

    Poll GET /report/{report_id} until status == "done".
    """
    groq_api_key = (payload.groq_api_key or os.getenv("GROQ_API_KEY", "")).strip()
    if not groq_api_key:
        raise HTTPException(
            status_code=422,
            detail="groq_api_key is required (or set GROQ_API_KEY env var on the server)",
        )

    target_cfg = payload.target.model_dump(exclude_none=True)
    report_id = str(uuid.uuid4())
    model_version = (
        target_cfg.get("model_name")
        or target_cfg.get("repo_id")
        or target_cfg.get("endpoint_url")
        or "unknown"
    )

    _insert_report(
        report_id=report_id,
        auth_ctx=auth_ctx,
        sample_count=payload.num_tests,
        judge_model=f"groq/{GROQ_JUDGE_MODEL}",
        dataset_id=None,
        model_version=model_version,
        status="processing",
    )
    log_usage(
        report_id=report_id,
        api_key=auth_ctx["api_key"],
        sample_count=payload.num_tests,
        client=auth_ctx.get("client"),
        dataset_id=None,
        model_version=model_version,
        evaluation_date=datetime.now(timezone.utc).date().isoformat(),
    )

    background_tasks.add_task(
        _process_break_job,
        report_id,
        target_cfg,
        payload.description,
        payload.num_tests,
        groq_api_key,
    )

    return {
        "report_id": report_id,
        "status": "processing",
        "num_tests": payload.num_tests,
        "message": f"Generating {payload.num_tests} adversarial tests and breaking your model. Poll GET /report/{report_id} for results.",
    }


@router.get("/reports")
def list_reports(auth_ctx: dict[str, Any] = Depends(validate_api_key)) -> list[dict[str, Any]]:
    client_name = auth_ctx.get("client_name")
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT report_id, status, judge_model, sample_count, created_at, updated_at,
               total_tokens, total_cost_usd
        FROM evaluation_reports
        WHERE client_name = ?
        ORDER BY created_at DESC
        """,
        (client_name,),
    )
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    for row in rows:
        row["report_url"] = f"/report/{row['report_id']}"
    return rows


@router.get("/report/{report_id}")
def get_report(report_id: str, auth_ctx: dict[str, Any] = Depends(validate_api_key)) -> dict[str, Any]:
    row = _get_report_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed to access this report")

    results = json.loads(row["results_json"]) if row["results_json"] else []
    metrics = json.loads(row["metrics_json"]) if row["metrics_json"] else {}
    return {
        "report_id": row["report_id"],
        "status": row["status"],
        "judge_model": row["judge_model"],
        "sample_count": row["sample_count"],
        "dataset_id": row["dataset_id"],
        "model_version": row["model_version"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "results": results,
        "metrics": metrics,
        "report_url": f"/report/{row['report_id']}",
        "html_report_url": f"/reports/report_{row['report_id']}.html" if row["html_path"] else None,
        "error": row["error"],
    }


@router.post("/report/{report_id}/human-review")
def submit_human_review(
    report_id: str,
    payload: HumanReviewRequest,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    row = _get_report_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed to review this report")

    conn = _connect()
    cur = conn.cursor()
    cur.execute("DELETE FROM human_reviews WHERE report_id = ?", (report_id,))
    now = _utc_now_iso()
    for review in payload.reviews:
        cur.execute(
            """
            INSERT INTO human_reviews(report_id, item_index, score, comment, approved, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                report_id,
                int(review.index),
                float(review.score),
                review.comment,
                1 if review.approved else 0,
                now,
            ),
        )
    conn.commit()
    conn.close()

    updated_rules = _update_review_rules(payload.reviews)
    return {
        "report_id": report_id,
        "saved_reviews": len(payload.reviews),
        "rules": updated_rules,
    }


@router.get("/providers")
def get_providers(auth_ctx: dict[str, Any] = Depends(validate_api_key)) -> list[str]:
    config = load_project_config()
    providers = config.get("judge_providers", config.get("judge_provider", ["ollama"]))
    if isinstance(providers, str):
        return [providers]
    return [str(item) for item in providers]


@router.get("/history")
def get_history(
    limit: int = 50,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> list[dict[str, Any]]:
    conn = _connect()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT ul.report_id, ul.timestamp, ul.sample_count, ul.dataset_id, ul.model_version, ul.evaluation_date,
               er.status, er.judge_model, er.total_tokens, er.total_cost_usd
        FROM usage_logs ul
        LEFT JOIN evaluation_reports er ON er.report_id = ul.report_id
        WHERE ul.client_name = ?
        ORDER BY ul.timestamp DESC
        LIMIT ?
        """,
        (auth_ctx.get("client_name"), int(limit)),
    )
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def _usage_slice(client_name: str, time_prefix: str | None) -> dict[str, Any]:
    conn = _connect()
    cur = conn.cursor()
    if time_prefix:
        cur.execute(
            """
            SELECT COUNT(*) AS evaluations,
                   COALESCE(SUM(ul.sample_count), 0) AS samples,
                   COALESCE(SUM(er.total_tokens), 0) AS total_tokens,
                   COALESCE(SUM(er.total_cost_usd), 0.0) AS total_cost_usd
            FROM usage_logs ul
            LEFT JOIN evaluation_reports er ON er.report_id = ul.report_id
            WHERE ul.client_name = ? AND ul.timestamp LIKE ?
            """,
            (client_name, f"{time_prefix}%"),
        )
    else:
        cur.execute(
            """
            SELECT COUNT(*) AS evaluations,
                   COALESCE(SUM(ul.sample_count), 0) AS samples,
                   COALESCE(SUM(er.total_tokens), 0) AS total_tokens,
                   COALESCE(SUM(er.total_cost_usd), 0.0) AS total_cost_usd
            FROM usage_logs ul
            LEFT JOIN evaluation_reports er ON er.report_id = ul.report_id
            WHERE ul.client_name = ?
            """,
            (client_name,),
        )
    row = dict(cur.fetchone())
    conn.close()
    row["total_cost_usd"] = round(float(row["total_cost_usd"] or 0.0), 6)
    return row


@router.get("/usage/summary")
def usage_summary(auth_ctx: dict[str, Any] = Depends(validate_api_key)) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    client_name = auth_ctx.get("client_name")
    return {
        "client": client_name,
        "today": _usage_slice(client_name, now.strftime("%Y-%m-%d")),
        "month": _usage_slice(client_name, now.strftime("%Y-%m")),
        "overall": _usage_slice(client_name, None),
    }


@router.get("/review/rules")
def review_rules(auth_ctx: dict[str, Any] = Depends(validate_api_key)) -> dict[str, Any]:
    return _load_review_rules()