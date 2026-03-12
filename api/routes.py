from __future__ import annotations

import json
import os
import secrets
import smtplib
import uuid
import time
from datetime import datetime, timezone
from email.message import EmailMessage
from html import escape
from pathlib import Path
from typing import Annotated, Any
import api.multi_judge as multi_judge_module
from api.multi_judge import build_judges, score_answers, compute_agreement_rate
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from api.database import (
    cancel_report,
    delete_report,
    get_cached_test_suite,     
    get_demo_run_count,
    save_test_suite_cache,     
    finalize_report_failure,
    finalize_report_success,
    get_client_by_api_key,
    hash_ip,
    reset_report_for_retry,     
    get_stuck_processing_reports,
    get_history_for_client,
    get_report_row,
    get_report_row_by_share_token,
    get_usage_slice,
    init_db,
    insert_report,
    list_reports_for_client,
    log_usage,
    register_client,
    save_human_reviews,
    set_report_share_token,
    upsert_demo_run,
)
from api.job_queue import enqueue_job
from api.models import BreakRequest, BreakTarget, DemoBreakRequest, EvaluationRequest, JudgeConfig
from api.rate_limit import LIMIT_BREAK, LIMIT_DELETE, LIMIT_EVALUATE, LIMIT_READ, limiter ,LIMIT_RETRY
from reports.report_generator import ReportGenerator, generate_html_report
from src.llm_eval_engine.infrastructure.config_loader import load_project_config
from src.llm_eval_engine.infrastructure.evaluator_factories import (
    build_default_evaluator_registry,
)
from src.arabic_test_generator import ArabicTestGenerator, detect_language
from src.metrics import compute_metrics
from src.target_adapter import AdapterFactory, GeminiDemoAdapter
from src.test_generator import GroqJudgeClient, TestSuiteGenerator
from src.use_cases.run_evaluation import EvaluationPipeline

load_dotenv()

router = APIRouter()

# ── Persistent paths ──────────────────────────────────────────────────────────
_DATA_DIR         = Path(os.getenv("DATA_DIR", "/app/data"))
REPORT_DIR        = _DATA_DIR / "reports"
REVIEW_RULES_PATH = _DATA_DIR / "review_rules.json"
REPORT_DIR.mkdir(parents=True, exist_ok=True)

GROQ_JUDGE_MODEL = "llama-3.3-70b-versatile"
GROQ_BASE_URL    = "https://api.groq.com/openai/v1"
DEMO_ALLOWED_MODELS = {
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-2.5-flash-preview-05-20",
}
DEMO_DAILY_LIMIT = 5
DEMO_RATE_LIMIT_ERROR = "Gemini rate limit exceeded — please try again in a minute"


# ── Pydantic models ───────────────────────────────────────────────────────────

class HumanReviewItem(BaseModel):
    index: int
    score: float
    comment: str | None = None
    approved: bool


class HumanReviewRequest(BaseModel):
    reviews: list[HumanReviewItem] = Field(default_factory=list)


class NotifyRequest(BaseModel):
    report_id: str
    email: str | None = None
    slack_enabled: bool = False
    email_enabled: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_report_url(share_token: str) -> str:
    base = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if base:
        return f"{base}/r/{share_token}"
    return f"/r/{share_token}"


def _ensure_share_token(row: dict[str, Any]) -> str:
    share_token = (row.get("share_token") or "").strip()
    if share_token:
        return share_token
    share_token = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    set_report_share_token(str(row["report_id"]), share_token)
    row["share_token"] = share_token
    return share_token


def _send_email_notification(to_email: str, report: dict[str, Any]) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").strip()
    sender = os.getenv("NOTIFY_EMAIL_FROM", "").strip()

    if not all([host, user, password, sender]):
        raise HTTPException(status_code=500, detail="SMTP is not configured")

    metrics = report.get("metrics") or {}
    score = metrics.get("average_score", 0)
    failed = len(metrics.get("failed_rows", []))
    public_url = _public_report_url(str(report["share_token"]))

    msg = EmailMessage()
    msg["Subject"] = f"AI Breaker Lab report {report['report_id']}"
    msg["From"] = sender
    msg["To"] = to_email
    msg.set_content(
        f"Your run is complete.\n\n"
        f"Report ID: {report['report_id']}\n"
        f"Score: {score}/10\n"
        f"Failures: {failed}\n"
        f"Public report: {public_url}\n"
    )

    with smtplib.SMTP(host, port) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(msg)


