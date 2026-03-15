from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict

from api.database import get_report_row


@dataclass
class ComplianceContext:
  report_id: str
  model_version: str
  created_at: str
  risk_level: str
  standard: str
  metrics: Dict[str, Any]
  results: list[dict]
  esg_metrics: Dict[str, Any] | None


def _grade_from_score(score: float) -> str:
  if score >= 9:
    return "A"
  if score >= 7:
    return "B"
  if score >= 5:
    return "C"
  return "F"


def _load_context(report_id: str, standard: str, risk_level: str) -> ComplianceContext:
  row = get_report_row(report_id)
  if not row:
    raise ValueError(f"Report not found: {report_id}")

  metrics = json.loads(row["metrics_json"]) if row.get("metrics_json") else {}
  results = json.loads(row["results_json"]) if row.get("results_json") else []

  raw_esg = row.get("esg_metrics")
  esg: Dict[str, Any] | None
  if isinstance(raw_esg, str):
    try:
      esg = json.loads(raw_esg) if raw_esg else None
    except json.JSONDecodeError:
      esg = None
  else:
    esg = raw_esg or None

  return ComplianceContext(
    report_id=str(row["report_id"]),
    model_version=str(row.get("model_version") or "unknown"),
    created_at=str(row.get("created_at") or ""),
    risk_level=risk_level,
    standard=standard,
    metrics=metrics,
    results=results,
    esg_metrics=esg,
  )


def _risk_statement(risk_level: str) -> str:
  key = (risk_level or "").strip().lower()
  if key == "high":
    return (
      "This system is classified as a high-risk AI system. "
      "It requires robust technical and organisational controls, continuous monitoring, "
      "and a documented risk management system aligned with the EU AI Act."
    )
  if key == "limited":
    return (
      "This system is classified as a limited-risk AI system. "
      "It must provide clear user disclosures and appropriate transparency, "
      "but does not require the full high-risk control set."
    )
  return (
      "This system is classified as a minimal-risk AI system. "
      "Standard software assurance practices and transparency are recommended, "
      "but no additional EU AI Act risk controls are mandated."
  )


def _format_coverage(metrics: Dict[str, Any]) -> list[dict]:
  breakdown = metrics.get("breakdown_by_type") or metrics.get("breakdown") or {}
  rows: list[dict] = []
  for name, value in sorted(breakdown.items()):
    count = int(value.get("count", 0))
    failures = int(
      value.get(
        "fail_count",
        value.get("failures", value.get("failed", 0)),
      )
      or 0
    )
    avg = float(value.get("avg_score", value.get("average_score", 0.0)) or 0.0)
    pass_rate = 0.0
    if count > 0:
      pass_rate = max(0.0, 1.0 - (failures / count))
    rows.append(
      {
        "name": str(name),
        "count": count,
        "failures": failures,
        "avg_score": avg,
        "pass_rate": pass_rate,
      }
    )
  return rows


def _failed_rows(metrics: Dict[str, Any], results: list[dict]) -> list[dict]:
  failed = metrics.get("failed_rows")
  if isinstance(failed, list) and failed:
    return failed
  rows: list[dict] = []
  for r in results or []:
    try:
      score = float(r.get("score", 0.0) or 0.0)
    except Exception:
      score = 0.0
    if score < (metrics.get("fail_threshold") or 5.0):
      rows.append(
        {
          "question": r.get("question") or "",
          "score": score,
          "reason": r.get("reason") or "",
        }
      )
  return rows


