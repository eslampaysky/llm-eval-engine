"""Generate a self-contained HTML report with multi-model comparison."""

import os
from datetime import datetime, timezone


def _weighted_score(correctness, relevance, cw=0.6, rw=0.4):
    if correctness is None or relevance is None:
        return None
    return round((correctness * cw) + (relevance * rw), 2)


def _score_color(score):
    if score is None:
        return "#475569"
    if score >= 8:
        return "#16a34a"
    if score >= 5:
        return "#d97706"
    return "#dc2626"


def _provider_avgs(results: list[dict], providers: list[str]) -> dict[str, float | None]:
    out = {}
    for provider in providers:
        scores = []
        for row in results:
            judge = row.get("judges", {}).get(provider, {})
            if judge.get("available"):
                score = _weighted_score(judge.get("correctness"), judge.get("relevance"))
                if score is not None:
                    scores.append(score)
        out[provider] = round(sum(scores) / len(scores), 2) if scores else None
    return out


def generate_html_report(metrics: dict, results: list[dict], output_path: str = "reports/report.html") -> str:
    os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)

    total = int(metrics.get("total_samples", 0))
    hallucinations = int(metrics.get("hallucinations_detected", 0))
    low_quality = int(metrics.get("low_quality_answers", 0))
    hallucination_rate = round((hallucinations / total) * 100, 1) if total else 0
    low_quality_rate = round((low_quality / total) * 100, 1) if total else 0
    generated = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    providers = list(results[0].get("judges", {}).keys()) if results else []
    provider_avgs = _provider_avgs(results, providers)
    chart_colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

    buckets = [0] * 11
    for row in results:
        score = _weighted_score(row.get("correctness"), row.get("relevance"))
        if score is not None:
            buckets[max(0, min(10, int(round(score))))] += 1

    provider_cards_html = ""
    for i, provider in enumerate(providers):
        avg = provider_avgs.get(provider)
        color = chart_colors[i % len(chart_colors)]
        if avg is None:
            display = "N/A"
            subtitle = "Unavailable"
            border = "#475569"
        else:
            display = str(avg)
            subtitle = f"{provider.upper()} avg score"
            border = color
        provider_cards_html += f"""
        <div class=\"card\" style=\"border-top:3px solid {border};\">
          <h2 style=\"color:{border}\">{display}</h2>
          <p>{subtitle}</p>
        </div>
        """

    comparison_rows_html = ""
    for row in metrics.get("model_comparison", []):
        comparison_rows_html += f"""
        <tr>
          <td style=\"font-weight:700\">{str(row.get('model', '')).upper()}</td>
          <td>{row.get('correctness', 0):.4f}</td>
          <td>{row.get('relevance', 0):.4f}</td>
          <td>{row.get('hallucination', 0):.4f}</td>
          <td style=\"font-weight:700;color:#22c55e\">{row.get('overall', 0):.4f}</td>
        </tr>
        """
    if not comparison_rows_html:
        comparison_rows_html = """
        <tr><td colspan=\"5\" style=\"opacity:.7\">No provider comparison data available.</td></tr>
        """

    cost_rows_html = ""
    for row in metrics.get("cost_analysis", []):
        cost_rows_html += f"""
        <tr>
          <td style=\"font-weight:700\">{str(row.get('model', '')).upper()}</td>
          <td>{row.get('avg_tokens', 0)}</td>
          <td>${row.get('avg_cost_usd', 0)}</td>
          <td>${row.get('cost_per_1000_requests_usd', 0)}</td>
        </tr>
        """
    if not cost_rows_html:
        cost_rows_html = """
        <tr><td colspan=\"4\" style=\"opacity:.7\">No cost telemetry available.</td></tr>
        """

    provider_headers = "".join(
        f'<th style="border-top:3px solid {chart_colors[i % len(chart_colors)]}">{provider.upper()}</th>'
        for i, provider in enumerate(providers)
    )

    rows_html = ""
    for row in results:
        overall_score = _weighted_score(row.get("correctness"), row.get("relevance"))
        flagged = bool(row.get("hallucination")) or (overall_score is not None and overall_score < 5)
        badge = '<span class="badge-fail">FLAGGED</span>' if flagged else '<span class="badge-pass">PASS</span>'
        row_class = "flagged" if flagged else ""

        provider_cells = ""
        for provider in providers:
            judge = row.get("judges", {}).get(provider, {})
            if not judge.get("available", False):
                reason_short = str(judge.get("reason", "N/A"))[:40]
                provider_cells += f'<td><span class="badge-na">N/A</span><br><small style="opacity:.6">{reason_short}</small></td>'
                continue

            judge_score = _weighted_score(judge.get("correctness"), judge.get("relevance"))
            color = _score_color(judge_score)
            halluc = "RED" if judge.get("hallucination") else "GREEN"
            provider_cells += (
                f'<td><span style="font-size:18px;font-weight:bold;color:{color}">{judge_score}</span>'
                f'<br><small>{halluc} C:{judge.get("correctness")} R:{judge.get("relevance")}</small>'
                f'<br><small style="opacity:.55">{str(judge.get("reason", ""))[:60]}</small></td>'
            )

        overall_color = _score_color(overall_score)
        rows_html += f"""
        <tr class=\"{row_class}\">
          <td>{badge}</td>
          <td style=\"max-width:220px\">{row.get('question', '')}</td>
          <td style=\"max-width:220px;opacity:.8\">{row.get('model_answer', '')}</td>
          {provider_cells}
          <td><span style=\"font-size:20px;font-weight:bold;color:{overall_color}\">{overall_score}</span></td>
        </tr>
        """

    overall_header = '<th style="background:#0f172a">Overall</th>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AI Breaker Lab - Multi-Model Comparison</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