def build_public_html(row: dict[str, Any]) -> str:
    metrics = json.loads(row["metrics_json"]) if row["metrics_json"] else {}
    score = metrics.get("average_score", 0)
    failed = len(metrics.get("failed_rows", []))
    red_flags = metrics.get("red_flags", [])
    flags_html = "".join(f"<li>{escape(str(flag))}</li>" for flag in red_flags) or "<li>None</li>"

    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Breaker Lab Report {escape(str(row["report_id"]))}</title>
    <style>
      :root {{ color-scheme: light; }}
      body {{ font-family: Arial, sans-serif; margin: 0; background: #f5f7fb; color: #0f172a; }}
      main {{ max-width: 760px; margin: 40px auto; background: #fff; border: 1px solid #dbe3f0; border-radius: 16px; padding: 28px; }}
      h1 {{ margin: 0 0 18px; font-size: 28px; }}
      .meta {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 24px; }}
      .card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; }}
      .label {{ font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; margin-bottom: 6px; }}
      .value {{ font-size: 18px; font-weight: 700; }}
      ul {{ padding-left: 20px; }}
      li {{ margin: 8px 0; }}
    </style>
  </head>
  <body>
    <main>
      <h1>AI Breaker Lab Report</h1>
      <div class="meta">
        <div class="card"><div class="label">Report ID</div><div class="value">{escape(str(row["report_id"]))}</div></div>
        <div class="card"><div class="label">Model</div><div class="value">{escape(str(row.get("model_version") or "unknown"))}</div></div>
        <div class="card"><div class="label">Score</div><div class="value">{escape(str(score))}/10</div></div>
        <div class="card"><div class="label">Tests</div><div class="value">{escape(str(row.get("sample_count") or 0))}</div></div>
        <div class="card"><div class="label">Failures</div><div class="value">{failed}</div></div>
      </div>
      <h2>Red Flags</h2>
      <ul>{flags_html}</ul>
    </main>
  </body>
</html>
"""


def initialize_api_storage() -> None:
    init_db()


def _api_keys_from_env() -> dict[str, str]:
    entries = [p.strip() for p in os.getenv("API_KEYS", "").split(",") if p.strip()]
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


def _do_insert_report(*, report_id, auth_ctx, sample_count, judge_model,
                      dataset_id, model_version, status):
    share_token = secrets.token_urlsafe(9).replace("-", "").replace("_", "")[:12]
    insert_report(
        report_id=report_id,
        client_id=auth_ctx.get("client", {}).get("id") if auth_ctx.get("client") else None,
        client_name=auth_ctx.get("client_name"),
        share_token=share_token,
        status=status,
        judge_model=judge_model,
        sample_count=sample_count,
        dataset_id=dataset_id,
        model_version=model_version,
    )


def _aggregate_usage(results):
    total_tokens, total_cost = 0, 0.0
    for row in results:
        for judge in row.get("judges", {}).values():
            if judge.get("tokens_used") is not None:
                total_tokens += int(judge["tokens_used"])
            if judge.get("cost_estimate_usd") is not None:
                total_cost += float(judge["cost_estimate_usd"])
    return total_tokens, round(total_cost, 6)


def _finalize_report_success(report_id, results, metrics, html_path):
    total_tokens, total_cost = _aggregate_usage(results)
    html_content = None
    try:
        if html_path and Path(html_path).exists():
            html_content = Path(html_path).read_text(encoding="utf-8")
    except Exception:
        pass
    finalize_report_success(
        report_id=report_id,
        results_json=json.dumps(results, ensure_ascii=False),
        metrics_json=json.dumps(metrics, ensure_ascii=False),
        html_path=html_path,
        html_content=html_content,
        total_tokens=total_tokens,
        total_cost=total_cost,
    )


def _finalize_report_failure(report_id, error_message):
    finalize_report_failure(report_id=report_id, error_message=error_message)


def _run_pipeline(samples, judge_model):
    config   = load_project_config()
    registry = build_default_evaluator_registry()
    pipeline = EvaluationPipeline(config=config, evaluator_registry=registry, max_workers=1)
    results  = pipeline.run(samples=samples, judge_model=judge_model)
    return results, compute_metrics(results)


def _resolve_break_judges(
    groq_api_key: str,
    judges_config: list[JudgeConfig] | None = None,
) -> list[Any]:
    if not judges_config:
        return build_judges(groq_api_key)

    judges: list[Any] = [
        multi_judge_module._Judge(
            name="groq",
            api_key=groq_api_key,
            base_url=GROQ_BASE_URL,
            model=GROQ_JUDGE_MODEL,
        )
    ]
    for judge in judges_config:
        judges.append(
            multi_judge_module._Judge(
                name=judge.name,
                api_key=judge.api_key,
                base_url=judge.base_url,
                model=judge.model,
            )
        )
    return judges


def _process_evaluation_job(report_id, samples, judge_model):
    try:
        results, metrics = _run_pipeline(samples=samples, judge_model=judge_model)
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        html_path = str(REPORT_DIR / f"report_{report_id}.html")
        generate_html_report(metrics=metrics, results=results, output_path=html_path)
        _finalize_report_success(report_id=report_id, results=results,
                                  metrics=metrics, html_path=html_path)
    except Exception as exc:
        _finalize_report_failure(report_id=report_id, error_message=str(exc))


def _load_review_rules():
    if REVIEW_RULES_PATH.exists():
        with open(REVIEW_RULES_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {
        "total_reviews": 0, "approval_rate": 0.0,
        "average_human_score": 0.0, "min_auto_flag_score": 4.0, "updated_at": None,
    }


def _update_review_rules(reviews):
    rules      = _load_review_rules()
    n          = len(reviews)
    if n == 0:
        return rules
    approved   = sum(1 for r in reviews if r.approved)
    avg        = sum(r.score for r in reviews) / n
    prev_total = int(rules.get("total_reviews", 0))
    prev_avg   = float(rules.get("average_human_score", 0.0))
    new_total  = prev_total + n
    merged_avg = ((prev_avg * prev_total) + (avg * n)) / new_total
    rules.update({
        "total_reviews":      new_total,
        "approval_rate":      round(approved / n, 4),
        "average_human_score": round(merged_avg, 4),
        "min_auto_flag_score": round(max(0.0, min(10.0, merged_avg - 2.0)), 2),
        "updated_at":         _utc_now_iso(),
    })
    REVIEW_RULES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(REVIEW_RULES_PATH, "w", encoding="utf-8") as f:
        json.dump(rules, f, indent=2, ensure_ascii=False)
    return rules


# ── /break background job ─────────────────────────────────────────────────────

def _score_answers(
    tests: list[dict],
    target_adapter: Any,
    judge: Any,
    call_delay_seconds: float = 5.0,
) -> list[dict]:
    rows: list[dict] = []
    for i, test in enumerate(tests):
        if i > 0 and call_delay_seconds > 0:
            time.sleep(call_delay_seconds)

        question     = str(test.get("question", ""))
        ground_truth = str(test.get("ground_truth", ""))
        test_type    = str(test.get("test_type", "factual"))

        try:
            model_answer = target_adapter.call(question)
        except Exception as exc:
            model_answer = ""
            scored = {"correctness": 0.0, "relevance": 0.0,
                      "hallucination": True, "reason": f"Target call failed: {exc}"}
        else:
            try:
                scored = judge.score(question, ground_truth, model_answer)
            except Exception as exc:
                scored = {"correctness": 0.0, "relevance": 0.0,
                          "hallucination": True, "reason": f"Judge failed: {exc}"}

        rows.append({
            "question": question, "ground_truth": ground_truth,
            "model_answer": model_answer, "test_type": test_type,
            "correctness": scored["correctness"], "relevance": scored["relevance"],
            "hallucination": scored["hallucination"], "reason": scored["reason"],
            "judges": {"groq": {**scored, "available": True}},
        })
    return rows


class _GroqAnswerJudge:
    def __init__(self, api_key: str, model: str = GROQ_JUDGE_MODEL) -> None:
        self._client = GroqJudgeClient(
            api_key=api_key, base_url=GROQ_BASE_URL,
            model=model, timeout_seconds=120,
        )

    def score(self, question: str, ground_truth: str, model_answer: str) -> dict:
        prompt = (
            f"You are a strict evaluator for AI Breaker Lab.\n\n"
            f"Question: {question}\nGround Truth: {ground_truth}\n"
            f"Model Answer: {model_answer}\n\n"
            f'Return JSON only:\n{{"correctness":0-10,"relevance":0-10,'
            f'"hallucination":true/false,"reason":"short explanation"}}'
        )
        raw = self._client.generate(prompt)
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError:
            s, e = raw.find("{"), raw.rfind("}")
            if s == -1 or e == -1:
                return {"correctness": 0.0, "relevance": 0.0,
                        "hallucination": True, "reason": "Invalid JSON from judge"}
            payload = json.loads(raw[s:e + 1])
        return {
            "correctness":   float(payload.get("correctness", 0) or 0),
            "relevance":     float(payload.get("relevance", 0) or 0),
            "hallucination": bool(payload.get("hallucination", True)),
            "reason":        str(payload.get("reason", "")).strip() or "No reason provided",
        }


class _RetryingGeminiDemoAdapter:
    def __init__(self, inner: GeminiDemoAdapter) -> None:
        self._inner = inner

    def call(self, question: str) -> str:
        delays = [20, 40, 60]
        last_exc: Exception | None = None
        for attempt in range(len(delays) + 1):
            try:
                return self._inner.call(question)
            except Exception as exc:
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                body_text = str(getattr(getattr(exc, "response", None), "text", "") or "")
                message = str(exc).lower()
                is_rate_limited = status_code == 429 or "429" in message or "rate limit" in message or "resource exhausted" in body_text.lower()
                if not is_rate_limited:
                    raise
                last_exc = exc
                if attempt >= len(delays):
                    raise RuntimeError(DEMO_RATE_LIMIT_ERROR) from exc
                time.sleep(delays[attempt])
        if last_exc is not None:
            raise RuntimeError(DEMO_RATE_LIMIT_ERROR) from last_exc
        raise RuntimeError(DEMO_RATE_LIMIT_ERROR)


import logging as _logging
_log = _logging.getLogger(__name__)
 
 

def _process_break_job(report_id, target_cfg, description, num_tests,
                       groq_api_key, force_refresh=False, language="auto",
                       judges_config: list[dict[str, Any]] | None = None,
                       disagreement_threshold: float | None = None,
                       target_adapter: Any | None = None):
    try:
        judge_client = GroqJudgeClient(
            api_key=groq_api_key, base_url=GROQ_BASE_URL, model=GROQ_JUDGE_MODEL,
        )
        resolved_lang = language if language != "auto" else detect_language(description)

        tests = None
        if not force_refresh:
            tests = get_cached_test_suite(description=description, num_tests=num_tests)
        if tests is None:
            if resolved_lang == "ar":
                generator = ArabicTestGenerator(judge_client=judge_client)
                tests = generator.generate_arabic_suite(
                    description=description, num_tests=num_tests,
                )
            else:
                generator = TestSuiteGenerator(judge_client=judge_client)
                tests = generator.generate_from_description(
                    description=description, num_tests=num_tests,
                )
            try:
                save_test_suite_cache(description=description,
                                      num_tests=num_tests, tests=tests)
            except Exception as cache_err:
                _log.warning("Cache write failed (non-fatal): %s", cache_err)

        target_adapter = target_adapter or AdapterFactory.from_config(target_cfg)
        resolved_judges = [JudgeConfig(**j) for j in (judges_config or [])]
        judges = _resolve_break_judges(groq_api_key, resolved_judges)
        original_threshold = multi_judge_module.DISAGREEMENT_THRESHOLD
        if disagreement_threshold is not None:
            multi_judge_module.DISAGREEMENT_THRESHOLD = float(disagreement_threshold)
        try:
            results = score_answers(tests, target_adapter, judges)
        finally:
            multi_judge_module.DISAGREEMENT_THRESHOLD = original_threshold

        # Inject agreement red-flag into metrics
        agreement_rate = compute_agreement_rate(results)
        metrics = compute_metrics(results)
        metrics["judges_agreement"] = agreement_rate
        if agreement_rate < 0.7 and len(judges) > 1:
            metrics.setdefault("red_flags", []).append(
                f"Judges disagreed on {round((1 - agreement_rate)*100, 1)}% of tests "
                f"— results may be uncertain."
            )

        judge_label = "+".join(j.name for j in judges)
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        html_path = str(REPORT_DIR / f"report_{report_id}.html")
        ReportGenerator().generate(
            metrics=metrics, results=results, output_path=html_path,
            metadata={"target_type": target_cfg.get("type", "unknown"),
                      "judge_model": judge_label},
        )
        _finalize_report_success(report_id=report_id, results=results,
                                  metrics=metrics, html_path=html_path)
    except Exception as exc:
        _finalize_report_failure(report_id=report_id, error_message=str(exc))


def _process_demo_break_job(report_id, model_name, description, num_tests, groq_api_key, gemini_api_key):
    try:
        adapter = _RetryingGeminiDemoAdapter(
            GeminiDemoAdapter(api_key=gemini_api_key, model_name=model_name)
        )
        _process_break_job(
            report_id,
            {"type": "openai", "model_name": model_name},
            description,
            num_tests,
            groq_api_key,
            False,
            "auto",
            [],
            None,
            adapter,
        )
    except Exception as exc:
        error_message = str(exc)
        if "rate limit" in error_message.lower() or "429" in error_message:
            error_message = DEMO_RATE_LIMIT_ERROR
        _finalize_report_failure(report_id=report_id, error_message=error_message)

# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/evaluate")
@limiter.limit(LIMIT_EVALUATE)
async def evaluate(
    request: Request,
    payload: EvaluationRequest,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    samples = [s.model_dump() for s in payload.get_samples()]
    if not samples:
        raise HTTPException(status_code=422,
                            detail="Request body must include non-empty 'samples'")
    report_id = str(uuid.uuid4())
    _do_insert_report(
        report_id=report_id, auth_ctx=auth_ctx, sample_count=len(samples),
        judge_model=payload.judge_model, dataset_id=payload.dataset_id,
        model_version=payload.model_version, status="processing",
    )
    log_usage(
        report_id=report_id, api_key=auth_ctx["api_key"], sample_count=len(samples),
        client=auth_ctx.get("client"), dataset_id=payload.dataset_id,
        model_version=payload.model_version,
        evaluation_date=datetime.now(timezone.utc).date().isoformat(),
    )
    if len(samples) > 20:
        await enqueue_job(
            _process_evaluation_job, report_id, samples, payload.judge_model,
            job_id=report_id,
        )
        return {"report_id": report_id, "status": "processing", "results": [], "metrics": {}}
    try:
        results, metrics = _run_pipeline(samples=samples, judge_model=payload.judge_model)
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        html_path = str(REPORT_DIR / f"report_{report_id}.html")
        generate_html_report(metrics=metrics, results=results, output_path=html_path)
        _finalize_report_success(report_id=report_id, results=results,
                                  metrics=metrics, html_path=html_path)
        return {"report_id": report_id, "status": "done",
                "results": results, "metrics": metrics}
    except Exception as exc:
        _finalize_report_failure(report_id=report_id, error_message=str(exc))
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {exc}")


@router.post("/break")
@limiter.limit(LIMIT_BREAK)
async def break_model(
    request: Request,
    payload: BreakRequest,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    """
    Core endpoint. Auto-generates adversarial tests, calls the target, scores everything.
    Poll GET /report/{report_id} until status == "done".
    """
    groq_api_key = (payload.groq_api_key or os.getenv("GROQ_API_KEY", "")).strip()
    if not groq_api_key:
        raise HTTPException(status_code=422,
                            detail="groq_api_key is required (or set GROQ_API_KEY env var)")
    target_cfg    = payload.target.model_dump(exclude_none=True)
    report_id     = str(uuid.uuid4())
    model_version = (
        target_cfg.get("model_name") or target_cfg.get("repo_id")
        or target_cfg.get("endpoint_url") or "unknown"
    )
    _do_insert_report(
        report_id=report_id, auth_ctx=auth_ctx, sample_count=payload.num_tests,
        judge_model="+".join(["groq", *[j.name for j in (payload.judges or [])]]), dataset_id=None,
        model_version=model_version, status="processing",
    )
    log_usage(
        report_id=report_id, api_key=auth_ctx["api_key"],
        sample_count=payload.num_tests, client=auth_ctx.get("client"),
        dataset_id=None, model_version=model_version,
        evaluation_date=datetime.now(timezone.utc).date().isoformat(),
    )
    await enqueue_job(
        _process_break_job,
        report_id,
        target_cfg,
        payload.description,
        payload.num_tests,
        groq_api_key,
        payload.force_refresh,
        payload.language,
        [j.model_dump() for j in (payload.judges or [])],
        payload.disagreement_threshold,
        None,
        job_id=report_id,
    )
    return {
        "report_id":  report_id,
        "status":     "processing",
        "num_tests":  payload.num_tests,
        "message": (
            f"Generating {payload.num_tests} adversarial tests and breaking your model. "
            f"Poll GET /report/{report_id} for results."
        ),
    }


@router.get("/reports")
@limiter.limit(LIMIT_READ)
def list_reports(
    request: Request,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> list[dict[str, Any]]:
    rows = list_reports_for_client(auth_ctx.get("client_name"))
    for r in rows:
        share_token = _ensure_share_token(r)
        r["report_url"] = f"/report/{r['report_id']}"
        r["public_share_url"] = _public_report_url(share_token)
    return rows


@router.get("/report/{report_id}")
@limiter.limit(LIMIT_READ)
def get_report(
    request: Request,
    report_id: str,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    row = get_report_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed to access this report")
    share_token = _ensure_share_token(row)
    retryable = bool(row["error"] and "rate limit" in str(row["error"]).lower())
    return {
        "report_id":       row["report_id"],
        "share_token":     share_token,
        "status":          row["status"],
        "judge_model":     row["judge_model"],
        "sample_count":    row["sample_count"],
        "dataset_id":      row["dataset_id"],
        "model_version":   row["model_version"],
        "created_at":      row["created_at"],
        "updated_at":      row["updated_at"],
        "results":         json.loads(row["results_json"]) if row["results_json"] else [],
        "metrics":         json.loads(row["metrics_json"]) if row["metrics_json"] else {},
        "report_url":      f"/report/{row['report_id']}",
        "public_share_url": _public_report_url(share_token),
        "html_report_url": f"/report/{row['report_id']}/html" if row["html_path"] else None,
        "error":           row["error"],
        "retryable":       retryable,
    }


@router.post("/report/{report_id}/cancel", status_code=202)
async def cancel_report_endpoint(
    report_id: str,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    canceled = cancel_report(
        report_id=report_id,
        client_name=auth_ctx.get("client_name"),
        reason="Canceled by user",
    )
    if not canceled:
        raise HTTPException(status_code=409, detail="Report is not running or you do not have access.")
    return {"report_id": report_id, "status": "canceled"}


def _client_ip(request: Request) -> str:
    forwarded = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@router.post("/demo/break")
async def demo_break_model(
    request: Request,
    payload: DemoBreakRequest,
) -> dict[str, Any]:
    model_name = payload.model_name.strip()
    if model_name not in DEMO_ALLOWED_MODELS:
        raise HTTPException(status_code=400, detail="Unsupported demo model")

    gemini_api_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")
    if not groq_api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    ip_hash = hash_ip(_client_ip(request))
    run_date = datetime.now(timezone.utc).date().isoformat()
    if get_demo_run_count(ip_hash, run_date) >= DEMO_DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="You've used today's demo quota (5 runs). Come back tomorrow or sign up for full access.",
        )
    upsert_demo_run(ip_hash, run_date)

    num_tests = min(int(payload.num_tests), 10)
    report_id = str(uuid.uuid4())
    _do_insert_report(
        report_id=report_id,
        auth_ctx={"client_name": "demo", "client": None},
        sample_count=num_tests,
        judge_model="groq",
        dataset_id=None,
        model_version=model_name,
        status="processing",
    )
    await enqueue_job(
        _process_demo_break_job,
        report_id,
        model_name,
        payload.description,
        num_tests,
        groq_api_key,
        gemini_api_key,
        job_id=report_id,
    )
    return {
        "report_id": report_id,
        "status": "processing",
        "num_tests": num_tests,
        "message": (
            f"Generating {num_tests} adversarial tests and breaking the demo Gemini model. "
            f"Poll GET /demo/report/{report_id} for results."
        ),
    }


@router.get("/demo/report/{report_id}")
def get_demo_report(report_id: str) -> dict[str, Any]:
    row = get_report_row(report_id)
    if not row or row["client_name"] != "demo":
        raise HTTPException(status_code=404, detail="Report not found")
    share_token = _ensure_share_token(row)
    retryable = bool(row["error"] and "rate limit" in str(row["error"]).lower())
    return {
        "report_id":       row["report_id"],
        "share_token":     share_token,
        "status":          row["status"],
        "judge_model":     row["judge_model"],
        "sample_count":    row["sample_count"],
        "dataset_id":      row["dataset_id"],
        "model_version":   row["model_version"],
        "created_at":      row["created_at"],
        "updated_at":      row["updated_at"],
        "results":         json.loads(row["results_json"]) if row["results_json"] else [],
        "metrics":         json.loads(row["metrics_json"]) if row["metrics_json"] else {},
        "report_url":      f"/report/{row['report_id']}",
        "public_share_url": _public_report_url(share_token),
        "html_report_url": f"/report/{row['report_id']}/html" if row["html_path"] else None,
        "error":           row["error"],
        "retryable":       retryable,
    }


@router.post("/demo/report/{report_id}/cancel", status_code=202)
async def cancel_demo_report_endpoint(report_id: str) -> dict[str, Any]:
    row = get_report_row(report_id)
    if not row or row["client_name"] != "demo":
        raise HTTPException(status_code=404, detail="Report not found")
    canceled = cancel_report(
        report_id=report_id,
        client_name="demo",
        reason="Canceled by user",
    )
    if not canceled:
        raise HTTPException(status_code=409, detail="Demo run is not running.")
    return {"report_id": report_id, "status": "canceled"}


@router.delete("/report/{report_id}", status_code=200)
@limiter.limit(LIMIT_DELETE)
def delete_report_endpoint(
    request: Request,
    report_id: str,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    """Permanently delete a report. Only the owning client can delete."""
    deleted = delete_report(report_id=report_id,
                            client_name=auth_ctx.get("client_name"))
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail="Report not found or you don't have permission to delete it.",
        )
    return {"deleted": True, "report_id": report_id}


# ── RetryRequest model (can live here or in api/models.py) ────────────────────
class RetryRequest(BaseModel):
    """
    Optional body for the retry endpoint.
    Clients can optionally provide a fresh groq_api_key (e.g. if theirs expired).
    The target config is already stored in the report's model_version / dataset_id
    fields — but for /break retries we need the full target + description again.
    """
    target: "BreakTarget | None" = None
    description: str | None = None
    groq_api_key: str | None = None
    language: str = "auto"
 
 
# ── The retry endpoint ────────────────────────────────────────────────────────
 
@router.post("/report/{report_id}/retry", status_code=202)
@limiter.limit(LIMIT_RETRY)
async def retry_report(
    request: Request,
    report_id: str,
    payload: RetryRequest = RetryRequest(),
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    """
    Re-enqueue a stale report for processing.
 
    A report becomes 'stale' when the server restarted while the job was
    in-flight. On the next startup, all such reports are automatically
    detected and marked 'stale' so clients know they need to retry.
 
    The retry re-uses everything stored on the original report (model_version,
    sample_count, judge_model) PLUS re-requires a groq_api_key and target
    config since those were never persisted (by design — we don't store secrets).
 
    Flow:
      1. Verify report exists, belongs to caller, and is in status='stale'.
      2. Reset status → 'processing'.
      3. Re-enqueue the background job.
      4. Return 202 Accepted with the report_id for polling.
    """
    # Validate the report exists and is stale
    row = get_report_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found.")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed to retry this report.")
    if row["status"] != "stale":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Report is '{row['status']}', not 'stale'. "
                "Only stale reports can be retried."
            ),
        )
 
    # Resolve groq_api_key: prefer payload, then env
    groq_api_key = (
        (payload.groq_api_key or "").strip()
        or os.getenv("GROQ_API_KEY", "").strip()
    )
    if not groq_api_key:
        raise HTTPException(
            status_code=422,
            detail="groq_api_key is required to retry (pass in body or set GROQ_API_KEY env var).",
        )
 
    # Resolve target config — must be provided since we never store it
    if not payload.target:
        raise HTTPException(
            status_code=422,
            detail=(
                "target config is required to retry a /break report. "
                "Re-provide the same target you used originally."
            ),
        )
 
    # Resolve description — use payload or fall back to model_version (we store it there)
    description = (
        (payload.description or "").strip()
        or row.get("model_version", "")
        or "unknown model"
    )
 
    # Reset the report row to 'processing' with ownership check
    reset_ok = reset_report_for_retry(
        report_id=report_id,
        client_name=auth_ctx.get("client_name"),
    )
    if not reset_ok:
        # Race condition: another request got here first, or status changed
        raise HTTPException(
            status_code=409,
            detail="Could not reset report for retry. It may have already been retried.",
        )
 
    # Re-enqueue the job
    target_cfg = payload.target.model_dump(exclude_none=True)
    num_tests  = row.get("sample_count", 20)
 
    await enqueue_job(
        _process_break_job,
        report_id,
        target_cfg,
        description,
        num_tests,
        groq_api_key,
        False,   # force_refresh=False — use cache if available
        payload.language,
        None,
        None,
        job_id=report_id,
    )
 
    return {
        "report_id": report_id,
        "status":    "processing",
        "message":   f"Report re-queued. Poll GET /report/{report_id} for results.",
    }


@router.get("/admin/stale")
@limiter.limit(LIMIT_READ)
def list_stale_reports(
    request: Request,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> list[dict[str, Any]]:
    """
    List all reports currently in 'stale' status for the calling client.
    These are safe to retry via POST /report/{id}/retry.
    """
    # get_stuck_processing_reports(0) returns all 'stale' rows
    all_stale = get_stuck_processing_reports(older_than_minutes=0)
    client_name = auth_ctx.get("client_name")
    return [
        {
            "report_id":  r["report_id"],
            "updated_at": r["updated_at"],
            "retry_url":  f"/report/{r['report_id']}/retry",
        }
        for r in all_stale
        if r.get("client_name") == client_name
    ]
 

@router.get("/report/{report_id}/html", response_class=HTMLResponse)
@limiter.limit(LIMIT_READ)
def get_report_html(
    request: Request,
    report_id: str,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
):
    row = get_report_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed")

    html_content = row.get("html_content")

    if not html_content:
        results = json.loads(row["results_json"]) if row["results_json"] else []
        metrics = json.loads(row["metrics_json"]) if row["metrics_json"] else {}
        if not results:
            raise HTTPException(status_code=404, detail="HTML report not available")
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".html", delete=False, mode="w") as f:
            tmp_path = f.name
        try:
            ReportGenerator().generate(
                metrics=metrics, results=results, output_path=tmp_path,
                metadata={"target_type": "unknown",
                          "judge_model": row["judge_model"] or GROQ_JUDGE_MODEL},
            )
            html_content = Path(tmp_path).read_text(encoding="utf-8")
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        if not html_content:
            raise HTTPException(status_code=404, detail="Could not generate HTML report")

    return HTMLResponse(content=html_content)


@router.post("/notify")
@limiter.limit(LIMIT_READ)
def notify(
    request: Request,
    payload: NotifyRequest,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    row = get_report_row(payload.report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed")
    if row["status"] != "done":
        raise HTTPException(status_code=409, detail="Report is not complete")

    report = {
        "report_id": row["report_id"],
        "share_token": _ensure_share_token(row),
        "metrics": json.loads(row["metrics_json"]) if row["metrics_json"] else {},
    }

    if payload.email_enabled and payload.email:
        _send_email_notification(payload.email, report)

    return {"ok": True}


@router.get("/r/{share_token}", response_class=HTMLResponse)
@limiter.limit(LIMIT_READ)
def public_report(request: Request, share_token: str):
    row = get_report_row_by_share_token(share_token)
    if not row or row["status"] != "done":
        raise HTTPException(status_code=404, detail="Report not found")
    return HTMLResponse(content=build_public_html(row))


@router.post("/report/{report_id}/human-review")
@limiter.limit(LIMIT_READ)
def submit_human_review(
    request: Request,
    report_id: str,
    payload: HumanReviewRequest,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    row = get_report_row(report_id)
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["client_name"] != auth_ctx.get("client_name"):
        raise HTTPException(status_code=403, detail="Not allowed to review this report")

    save_human_reviews(
        report_id=report_id,
        reviews=[r.model_dump() for r in payload.reviews],
    )
    return {
        "report_id":     report_id,
        "saved_reviews": len(payload.reviews),
        "rules":         _update_review_rules(payload.reviews),
    }


@router.get("/providers")
@limiter.limit(LIMIT_READ)
def get_providers(
    request: Request,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> list[str]:
    config    = load_project_config()
    providers = config.get("judge_providers", config.get("judge_provider", ["ollama"]))
    return [providers] if isinstance(providers, str) else [str(p) for p in providers]


@router.get("/history")
@limiter.limit(LIMIT_READ)
def get_history(
    request: Request,
    limit: int = 50,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> list[dict[str, Any]]:
    return get_history_for_client(
        client_name=auth_ctx.get("client_name"),
        limit=int(limit),
    )


@router.get("/usage/summary")
@limiter.limit(LIMIT_READ)
def usage_summary(
    request: Request,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    now         = datetime.now(timezone.utc)
    client_name = auth_ctx.get("client_name")
    return {
        "client":  client_name,
        "today":   get_usage_slice(client_name, now.strftime("%Y-%m-%d")),
        "month":   get_usage_slice(client_name, now.strftime("%Y-%m")),
        "overall": get_usage_slice(client_name, None),
    }


@router.get("/review/rules")
@limiter.limit(LIMIT_READ)
def review_rules(
    request: Request,
    auth_ctx: dict[str, Any] = Depends(validate_api_key),
) -> dict[str, Any]:
    return _load_review_rules()
