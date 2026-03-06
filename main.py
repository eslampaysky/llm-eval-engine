import uuid
import json
import os
import re
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Depends, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse, HTMLResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.models import EvaluationRequest
from api.auth import validate_api_key, bootstrap_clients_from_env
from api.database import (
    init_db,
    log_usage,
    get_usage_history,
    get_usage_summary,
    log_evaluation_run,
    get_latest_regression_baseline,
)

from core.evaluator import run_evaluation
from core.metrics import compute_metrics
from reports.report_generator import generate_html_report
from src.llm_eval_engine.infrastructure.config_loader import load_project_config


# â”€â”€ Human-review Pydantic models â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class ReviewedItem(BaseModel):
    id: int
    question: Optional[str] = None
    human_score: int
    human_comment: Optional[str] = None
    decision: Optional[str] = None  # "approve" | "reject"
    verdict: Optional[str] = None   # "correct" | "incorrect"
    hallucinated: Optional[bool] = None
    feedback: Optional[str] = None


class HumanReviewRequest(BaseModel):
    report_id: str
    reviewed_items: List[ReviewedItem]
    exported_at: Optional[str] = None


# â”€â”€ App setup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
app = FastAPI(
    title="AI Breaker Lab",
    description="AI stress-testing, evaluation, and observability platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()
bootstrap_clients_from_env()

REPORT_DIR = "reports"
os.makedirs(REPORT_DIR, exist_ok=True)
RULES_PATH = Path("configs/review_rules.json")
INCORRECT_THRESHOLD = 7.0
LOW_RELEVANCE_THRESHOLD = 7.0
REGRESSION_DROP_THRESHOLD = 0.02


def _retrain_evaluation_rules(reviewed_items: List[ReviewedItem]) -> dict:
    RULES_PATH.parent.mkdir(parents=True, exist_ok=True)
    if RULES_PATH.exists():
        with open(RULES_PATH, "r", encoding="utf-8") as f:
            state = json.load(f)
    else:
        state = {
            "total_reviews": 0,
            "correct_reviews": 0,
            "incorrect_reviews": 0,
            "hallucinated_reviews": 0,
            "avg_human_score": 0.0,
            "min_correctness_gate": 0.85,
            "hallucination_sensitivity": 0.1,
            "updated_at": None,
        }

    run_total = len(reviewed_items)
    run_correct = sum(1 for i in reviewed_items if (i.verdict == "correct") or (i.decision == "approve"))
    run_incorrect = sum(1 for i in reviewed_items if (i.verdict == "incorrect") or (i.decision == "reject"))
    run_hallucinated = sum(1 for i in reviewed_items if bool(i.hallucinated))
    run_avg_score = round(sum(i.human_score for i in reviewed_items) / run_total, 4) if run_total else 0.0

    prev_total = int(state.get("total_reviews", 0))
    new_total = prev_total + run_total

    state["total_reviews"] = new_total
    state["correct_reviews"] = int(state.get("correct_reviews", 0)) + run_correct
    state["incorrect_reviews"] = int(state.get("incorrect_reviews", 0)) + run_incorrect
    state["hallucinated_reviews"] = int(state.get("hallucinated_reviews", 0)) + run_hallucinated
    if new_total > 0:
        cumulative_score_sum = (float(state.get("avg_human_score", 0.0)) * prev_total) + (run_avg_score * run_total)
        state["avg_human_score"] = round(cumulative_score_sum / new_total, 4)

    correct_rate = state["correct_reviews"] / new_total if new_total else 0.0
    hallucination_rate = state["hallucinated_reviews"] / new_total if new_total else 0.0
    state["min_correctness_gate"] = round(max(0.5, min(0.99, correct_rate - 0.03)), 4)
    state["hallucination_sensitivity"] = round(max(0.01, min(0.95, hallucination_rate)), 4)
    state["updated_at"] = datetime.now(timezone.utc).isoformat()

    with open(RULES_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

    return state


# â”€â”€ Existing routes (unchanged) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/docs")


@app.get("/favicon.svg", include_in_schema=False)
def favicon_svg():
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs>
  <linearGradient id="jar" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#22d3ee"/>
    <stop offset="100%" stop-color="#a78bfa"/>
  </linearGradient>
</defs>
<rect x="14" y="8" width="36" height="8" rx="3" fill="#22d3ee"/>
<rect x="12" y="14" width="40" height="44" rx="9" fill="none" stroke="url(#jar)" stroke-width="4"/>
<path d="M16 40c6-5 10-2 16-2s10-3 16-8v20H16z" fill="#22d3ee"/>
<circle cx="24" cy="28" r="3" fill="#a78bfa"/>
<circle cx="34" cy="24" r="2" fill="#38bdf8"/>
<circle cx="42" cy="30" r="2.5" fill="#34d399"/>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@app.get("/favicon.ico", include_in_schema=False)
def favicon_ico():
    return RedirectResponse(url="/favicon.svg")


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


def _report_record_from_path(path: Path) -> dict:
    name = path.name
    report_id = re.sub(r"^report_", "", name)
    report_id = re.sub(r"_reviewed", "", report_id)
    report_id = re.sub(r"\.html$", "", report_id)
    return {
        "id": report_id,
        "file_name": name,
        "reviewed": name.endswith("_reviewed.html"),
        "created_at": datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat(),
        "url": f"/reports/{name}",
    }


@app.get("/providers")
def get_providers(auth_ctx: dict = Depends(validate_api_key)):
    config = load_project_config()
    providers = config.get("judge_providers", config.get("judge_provider", ["ollama"]))
    if isinstance(providers, str):
        providers = [providers]
    return {"providers": providers}


@app.get("/review/rules")
def get_review_rules(auth_ctx: dict = Depends(validate_api_key)):
    if not RULES_PATH.exists():
        return {"rules": None}
    with open(RULES_PATH, "r", encoding="utf-8") as f:
        return {"rules": json.load(f)}


@app.get("/reports")
def list_reports(auth_ctx: dict = Depends(validate_api_key)):
    report_dir = Path(REPORT_DIR)
    records = []
    for path in sorted(report_dir.glob("report_*.html"), key=lambda p: p.stat().st_mtime, reverse=True):
        records.append(_report_record_from_path(path))
    return {"reports": records}


@app.get("/reports/{file_name}", include_in_schema=False)
def serve_report_file(file_name: str):
    safe_name = os.path.basename(file_name)
    path = Path(REPORT_DIR) / safe_name
    if not path.exists() or not path.is_file():
        raise HTTPException(status_code=404, detail="Report file not found")
    return FileResponse(str(path), media_type="text/html")


@app.get("/history")
def history(limit: int = 200, auth_ctx: dict = Depends(validate_api_key)):
    rows = get_usage_history(limit=limit)
    return {"history": rows}


@app.get("/usage/summary")
def usage_summary(auth_ctx: dict = Depends(validate_api_key)):
    summary = get_usage_summary(client_name=auth_ctx["client"]["name"])
    return {"client": auth_ctx["client"]["name"], "usage": summary}


def _build_summary(results: list[dict], metrics: dict) -> dict:
    if not results:
        return {
            "correctness": 0.0,
            "relevance": 0.0,
            "hallucination": 0.0,
            "toxicity": 0.0,
            "overall": 0.0,
        }

    avg_correctness = sum(float(row.get("correctness", 0) or 0) for row in results) / len(results)
    avg_relevance = sum(float(row.get("relevance", 0) or 0) for row in results) / len(results)
    hallucination_score = float(metrics.get("hallucination_score", 0.0))
    toxicity = float(metrics.get("toxicity", 0.0))

    correctness_norm = max(0.0, min(1.0, avg_correctness / 10.0))
    relevance_norm = max(0.0, min(1.0, avg_relevance / 10.0))
    hallucination_norm = max(0.0, min(1.0, hallucination_score))
    toxicity_norm = max(0.0, min(1.0, toxicity))

    overall = (
        (0.35 * correctness_norm) +
        (0.25 * relevance_norm) +
        (0.25 * hallucination_norm) +
        (0.15 * (1.0 - toxicity_norm))
    )

    return {
        "correctness": round(correctness_norm, 4),
        "relevance": round(relevance_norm, 4),
        "hallucination": round(hallucination_norm, 4),
        "toxicity": round(toxicity_norm, 4),
        "overall": round(max(0.0, min(1.0, overall)), 4),
    }


def _annotate_failure_flags(results: list[dict]) -> list[dict]:
    annotated = []
    for row in results:
        correctness = float(row.get("correctness", 0) or 0)
        relevance = float(row.get("relevance", 0) or 0)
        is_hallucination = bool(row.get("hallucination", False))
        is_incorrect = correctness < INCORRECT_THRESHOLD
        is_low_relevance = relevance < LOW_RELEVANCE_THRESHOLD

        tags = []
        if is_hallucination:
            tags.append("hallucination")
        if is_incorrect:
            tags.append("incorrect")
        if is_low_relevance:
            tags.append("irrelevant")

        annotated.append({
            **row,
            "is_hallucination": is_hallucination,
            "is_incorrect": is_incorrect,
            "is_low_relevance": is_low_relevance,
            "failure_tags": tags,
            "primary_problem": tags[0] if tags else None,
        })
    return annotated


def _build_regression_signal(current_summary: dict, baseline: dict | None) -> dict:
    if not baseline:
        return {
            "available": False,
            "detected": False,
            "reason": "No baseline found for regression comparison.",
        }

    current_correctness = float(current_summary.get("correctness", 0) or 0)
    baseline_correctness = float(baseline.get("correctness", 0) or 0)
    delta = current_correctness - baseline_correctness
    drop = max(0.0, -delta)
    detected = drop >= REGRESSION_DROP_THRESHOLD

    if detected:
        message = f"Regression detected: correctness dropped by {round(drop * 100, 2)}%."
    else:
        message = f"No regression detected: correctness delta {round(delta * 100, 2)}%."

    return {
        "available": True,
        "detected": detected,
        "threshold": REGRESSION_DROP_THRESHOLD,
        "metric": "correctness",
        "current": round(current_correctness, 4),
        "baseline": round(baseline_correctness, 4),
        "delta": round(delta, 4),
        "drop": round(drop, 4),
        "drop_percent": round(drop * 100, 2),
        "message": message,
        "baseline_report_id": baseline.get("report_id"),
        "baseline_model_version": baseline.get("model_version"),
        "baseline_dataset_id": baseline.get("dataset_id"),
        "baseline_timestamp": baseline.get("timestamp"),
    }


def process_evaluation(
    report_id: str,
    samples: list,
    judge_model: str,
    auth_ctx: dict,
    dataset_id: str | None = None,
    model_version: str | None = None,
):
    raw_results = run_evaluation(samples=samples, judge_model=judge_model)
    metrics = compute_metrics(raw_results)
    results = _annotate_failure_flags(raw_results)
    summary = _build_summary(results, metrics)
    baseline = get_latest_regression_baseline(
        client_name=auth_ctx["client"]["name"],
        dataset_id=dataset_id,
        current_model_version=model_version,
    )
    regression = _build_regression_signal(summary, baseline)
    evaluation_date = datetime.now(timezone.utc).date().isoformat()
    generate_html_report(
        metrics=metrics,
        results=results,
        output_path=f"{REPORT_DIR}/report_{report_id}.html",
    )
    log_usage(
        report_id,
        auth_ctx["api_key"],
        len(samples),
        client=auth_ctx["client"],
        dataset_id=dataset_id,
        model_version=model_version,
        evaluation_date=evaluation_date,
    )
    log_evaluation_run(
        report_id=report_id,
        client_name=auth_ctx["client"]["name"],
        dataset_id=dataset_id,
        model_version=model_version,
        summary=summary,
    )
    return results, metrics, summary, regression


@app.post("/evaluate")
def evaluate(
    payload: EvaluationRequest,
    http_request: Request,
    background_tasks: BackgroundTasks,
    auth_ctx: dict = Depends(validate_api_key),
):
    report_id = str(uuid.uuid4())
    samples = [s.dict() for s in payload.get_samples()]
    if not samples:
        raise HTTPException(status_code=422, detail="Request must include non-empty 'dataset' or 'samples'.")
    report_path = f"/report/{report_id}"
    report_share_url = f"{str(http_request.base_url).rstrip('/')}{report_path}"

    if len(samples) > 50:
        background_tasks.add_task(
            process_evaluation,
            report_id, samples, payload.judge_model, auth_ctx, payload.dataset_id, payload.model_version
        )
        return {
            "report_id":  report_id,
            "status":     "processing",
            "dataset_id": payload.dataset_id,
            "model_version": payload.model_version,
            "evaluation_date": datetime.now(timezone.utc).date().isoformat(),
            "regression": {
                "available": False,
                "detected": False,
                "reason": "Regression check will be available when processing completes.",
            },
            "report_url": report_path,
            "report_share_url": report_share_url,
        }

    results, metrics, summary, regression = process_evaluation(
        report_id, samples, payload.judge_model, auth_ctx, payload.dataset_id, payload.model_version
    )
    return {
        "report_id":  report_id,
        "status":     "done",
        "dataset_id": payload.dataset_id,
        "model_version": payload.model_version,
        "evaluation_date": datetime.now(timezone.utc).date().isoformat(),
        "summary":    summary,
        "model_comparison": metrics.get("model_comparison", []),
        "best_model": metrics.get("model_comparison_best"),
        "cost_analysis": metrics.get("cost_analysis", []),
        "metrics":    metrics,
        "regression": regression,
        "results":    results,
        "report_url": report_path,
        "report_share_url": report_share_url,
    }


@app.get("/report/{report_id}", include_in_schema=False)
def get_report(report_id: str):
    report_file = f"{REPORT_DIR}/report_{report_id}.html"
    if not os.path.exists(report_file):
        raise HTTPException(status_code=404, detail="Report not found or still processing")
    return FileResponse(report_file, media_type="text/html")


# â”€â”€ NEW: Human review dashboard (self-contained, no Node.js needed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/review/{report_id}", response_class=HTMLResponse, include_in_schema=False)
def review_dashboard(report_id: str):
    """
    Open in a browser to review any evaluation report.
    Example: http://localhost:8000/review/7125086a-49f2-4b96-bfd8-eca2ca3596a7

    The page shows a paste-in modal â€” copy your /evaluate JSON response
    into it, and the full review UI loads instantly. No React build needed.
    """
    html = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Human Review Dashboard</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>
  body { background: #0f172a; }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width:16px; height:16px;
    border-radius:50%; background:white; border:2px solid #7c3aed;
    cursor:pointer; box-shadow:0 0 6px rgba(124,58,237,0.5);
  }
  input[type=range]::-moz-range-thumb {
    width:16px; height:16px; border-radius:50%;
    background:white; border:2px solid #7c3aed; cursor:pointer;
  }
  * { box-sizing: border-box; }
</style>
</head>
<body>
<div id="root"></div>
<script type="text/babel">
const { useState, useMemo } = React;

const REPORT_ID = window.location.pathname.split("/review/")[1] || "";

const weightedScore = (c, r) =>
  c == null || r == null ? null : Math.round(c * 0.6 + r * 0.4);

const ScorePip = ({ value }) => {
  if (value == null) return <span className="text-slate-500 text-xs">â€”</span>;
  const color = value >= 8 ? "#22c55e" : value >= 5 ? "#f59e0b" : "#ef4444";
  return <span style={{ color }} className="font-bold text-sm tabular-nums">{value}</span>;
};

const HallucinationBadge = ({ value }) =>
  value ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-950 text-red-300 border border-red-800">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />HALLUCINATION
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />CLEAN
    </span>
  );

const StatusBadge = ({ reviewed }) =>
  reviewed ? (
    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-violet-950 text-violet-300 border border-violet-700">REVIEWED</span>
  ) : (
    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-800 text-slate-400 border border-slate-700">PENDING</span>
  );

const ScoreSlider = ({ value, onChange }) => {
  const pct = (value / 10) * 100;
  const color = value >= 8 ? "#22c55e" : value >= 5 ? "#f59e0b" : "#ef4444";
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={0} max={10} step={1} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, ${color} ${pct}%, #1e293b ${pct}%)` }}
      />
      <span className="w-8 text-center text-lg font-bold font-mono" style={{ color }}>{value}</span>
    </div>
  );
};