def _build_html(ctx: ComplianceContext) -> str:
  score = float(ctx.metrics.get("average_score", 0.0) or 0.0)
  grade = _grade_from_score(score)
  total = int(ctx.metrics.get("total_samples") or ctx.metrics.get("sample_count") or 0)
  threshold = float(ctx.metrics.get("fail_threshold", 5.0) or 5.0)
  passed = score >= threshold
  coverage = _format_coverage(ctx.metrics)
  failures = _failed_rows(ctx.metrics, ctx.results)

  created_date = ""
  if ctx.created_at:
    try:
      created_date = datetime.fromisoformat(ctx.created_at.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except Exception:
      created_date = ctx.created_at[:10]

  if ctx.standard == "eu_ai_act":
    standard_label = "EU AI Act"
  elif ctx.standard == "iso_42001":
    standard_label = "ISO/IEC 42001"
  else:
    standard_label = ctx.standard

  esg_html = ""
  if ctx.esg_metrics:
    esg_html = f"""
      <p><strong>Total energy:</strong> {ctx.esg_metrics.get("kwh", 0):.4f} kWh</p>
      <p><strong>Total CO₂:</strong> {ctx.esg_metrics.get("co2_grams", 0):.1f} g</p>
      <p><strong>Tokens evaluated:</strong> {int(ctx.esg_metrics.get("tokens_used", 0) or 0):d}</p>
      <p><strong>Provider:</strong> {ctx.esg_metrics.get("provider", "unknown")}</p>
    """
  else:
    esg_html = "<p>ESG and energy metrics were <strong>not measured</strong> for this evaluation run.</p>"

  coverage_rows = "".join(
    f"""
      <tr>
        <td>{c['name']}</td>
        <td>{c['count']}</td>
        <td>{c['avg_score']:.2f}/10</td>
        <td>{c['pass_rate'] * 100:.1f}%</td>
      </tr>
    """
    for c in coverage
  ) or '<tr><td colspan="4">No coverage breakdown available.</td></tr>'

  failure_items = "".join(
    f"""
      <div class="fail-item">
        <div class="fail-q">{f.get('question') or 'Untitled test case'}</div>
        <div class="fail-meta">Score: {float(f.get('score') or 0.0):.1f}/10</div>
        <div class="fail-reason">{f.get('reason') or 'No explanation provided.'}</div>
      </div>
    """
    for f in failures
  ) or '<p>No failed test cases were recorded for this run.</p>'

  risk_text = _risk_statement(ctx.risk_level)

  html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Compliance Report · {ctx.report_id}</title>
  <style>
    body {{ font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 32px; background: #0B1020; color: #E6EEFF; }}
    .shell {{ max-width: 900px; margin: 0 auto; background: #0F1424; border-radius: 12px; padding: 28px 32px; box-shadow: 0 18px 45px rgba(0,0,0,0.55); }}
    h1, h2, h3 {{ margin: 0 0 12px; }}
    h1 {{ font-size: 24px; letter-spacing: .08em; text-transform: uppercase; color: #7A96C0; }}
    h2 {{ font-size: 18px; margin-top: 24px; border-bottom: 1px solid #1F2A3D; padding-bottom: 6px; }}
    p {{ font-size: 13px; line-height: 1.6; color: #A9B9D9; }}
    .meta-grid {{ display: grid; grid-template-columns: repeat(auto-fit,minmax(180px,1fr)); gap: 6px 18px; margin-top: 12px; margin-bottom: 4px; }}
    .meta-label {{ font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #7A96C0; }}
    .meta-value {{ font-size: 13px; color: #E6EEFF; }}
    .pill {{ display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 999px; font-size: 11px; border: 1px solid rgba(255,255,255,0.24); margin-left: 6px; }}
    .pill.pass {{ border-color: #3DDC97; color: #3DDC97; }}
    .pill.fail {{ border-color: #FF5C72; color: #FF5C72; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }}
    th, td {{ padding: 6px 8px; border-bottom: 1px solid #1F2A3D; text-align: left; }}
    th {{ font-size: 11px; color: #7A96C0; text-transform: uppercase; letter-spacing: .1em; }}
    .fail-item {{ border-radius: 8px; border: 1px solid #362033; background: rgba(255,92,114,0.06); padding: 10px 12px; margin-bottom: 8px; }}
    .fail-q {{ font-weight: 600; font-size: 13px; color: #F8E5FF; margin-bottom: 4px; }}
    .fail-meta {{ font-size: 11px; color: #F0A500; margin-bottom: 4px; }}
    .fail-reason {{ font-size: 12px; color: #C8D1EC; }}
    .badge-grade {{ display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 999px; background: #151B30; border: 2px solid #3DDC97; font-size: 18px; font-weight: 700; margin-left: 12px; }}
    .footer-note {{ margin-top: 18px; font-size: 11px; color: #6F809F; }}
  </style>
</head>
<body>
  <div class="shell">
    <section>
      <h1>AI Compliance Report</h1>
      <div class="meta-grid">
        <div>
          <div class="meta-label">Report ID</div>
          <div class="meta-value">{ctx.report_id}</div>
        </div>
        <div>
          <div class="meta-label">Model version</div>
          <div class="meta-value">{ctx.model_version}</div>
        </div>
        <div>
          <div class="meta-label">Evaluation date</div>
          <div class="meta-value">{created_date}</div>
        </div>
        <div>
          <div class="meta-label">Risk level</div>
          <div class="meta-value">{ctx.risk_level or 'unspecified'}</div>
        </div>
        <div>
          <div class="meta-label">Standard</div>
          <div class="meta-value">{standard_label}</div>
        </div>
      </div>
    </section>

    <section>
      <h2>1. Executive summary</h2>
      <p>
        The evaluated AI system achieved an overall score of <strong>{score:.2f}/10</strong>,
        corresponding to grade <span class="badge-grade">{grade}</span>.
      </p>
      <p>
        Total tests executed: <strong>{total}</strong>.
        Pass/fail threshold: <strong>{threshold:.1f}/10</strong>.
        Outcome:
        <span class="pill {'pass' if passed else 'fail'}">
          {"PASS" if passed else "FAIL"}
        </span>
      </p>
    </section>

    <section>
      <h2>2. Risk classification statement</h2>
      <p>{risk_text}</p>
    </section>

    <section>
      <h2>3. Test coverage</h2>
      <p>
        The following table summarises test coverage and pass rates by evaluation category.
      </p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Tests</th>
            <th>Average score</th>
            <th>Pass rate</th>
          </tr>
        </thead>
        <tbody>
          {coverage_rows}
        </tbody>
      </table>
    </section>

    <section>
      <h2>4. Failure evidence</h2>
      <p>
        The items below capture representative failed test cases and evaluator rationales.
      </p>
      {failure_items}
    </section>

    <section>
      <h2>5. ESG and energy metrics</h2>
      {esg_html}
    </section>

    <section>
      <h2>6. Certification statement</h2>
      <p>
        This document was generated by <strong>AI Breaker Lab</strong>, an automated evaluation
        framework for adversarial and safety testing of large language models.
      </p>
      <p>
        The results reflect the behaviour of the evaluated system on the specific prompts,
        test suite, and configuration used at the time of the run. They do not constitute a
        formal legal certification, but are intended to support compliance, risk management,
        and internal audit processes under frameworks such as the EU AI Act and ISO/IEC 42001.
      </p>
      <p class="footer-note">
        For regulators and auditors, this report can be attached as technical evidence of
        evaluation, alongside your internal policies, risk registers, and change management logs.
      </p>
    </section>
  </div>
</body>
</html>
"""
  return html


def generate_compliance_report(
  report_id: str,
  standard: str,
  risk_level: str,
  output_format: str,
) -> str:
  """
  Generate a structured compliance report for the given evaluation run.

  Returns the path to the generated HTML file on disk.
  """
  fmt = (output_format or "html").strip().lower()
  if fmt == "pdf":
    raise NotImplementedError("PDF export coming soon — use HTML and print to PDF")

  ctx = _load_context(report_id=report_id, standard=standard, risk_level=risk_level)
  html = _build_html(ctx)

  data_dir = Path(os.getenv("DATA_DIR", "/app/data"))
  reports_dir = data_dir / "reports"
  reports_dir.mkdir(parents=True, exist_ok=True)
  out_path = reports_dir / f"compliance_{ctx.report_id}.html"
  out_path.write_text(html, encoding="utf-8")
  return str(out_path)