* {{ box-sizing:border-box; }}
body {{ font-family:Arial,sans-serif; background:#0f172a; color:#e2e8f0; margin:0; }}
header {{ background:#020617; padding:28px 40px; border-bottom:1px solid #1e293b; }}
header .header-row {{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }}
header h1 {{ margin:0 0 6px; font-size:22px; }}
header p {{ margin:0; opacity:.5; font-size:13px; }}
.header-actions {{ display:flex; gap:8px; flex-wrap:wrap; }}
.action-btn {{
  background:#1e293b;
  border:1px solid #334155;
  color:#e2e8f0;
  padding:7px 10px;
  border-radius:8px;
  font-size:12px;
  cursor:pointer;
}}
.action-btn:hover {{ background:#334155; }}
.action-toast {{
  min-height:18px;
  font-size:12px;
  color:#a5b4fc;
  opacity:.9;
  padding-top:6px;
}}
.container {{ padding:30px 40px; }}
.kpis {{ display:flex; gap:16px; flex-wrap:wrap; margin-bottom:30px; }}
.card {{ background:#1e293b; padding:18px 22px; border-radius:10px; flex:1; min-width:160px; }}
.card h2 {{ margin:0 0 4px; font-size:26px; }}
.card p {{ margin:0; opacity:.6; font-size:13px; }}
.section-title {{ font-size:16px; font-weight:bold; margin:36px 0 14px; color:#94a3b8; letter-spacing:.05em; text-transform:uppercase; }}
.charts {{ display:flex; gap:20px; flex-wrap:wrap; }}
.chart-box {{ background:#1e293b; padding:24px; border-radius:10px; flex:1; min-width:280px; max-height:280px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th {{ background:#1e293b; padding:10px 12px; text-align:left; position:sticky; top:0; z-index:1; }}
td {{ padding:10px 12px; border-bottom:1px solid #1e293b; vertical-align:top; }}
tr.flagged {{ background:#1c0a0a; }}
tr:not(.flagged):hover {{ background:#1e293b44; }}
.badge-pass {{ background:#166534; color:#bbf7d0; padding:3px 9px; border-radius:5px; font-size:11px; font-weight:bold; }}
.badge-fail {{ background:#7f1d1d; color:#fecaca; padding:3px 9px; border-radius:5px; font-size:11px; font-weight:bold; }}
.badge-na {{ background:#334155; color:#94a3b8; padding:3px 9px; border-radius:5px; font-size:11px; font-weight:bold; }}
.table-wrap {{ overflow-x:auto; border-radius:10px; border:1px solid #1e293b; }}
@media print {{
  body {{ background:#ffffff; color:#0f172a; }}
  header, .card, .chart-box, th, td, .table-wrap {{ border-color:#d1d5db !important; }}
  header {{ background:#ffffff; }}
  .container {{ padding:12px; }}
  .action-bar {{ display:none !important; }}
  .action-toast {{ display:none !important; }}
  .section-title {{ color:#334155; }}
}}
</style>
</head>
<body>
<header>
  <div class="header-row">
    <div>
      <h1>AI Breaker Lab - Multi-Model Comparison</h1>
      <p>Generated: {generated}</p>
    </div>
    <div class="header-actions action-bar">
      <button class="action-btn" onclick="window.print()">Print / Save PDF</button>
      <button class="action-btn" onclick="copyShareLink()">Copy Share Link</button>
    </div>
  </div>
  <div id="shareToast" class="action-toast"></div>
</header>
<div class="container">

  <div class="kpis">
    <div class="card"><h2>{metrics.get('average_score', 0)}</h2><p>Overall Avg Score</p></div>
    <div class="card"><h2>{hallucination_rate}%</h2><p>Hallucination Rate</p></div>
    <div class="card"><h2>{low_quality_rate}%</h2><p>Low Quality Rate</p></div>
    <div class="card"><h2>{metrics.get('min_score', 0)} / {metrics.get('max_score', 0)}</h2><p>Min / Max Score</p></div>
    <div class="card"><h2>{total}</h2><p>Rows Evaluated</p></div>
  </div>

  <div class="section-title">Judge Comparison</div>
  <div class="kpis">{provider_cards_html}</div>

  <div class="section-title">Score Distribution</div>
  <div class="charts">
    <div class="chart-box"><canvas id="distChart"></canvas></div>
    <div class="chart-box"><canvas id="providerChart"></canvas></div>
  </div>

  <div class="section-title">Model Comparison</div>
  <div class="table-wrap" style="margin-bottom:24px">
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>Correctness</th>
          <th>Relevance</th>
          <th>Hallucination</th>
          <th>Overall</th>
        </tr>
      </thead>
      <tbody>{comparison_rows_html}</tbody>
    </table>
  </div>

  <div class="section-title">Cost Analysis</div>
  <div class="table-wrap" style="margin-bottom:24px">
    <table>
      <thead>
        <tr>
          <th>Model</th>
          <th>Avg Tokens</th>
          <th>Avg Cost</th>
          <th>Cost per 1000 Requests</th>
        </tr>
      </thead>
      <tbody>{cost_rows_html}</tbody>
    </table>
  </div>

  <div class="section-title">All Results - Per-Judge Breakdown</div>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Question</th>
          <th>Model Answer</th>
          {provider_headers}
          {overall_header}
        </tr>
      </thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>

</div>

<script>
new Chart(document.getElementById('distChart'), {{
  type: 'bar',
  data: {{ labels: {list(range(11))}, datasets: [{{ label: 'Score Distribution', data: {buckets}, backgroundColor: '#3b82f6', borderRadius: 4 }}] }},
  options: {{ plugins: {{ legend: {{ display: false }}, title: {{ display: true, text: 'Overall Score Distribution', color: '#94a3b8' }} }}, scales: {{ x: {{ ticks: {{ color: '#64748b' }}, grid: {{ color: '#1e293b' }} }}, y: {{ beginAtZero: true, ticks: {{ color: '#64748b' }}, grid: {{ color: '#1e293b' }} }} }} }}
}});

const providerLabels = {[p.upper() for p in providers]};
const providerScores = {[provider_avgs.get(p) if provider_avgs.get(p) is not None else 0 for p in providers]};
const providerColors = {chart_colors[:len(providers)]};
const providerAvailable = {[provider_avgs.get(p) is not None for p in providers]};

new Chart(document.getElementById('providerChart'), {{
  type: 'bar',
  data: {{ labels: providerLabels, datasets: [{{ label: 'Avg Score', data: providerScores, backgroundColor: providerLabels.map((_, i) => providerAvailable[i] ? providerColors[i] : '#334155'), borderRadius: 4 }}] }},
  options: {{ plugins: {{ legend: {{ display: false }}, title: {{ display: true, text: 'Average Score by Judge', color: '#94a3b8' }} }}, scales: {{ x: {{ ticks: {{ color: '#64748b' }}, grid: {{ color: '#1e293b' }} }}, y: {{ beginAtZero: true, max: 10, ticks: {{ color: '#64748b' }}, grid: {{ color: '#1e293b' }} }} }} }}
}});

function _showShareToast(message, isError=false) {{
  const toast = document.getElementById('shareToast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.color = isError ? '#fca5a5' : '#a5b4fc';
  window.setTimeout(() => {{
    if (toast.textContent === message) toast.textContent = '';
  }}, 2500);
}}

async function copyShareLink() {{
  const link = window.location.href;
  try {{
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      await navigator.clipboard.writeText(link);
      _showShareToast('Share link copied');
      return;
    }}
  }} catch (_err) {{
  }}
  _showShareToast('Clipboard unavailable. Copy this URL: ' + link, true);
}}
</script>
</body>
</html>"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)

    return output_path