const ReviewPanel = ({ row, onSave }) => {
  const aiScore = weightedScore(row.correctness, row.relevance) ?? 0;
  const [score, setScore] = useState(row.human_score ?? aiScore);
  const [comment, setComment] = useState(row.human_comment ?? "");
  const [decision, setDecision] = useState(
    row.human_reviewed ? (row.human_score >= 5 ? "approve" : "reject") : null
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (dec) => {
    setDecision(dec); setSaving(true);
    await new Promise(r => setTimeout(r, 200));
    onSave(row.id, { human_score: score, human_comment: comment, decision: dec });
    setSaving(false);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-700/60 rounded-xl p-5 mt-1 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "QUESTION",     text: row.question,     accent: "#94a3b8" },
          { label: "GROUND TRUTH", text: row.ground_truth, accent: "#34d399" },
          { label: "MODEL ANSWER", text: row.model_answer,
            accent: row.hallucination ? "#f87171" : "#60a5fa" },
        ].map(({ label, text, accent }) => (
          <div key={label} className="rounded-lg p-3 bg-slate-800/60 border border-slate-700/40">
            <div className="font-mono font-bold mb-2 tracking-widest" style={{ color: accent, fontSize: 10 }}>{label}</div>
            <p className="text-slate-200 text-sm leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg p-3 bg-slate-800/40 border-l-2 border-amber-500/50">
        <div className="font-mono font-bold text-amber-400 tracking-widest mb-1" style={{ fontSize: 10 }}>AI REASONING</div>
        <p className="text-slate-300 text-xs leading-relaxed">{row.reason}</p>
      </div>
      <div className="flex gap-6 text-xs text-slate-400">
        <span>Correctness: <ScorePip value={row.correctness} /></span>
        <span>Relevance: <ScorePip value={row.relevance} /></span>
        <span>AI Weighted: <ScorePip value={aiScore} /></span>
      </div>
      <div className="space-y-2">
        <div className="font-mono font-bold text-slate-400 tracking-widest" style={{ fontSize: 10 }}>OVERRIDE SCORE</div>
        <ScoreSlider value={score} onChange={setScore} />
      </div>
      <div className="space-y-2">
        <div className="font-mono font-bold text-slate-400 tracking-widest" style={{ fontSize: 10 }}>REVIEWER COMMENT</div>
        <textarea value={comment} onChange={e => setComment(e.target.value)}
          rows={3} placeholder="Add your expert assessment..."
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500 transition-all"
        />
      </div>
      <div className="flex gap-3">
        <button onClick={() => handleSave("approve")} disabled={saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider transition-all border ${
            decision === "approve"
              ? "bg-emerald-500 border-emerald-400 text-white shadow-lg shadow-emerald-500/20"
              : "bg-emerald-950 border-emerald-700 text-emerald-300 hover:bg-emerald-900"
          }`}>
          {saving && decision === "approve" ? "SAVING..." : "âœ“ APPROVE"}
        </button>
        <button onClick={() => handleSave("reject")} disabled={saving}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold font-mono tracking-wider transition-all border ${
            decision === "reject"
              ? "bg-red-500 border-red-400 text-white shadow-lg shadow-red-500/20"
              : "bg-red-950 border-red-700 text-red-300 hover:bg-red-900"
          }`}>
          {saving && decision === "reject" ? "SAVING..." : "âœ— REJECT"}
        </button>
      </div>
    </div>
  );
};

const Sidebar = ({ results, reportId, onExport, exporting }) => {
  const total    = results.length;
  const reviewed = results.filter(r => r.human_reviewed).length;
  const flagged  = results.filter(r => r.hallucination).length;
  const pending  = total - reviewed;
  const humanScores = results.filter(r => r.human_score != null).map(r => r.human_score);
  const aiScores    = results.map(r => weightedScore(r.correctness, r.relevance) ?? 0);
  const avgHuman = humanScores.length ? (humanScores.reduce((a,b)=>a+b,0)/humanScores.length).toFixed(1) : "â€”";
  const avgAI    = aiScores.length ? (aiScores.reduce((a,b)=>a+b,0)/aiScores.length).toFixed(1) : "â€”";
  const delta    = humanScores.length && aiScores.length ? (parseFloat(avgHuman)-parseFloat(avgAI)).toFixed(1) : null;
  const progress = total > 0 ? (reviewed / total) * 100 : 0;

  const StatCard = ({ label, value, sub, color="#94a3b8" }) => (
    <div className="rounded-xl p-4 bg-slate-800/60 border border-slate-700/50">
      <div className="font-mono font-bold tracking-widest text-slate-500 mb-1" style={{ fontSize: 10 }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <aside className="w-72 shrink-0 flex flex-col gap-4">
      <div className="rounded-xl p-4 bg-slate-800/40 border border-slate-700/50">
        <div className="font-mono font-bold tracking-widest text-slate-500 mb-1" style={{ fontSize: 10 }}>REPORT ID</div>
        <div className="text-xs font-mono text-violet-300 break-all">{reportId}</div>
      </div>
      <div className="rounded-xl p-4 bg-slate-800/60 border border-slate-700/50">
        <div className="flex justify-between items-center mb-2">
          <div className="font-mono font-bold tracking-widest text-slate-500" style={{ fontSize: 10 }}>REVIEW PROGRESS</div>
          <div className="text-xs font-mono text-slate-300">{reviewed}/{total}</div>
        </div>
        <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`,
              background: progress === 100
                ? "linear-gradient(90deg,#22c55e,#34d399)"
                : "linear-gradient(90deg,#7c3aed,#a78bfa)" }} />
        </div>
        <div className="text-xs text-slate-500 mt-1">{progress.toFixed(0)}% complete</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="FLAGGED"   value={flagged}   sub="hallucinations" color="#f87171" />
        <StatCard label="PENDING"   value={pending}   sub="to review"      color="#fbbf24" />
        <StatCard label="AVG AI"    value={avgAI}     sub="weighted score" color="#60a5fa" />
        <StatCard label="AVG HUMAN" value={avgHuman}
          sub={delta != null ? `${parseFloat(delta)>=0?"+":""}${delta} vs AI` : "no reviews yet"}
          color={delta==null?"#94a3b8":parseFloat(delta)>0?"#34d399":parseFloat(delta)<0?"#f87171":"#94a3b8"}
        />
      </div>
      <div className="mt-auto space-y-2">
        <div className="font-mono font-bold tracking-widest text-slate-500 px-1" style={{ fontSize: 10 }}>PREMIUM EXPORT</div>
        <button onClick={onExport} disabled={exporting || reviewed === 0}
          className={`w-full py-3.5 rounded-xl text-sm font-bold font-mono tracking-wider transition-all border ${
            reviewed === 0
              ? "bg-slate-800 border-slate-700 text-slate-600 cursor-not-allowed"
              : exporting
              ? "bg-violet-900 border-violet-600 text-violet-300 cursor-wait"
              : "bg-violet-600 border-violet-500 text-white hover:bg-violet-500 shadow-lg shadow-violet-500/20"
          }`}>
          {exporting ? "EXPORTING..." : "â¬† EXPORT FINAL REPORT"}
        </button>
        {reviewed === 0 && <p className="text-xs text-slate-600 text-center">Review at least one item to export</p>}
        {reviewed > 0 && !exporting && <p className="text-xs text-slate-500 text-center">{reviewed} reviewed item{reviewed !== 1 ? "s" : ""} will be included</p>}
      </div>
    </aside>
  );
};

const PasteModal = ({ onLoad }) => {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const handleLoad = () => {
    try {
      const parsed = JSON.parse(text);
      if (!parsed.results) throw new Error("JSON must have a 'results' array");
      onLoad(parsed);
    } catch (e) { setError(e.message); }
  };
  return (
    <div className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-50 p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 w-full max-w-2xl space-y-4">
        <div className="font-mono font-bold tracking-widest text-violet-400" style={{ fontSize: 11 }}>LOAD EVALUATION DATA</div>
        <h2 className="text-xl font-bold text-white">Paste your /evaluate response</h2>
        <p className="text-slate-400 text-sm">
          Run <code className="bg-slate-800 px-1.5 py-0.5 rounded text-violet-300">POST /evaluate</code> from Swagger or curl, then paste the full JSON response below.
        </p>
        <textarea value={text} onChange={e => { setText(e.target.value); setError(""); }}
          rows={10} placeholder={'{\n  "report_id": "...",\n  "results": [...]\n}'}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono placeholder-slate-600 resize-none focus:outline-none focus:border-violet-500"
        />
        {error && <p className="text-red-400 text-xs font-mono">{error}</p>}
        <button onClick={handleLoad}
          className="w-full py-3 rounded-xl font-bold font-mono text-sm bg-violet-600 hover:bg-violet-500 text-white transition-all">
          LOAD REPORT â†’
        </button>
      </div>
    </div>
  );
};

const FILTERS = ["all", "flagged", "reviewed", "pending"];

function App() {
  const [reportData, setReportData] = useState(null);
  const [results, setResults]       = useState([]);
  const [filter, setFilter]         = useState("all");
  const [expandedId, setExpandedId] = useState(null);
  const [search, setSearch]         = useState("");
  const [exporting, setExporting]   = useState(false);
  const [exportMsg, setExportMsg]   = useState(null);

  const handleLoad = (data) => {
    setReportData(data);
    setResults((data.results || []).map((r, i) => ({
      ...r, id: i,
      human_reviewed: r.human_reviewed ?? false,
      human_score:    r.human_score    ?? null,
      human_comment:  r.human_comment  ?? null,
    })));
  };

  const filtered = useMemo(() => {
    let out = results;
    if (filter === "flagged")  out = out.filter(r => r.hallucination);
    if (filter === "reviewed") out = out.filter(r => r.human_reviewed);
    if (filter === "pending")  out = out.filter(r => !r.human_reviewed);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(r =>
        r.question.toLowerCase().includes(q) ||
        r.model_answer.toLowerCase().includes(q)
      );
    }
    return out;
  }, [results, filter, search]);

  const counts = useMemo(() => ({
    all:      results.length,
    flagged:  results.filter(r => r.hallucination).length,
    reviewed: results.filter(r => r.human_reviewed).length,
    pending:  results.filter(r => !r.human_reviewed).length,
  }), [results]);

  const handleSave = (id, update) =>
    setResults(prev => prev.map(r => r.id === id ? { ...r, human_reviewed: true, ...update } : r));

  const handleExport = async () => {
    setExporting(true);
    const reviewed = results.filter(r => r.human_reviewed);
    try {
      const res = await fetch(`/report/${reportData.report_id}/human-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "dev" },
        body: JSON.stringify({
          report_id: reportData.report_id,
          reviewed_items: reviewed.map(r => ({
            id: r.id, question: r.question,
            human_score: r.human_score, human_comment: r.human_comment, decision: r.decision,
          })),
          exported_at: new Date().toISOString(),
        }),
      });
      const json = await res.json();
      setExportMsg(res.ok
        ? { ok: true,  text: `âœ“ Exported ${json.reviewed_items} items â€” view at /report/${reportData.report_id}/reviewed` }
        : { ok: false, text: `Export failed: ${json.detail}` }
      );
    } catch (e) {
      setExportMsg({ ok: false, text: `Network error: ${e.message}` });
    }
    setExporting(false);
    setTimeout(() => setExportMsg(null), 6000);
  };

  return (
    <div className="min-h-screen text-slate-100" style={{
      fontFamily: "'DM Mono','Fira Code',monospace",
      background: "#0f172a",
      backgroundImage: "radial-gradient(ellipse at 20% 0%,rgba(124,58,237,0.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 100%,rgba(16,185,129,0.05) 0%,transparent 60%)",
    }}>
      {!reportData && <PasteModal onLoad={handleLoad} />}

      <header className="border-b border-slate-800 bg-slate-950/80 sticky top-0 z-30" style={{ backdropFilter:"blur(12px)" }}>
        <div className="max-w-screen-xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-md bg-violet-600 flex items-center justify-center text-xs font-bold">LM</div>
            <div>
              <div className="text-xs font-bold tracking-widest text-white">AI BREAKER LAB</div>
              <div className="text-slate-500 tracking-wider" style={{ fontSize: 10 }}>HUMAN REVIEW â€” DECISION GRADE</div>
            </div>
          </div>
          {exportMsg && (
            <div className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${exportMsg.ok ? "bg-emerald-950 border-emerald-700 text-emerald-300" : "bg-red-950 border-red-700 text-red-300"}`}>
              {exportMsg.text}
            </div>
          )}
          {reportData && (
            <button onClick={() => { setReportData(null); setResults([]); }}
              className="text-xs font-mono text-slate-500 hover:text-slate-300 transition-colors">
              â† LOAD NEW REPORT
            </button>
          )}
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6 flex gap-6">
        <main className="flex-1 min-w-0 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg font-mono font-bold tracking-widest transition-all border ${
                  filter === f
                    ? "bg-violet-600 border-violet-500 text-white"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                }`} style={{ fontSize: 11 }}>
                {f.toUpperCase()}
                <span className={`ml-2 px-1.5 py-0.5 rounded ${filter === f ? "bg-violet-500/50" : "bg-slate-700"}`} style={{ fontSize: 10 }}>
                  {counts[f]}
                </span>
              </button>
            ))}
            <div className="ml-auto relative">
              <input type="text" placeholder="Search..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500 w-48 transition-all"
              />
              {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs">âœ•</button>}
            </div>
          </div>

          <div className="grid px-4 font-mono font-bold tracking-widest text-slate-500"
            style={{ gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr", fontSize: 10 }}>
            <span>QUESTION</span><span>AI SCORE</span><span>HALLUCINATION</span>
            <span>HUMAN SCORE</span><span>STATUS</span><span></span>
          </div>

          <div className="space-y-1.5">
            {filtered.length === 0 && (
              <div className="text-center py-16 text-slate-600 text-sm font-mono">
                {reportData ? "NO ITEMS MATCH CURRENT FILTER" : "LOAD A REPORT TO BEGIN"}
              </div>
            )}
            {filtered.map(row => {
              const aiScore = weightedScore(row.correctness, row.relevance);
              const isOpen  = expandedId === row.id;
              return (
                <div key={row.id} className={`rounded-xl border transition-all duration-200 ${
                  isOpen ? "border-violet-600/60 bg-slate-900/60"
                  : row.hallucination ? "border-red-900/50 bg-slate-900/30 hover:border-red-800/60"
                  : "border-slate-800/60 bg-slate-900/20 hover:border-slate-700/60"
                }`}>
                  <button
                    className="w-full grid items-center px-4 py-3.5 text-left gap-4"
                    style={{ gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 1fr" }}
                    onClick={() => setExpandedId(isOpen ? null : row.id)}>
                    <span className="text-sm text-slate-200 truncate pr-2">{row.question}</span>
                    <span><ScorePip value={aiScore} /></span>
                    <span><HallucinationBadge value={row.hallucination} /></span>
                    <span>{row.human_score != null ? <ScorePip value={row.human_score} /> : <span className="text-slate-600 text-xs">â€”</span>}</span>
                    <span><StatusBadge reviewed={row.human_reviewed} /></span>
                    <span className="text-slate-500 font-mono justify-self-end" style={{ fontSize: 11 }}>{isOpen ? "â–² CLOSE" : "â–¼ REVIEW"}</span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <ReviewPanel row={row} onSave={handleSave} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        <Sidebar results={results} reportId={reportData?.report_id || REPORT_ID}
          onExport={handleExport} exporting={exporting} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>"""
    return HTMLResponse(content=html)


# â”€â”€ NEW: Submit human review scores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.post("/report/{report_id}/human-review")
def submit_human_review(
    report_id: str,
    body: HumanReviewRequest,
    auth_ctx: dict = Depends(validate_api_key),
):
    """Save human review scores and generate a decision-grade HTML report."""
    review_path = f"{REPORT_DIR}/human_review_{report_id}.json"
    html_path   = f"{REPORT_DIR}/report_{report_id}_reviewed.html"

    payload = {
        "report_id":      report_id,
        "reviewer":       auth_ctx["client"]["name"],
        "exported_at":    body.exported_at or datetime.now(timezone.utc).isoformat(),
        "reviewed_items": [item.dict() for item in body.reviewed_items],
        "summary": {
            "total_reviewed": len(body.reviewed_items),
            "approved":  sum(1 for i in body.reviewed_items if i.decision == "approve"),
            "rejected":  sum(1 for i in body.reviewed_items if i.decision == "reject"),
            "correct": sum(1 for i in body.reviewed_items if i.verdict == "correct"),
            "incorrect": sum(1 for i in body.reviewed_items if i.verdict == "incorrect"),
            "hallucinated": sum(1 for i in body.reviewed_items if bool(i.hallucinated)),
            "avg_human_score": (
                round(sum(i.human_score for i in body.reviewed_items) / len(body.reviewed_items), 2)
                if body.reviewed_items else None
            ),
        },
    }

    with open(review_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    # Build annotated decision-grade HTML report
    rows_html = ""
    for item in body.reviewed_items:
        resolved_decision = item.decision or ("approve" if item.verdict == "correct" else "reject")
        verdict_label = item.verdict.upper() if item.verdict else ("CORRECT" if resolved_decision == "approve" else "INCORRECT")
        dc = "#22c55e" if resolved_decision == "approve" else "#ef4444"
        dl = "âœ“ APPROVED" if resolved_decision == "approve" else "âœ— REJECTED"
        halluc_label = "âš  HALLUCINATED" if item.hallucinated else "CLEAN"
        rows_html += f"""
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;max-width:260px">{item.question or f"Item #{item.id}"}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;text-align:center;font-weight:bold;color:{dc}">{item.human_score}/10</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;text-align:center;font-weight:bold;color:{dc};font-size:12px">{dl}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;font-size:12px;opacity:.9">{verdict_label} Â· {halluc_label}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #1e293b;font-size:12px;opacity:.7">{item.feedback or item.human_comment or 'â€”'}</td>
        </tr>"""

    s = payload["summary"]
    reviewed_html = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Decision-Grade Report â€” {report_id[:8]}</title><link rel="icon" type="image/svg+xml" href="/favicon.svg"></head>
<body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:Arial,sans-serif">
<header style="background:#020617;padding:28px 40px;border-bottom:1px solid #1e293b">
  <div style="font-size:11px;letter-spacing:.1em;color:#7c3aed;font-weight:bold;margin-bottom:6px">DECISION-GRADE REPORT</div>
  <h1 style="margin:0 0 4px;font-size:20px">Human-Reviewed Evaluation</h1>
  <p style="margin:0;opacity:.4;font-size:12px">Report {report_id} Â· Exported {payload['exported_at'][:10]}</p>
</header>
<div style="padding:30px 40px">
  <div style="display:flex;gap:16px;margin-bottom:30px">
    {''.join(f'<div style="background:#1e293b;padding:16px 22px;border-radius:10px;flex:1"><div style="font-size:22px;font-weight:bold;color:{c}">{v}</div><div style="font-size:12px;opacity:.5;margin-top:2px">{l}</div></div>'
     for v,l,c in [(s["total_reviewed"],"Items Reviewed","#a78bfa"),(s["approved"],"Approved","#22c55e"),(s["rejected"],"Rejected","#ef4444"),(s["avg_human_score"],"Avg Human Score","#60a5fa")])}
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:13px">
    <thead><tr style="background:#1e293b">
      <th style="padding:10px 14px;text-align:left">Question</th>
      <th style="padding:10px 14px;text-align:center">Human Score</th>
      <th style="padding:10px 14px;text-align:center">Decision</th>
      <th style="padding:10px 14px;text-align:left">Review Label</th>
      <th style="padding:10px 14px;text-align:left">Feedback</th>
    </tr></thead>
    <tbody>{rows_html}</tbody>
  </table>
</div></body></html>"""

    with open(html_path, "w", encoding="utf-8") as f:
        f.write(reviewed_html)

    retrained_rules = _retrain_evaluation_rules(body.reviewed_items)

    return {
        "status":         "saved",
        "report_id":      report_id,
        "reviewed_items": len(body.reviewed_items),
        "summary":        payload["summary"],
        "retrained_rules": retrained_rules,
        "html_report":    f"/report/{report_id}/reviewed",
    }


@app.get("/report/{report_id}/reviewed", include_in_schema=False)
def get_reviewed_report(report_id: str):
    """Serve the final decision-grade HTML report for delivery to clients."""
    path = f"{REPORT_DIR}/report_{report_id}_reviewed.html"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Reviewed report not found")
    return FileResponse(path, media_type="text/html")

