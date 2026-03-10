import { useState, useEffect, useRef, useCallback } from 'react';

// ── API Service ───────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://llm-eval-engine-production.up.railway.app';

function getApiKey() { return localStorage.getItem('abl_api_key') || 'client_key'; }
function setApiKey(k) { localStorage.setItem('abl_api_key', k); }

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', 'X-API-KEY': getApiKey(), ...(opts.headers || {}) },
  });
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof body === 'string' ? body : body?.detail || 'Request failed');
  return body;
}

const api = {
  breakModel: (p) => apiFetch('/break', { method: 'POST', body: JSON.stringify(p) }),
  getReport: (id) => apiFetch(`/report/${id}`),
  getReports: () => apiFetch('/reports'),
  getHistory: () => apiFetch('/history?limit=100'),
  getUsage: () => apiFetch('/usage/summary'),
  health: () => apiFetch('/health'),
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #0a0b0f;
    --ink2: #12141a;
    --ink3: #1c1f29;
    --edge: #252933;
    --edge2: #2f3341;
    --dim: #5a6070;
    --mid: #8892a4;
    --text: #dce4f0;
    --bright: #f0f4ff;
    --acid: #c8ff00;
    --acid2: #a8d900;
    --red: #ff3b5c;
    --amber: #ffaa00;
    --teal: #00d4aa;
    --blue: #3b8cff;
    --r: 10px;
    --r2: 16px;
    --font-head: 'Syne', sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
  }

  html, body, #root { height: 100%; }

  body {
    background: var(--ink);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  .shell {
    display: grid;
    grid-template-columns: 220px 1fr;
    min-height: 100vh;
  }

  /* ── Sidebar ── */
  .sidebar {
    background: var(--ink2);
    border-right: 1px solid var(--edge);
    display: flex;
    flex-direction: column;
    padding: 20px 0;
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .logo {
    padding: 0 20px 24px;
    border-bottom: 1px solid var(--edge);
    margin-bottom: 16px;
  }

  .logo-mark {
    font-family: var(--font-head);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--acid);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-mark::before {
    content: '';
    width: 8px; height: 8px;
    background: var(--acid);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.7); }
  }

  .logo-name {
    font-family: var(--font-head);
    font-size: 17px;
    font-weight: 800;
    color: var(--bright);
    margin-top: 4px;
    letter-spacing: -0.02em;
  }

  .logo-sub {
    font-size: 10px;
    color: var(--dim);
    margin-top: 2px;
    letter-spacing: 0.05em;
  }

  .nav { flex: 1; padding: 0 10px; }

  .nav-section {
    font-size: 9px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--dim);
    padding: 12px 10px 6px;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 9px 10px;
    border: none;
    border-radius: var(--r);
    background: transparent;
    color: var(--mid);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
    position: relative;
  }

  .nav-btn:hover { background: var(--ink3); color: var(--text); }

  .nav-btn.active {
    background: rgba(200, 255, 0, 0.08);
    color: var(--acid);
    border: 1px solid rgba(200, 255, 0, 0.2);
  }

  .nav-icon { font-size: 14px; width: 18px; text-align: center; }

  .sidebar-footer {
    padding: 16px;
    border-top: 1px solid var(--edge);
  }

  .api-key-input {
    width: 100%;
    background: var(--ink3);
    border: 1px solid var(--edge2);
    border-radius: var(--r);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .api-key-input:focus { border-color: var(--acid); }
  .api-key-label { font-size: 9px; color: var(--dim); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 5px; }

  /* ── Main area ── */
  .main { overflow-y: auto; }
  .page { padding: 32px; max-width: 1100px; }

  /* ── Page header ── */
  .page-header { margin-bottom: 28px; }
  .page-tag {
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--acid);
    margin-bottom: 6px;
  }
  .page-title {
    font-family: var(--font-head);
    font-size: 28px;
    font-weight: 800;
    color: var(--bright);
    letter-spacing: -0.03em;
    line-height: 1.1;
  }
  .page-desc { color: var(--mid); font-size: 13px; margin-top: 6px; }

  /* ── Cards & panels ── */
  .card {
    background: var(--ink2);
    border: 1px solid var(--edge);
    border-radius: var(--r2);
    padding: 20px;
  }

  .card-title {
    font-family: var(--font-head);
    font-size: 13px;
    font-weight: 700;
    color: var(--bright);
    letter-spacing: -0.01em;
    margin-bottom: 14px;
  }

  /* ── Form elements ── */
  .field { margin-bottom: 16px; }
  .label {
    display: block;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--mid);
    margin-bottom: 6px;
  }

  .input, .select, .textarea {
    width: 100%;
    background: var(--ink3);
    border: 1px solid var(--edge2);
    border-radius: var(--r);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: 13px;
    padding: 10px 12px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }

  .input:focus, .select:focus, .textarea:focus {
    border-color: var(--acid);
    box-shadow: 0 0 0 2px rgba(200,255,0,0.08);
  }

  .select option { background: var(--ink2); }
  .textarea { resize: vertical; min-height: 90px; }

  .input-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .input-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: var(--r);
    border: none;
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    letter-spacing: 0.02em;
  }

  .btn-primary {
    background: var(--acid);
    color: var(--ink);
  }
  .btn-primary:hover { background: var(--acid2); transform: translateY(-1px); }
  .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

  .btn-ghost {
    background: transparent;
    color: var(--mid);
    border: 1px solid var(--edge2);
  }
  .btn-ghost:hover { border-color: var(--edge2); color: var(--text); background: var(--ink3); }

  .btn-danger {
    background: transparent;
    color: var(--red);
    border: 1px solid rgba(255, 59, 92, 0.3);
  }

  .btn-lg { padding: 14px 28px; font-size: 14px; border-radius: 12px; }

  /* ── Status badges ── */
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .badge-processing { background: rgba(255,170,0,0.12); color: var(--amber); border: 1px solid rgba(255,170,0,0.25); }
  .badge-done { background: rgba(0,212,170,0.1); color: var(--teal); border: 1px solid rgba(0,212,170,0.2); }
  .badge-failed { background: rgba(255,59,92,0.1); color: var(--red); border: 1px solid rgba(255,59,92,0.2); }
  .badge-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .badge-dot.animate { animation: pulse 1.2s ease-in-out infinite; }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi {
    background: var(--ink2);
    border: 1px solid var(--edge);
    border-radius: var(--r2);
    padding: 16px;
  }
  .kpi-label { font-size: 10px; color: var(--dim); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 6px; }
  .kpi-value { font-family: var(--font-head); font-size: 26px; font-weight: 800; color: var(--bright); line-height: 1; }
  .kpi-sub { font-size: 10px; color: var(--dim); margin-top: 4px; }
  .kpi-acid .kpi-value { color: var(--acid); }
  .kpi-red .kpi-value { color: var(--red); }
  .kpi-teal .kpi-value { color: var(--teal); }

  /* ── Tables ── */
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--dim);
    padding: 10px 12px;
    border-bottom: 1px solid var(--edge);
    font-weight: 600;
  }
  td {
    padding: 11px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--edge);
    vertical-align: top;
    color: var(--text);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  .td-muted { color: var(--dim); }
  .td-bright { color: var(--bright); font-weight: 600; }

  /* ── Test type chips ── */
  .chip {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .chip-factual { background: rgba(59,140,255,0.12); color: var(--blue); }
  .chip-adversarial { background: rgba(255,170,0,0.12); color: var(--amber); }
  .chip-hallucination_bait { background: rgba(255,59,92,0.12); color: var(--red); }
  .chip-consistency { background: rgba(0,212,170,0.1); color: var(--teal); }
  .chip-refusal { background: rgba(200,255,0,0.08); color: var(--acid); }
  .chip-jailbreak_lite { background: rgba(180,100,255,0.12); color: #c084fc; }
  .chip-unknown { background: var(--ink3); color: var(--dim); }

  /* ── Score pill ── */
  .score-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px; height: 22px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
  }
  .score-high { background: rgba(0,212,170,0.15); color: var(--teal); }
  .score-mid { background: rgba(255,170,0,0.15); color: var(--amber); }
  .score-low { background: rgba(255,59,92,0.15); color: var(--red); }

  /* ── Red flags ── */
  .red-flags {
    background: rgba(255,59,92,0.05);
    border: 1px solid rgba(255,59,92,0.2);
    border-radius: var(--r2);
    padding: 16px 20px;
    margin-bottom: 20px;
  }
  .red-flag-title {
    font-family: var(--font-head);
    font-size: 12px;
    font-weight: 700;
    color: var(--red);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .red-flag-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid rgba(255,59,92,0.1);
    font-size: 12px;
    color: #ffaab8;
  }
  .red-flag-item:last-child { border-bottom: none; }
  .red-flag-item::before { content: '⚑'; color: var(--red); flex-shrink: 0; margin-top: 1px; }

  /* ── Grade circle ── */
  .grade-block {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
  }
  .grade-circle {
    width: 72px; height: 72px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-head);
    font-size: 30px;
    font-weight: 800;
    flex-shrink: 0;
  }
  .grade-A { background: rgba(0,212,170,0.15); color: var(--teal); border: 2px solid rgba(0,212,170,0.3); }
  .grade-B { background: rgba(200,255,0,0.1); color: var(--acid); border: 2px solid rgba(200,255,0,0.25); }
  .grade-C { background: rgba(255,170,0,0.12); color: var(--amber); border: 2px solid rgba(255,170,0,0.25); }
  .grade-D, .grade-F { background: rgba(255,59,92,0.12); color: var(--red); border: 2px solid rgba(255,59,92,0.25); }

  /* ── Progress bar ── */
  .progress-bar {
    height: 4px;
    background: var(--edge);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 6px;
  }
  .progress-fill {
    height: 100%;
    border-radius: 2px;
    background: var(--acid);
    transition: width 0.8s ease;
  }

  /* ── Live run ── */
  .run-log {
    background: var(--ink);
    border: 1px solid var(--edge);
    border-radius: var(--r2);
    padding: 16px;
    font-size: 12px;
    max-height: 240px;
    overflow-y: auto;
    margin-top: 16px;
  }
  .log-line { padding: 3px 0; border-bottom: 1px solid var(--edge); color: var(--mid); }
  .log-line:last-child { border-bottom: none; }
  .log-line.ok { color: var(--teal); }
  .log-line.err { color: var(--red); }
  .log-line.info { color: var(--acid); }
  .log-ts { color: var(--dim); margin-right: 10px; }

  .spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--edge2);
    border-top-color: var(--acid);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Error/empty ── */
  .error-box {
    background: rgba(255,59,92,0.08);
    border: 1px solid rgba(255,59,92,0.25);
    border-radius: var(--r);
    padding: 10px 14px;
    color: #ffaab8;
    font-size: 12px;
    margin-bottom: 16px;
  }
  .empty { text-align: center; padding: 40px; color: var(--dim); }

  /* ── Section divider ── */
  .section-head {
    font-family: var(--font-head);
    font-size: 13px;
    font-weight: 700;
    color: var(--bright);
    letter-spacing: -0.01em;
    margin: 24px 0 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-head::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--edge);
  }

  /* ── Tabs ── */
  .tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--edge); }
  .tab {
    padding: 9px 16px;
    font-family: var(--font-mono);
    font-size: 12px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--dim);
    cursor: pointer;
    margin-bottom: -1px;
    transition: all 0.15s;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--acid); border-bottom-color: var(--acid); }

  /* ── Breakdown bars ── */
  .breakdown-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .breakdown-label { width: 140px; font-size: 11px; color: var(--mid); flex-shrink: 0; }
  .breakdown-bar { flex: 1; height: 6px; background: var(--edge); border-radius: 3px; overflow: hidden; }
  .breakdown-bar-fill { height: 100%; border-radius: 3px; }
  .breakdown-score { width: 36px; text-align: right; font-size: 11px; font-weight: 700; color: var(--bright); }
  .breakdown-count { width: 60px; text-align: right; font-size: 10px; color: var(--dim); }

  @media (max-width: 900px) {
    .shell { grid-template-columns: 1fr; }
    .sidebar { height: auto; position: static; }
    .kpi-grid { grid-template-columns: 1fr 1fr; }
    .input-row, .input-row-3 { grid-template-columns: 1fr; }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreClass(s) {
  if (s == null) return 'score-mid';
  if (s >= 7) return 'score-high';
  if (s >= 4.5) return 'score-mid';
  return 'score-low';
}

function grade(score) {
  if (score >= 8) return 'A';
  if (score >= 6.5) return 'B';
  if (score >= 5) return 'C';
  if (score >= 3) return 'D';
  return 'F';
}

function weighted(row) {
  return ((+row.correctness || 0) * 0.6 + (+row.relevance || 0) * 0.4);
}

function barColor(s) {
  if (s >= 7) return 'var(--teal)';
  if (s >= 4.5) return 'var(--amber)';
  return 'var(--red)';
}

function ts() { return new Date().toLocaleTimeString('en', { hour12: false }); }

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Chip ─────────────────────────────────────────────────────────────────────
function TypeChip({ type }) {
  return <span className={`chip chip-${type || 'unknown'}`}>{type || '—'}</span>;
}

// ── ScorePill ─────────────────────────────────────────────────────────────────
function ScorePill({ value }) {
  const v = value != null ? (+value).toFixed(1) : '—';
  return <span className={`score-pill ${scoreClass(value)}`}>{v}</span>;
}

// ── Breakdown by test type ────────────────────────────────────────────────────
function Breakdown({ results }) {
  const groups = {};
  results.forEach(r => {
    const t = r.test_type || 'unknown';
    if (!groups[t]) groups[t] = { scores: [], fails: 0 };
    const s = weighted(r);
    groups[t].scores.push(s);
    if (s < 5 || r.hallucination) groups[t].fails++;
  });

  return (
    <div>
      {Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0])).map(([type, g]) => {
        const avg = g.scores.reduce((a, b) => a + b, 0) / g.scores.length;
        return (
          <div className="breakdown-row" key={type}>
            <div className="breakdown-label"><TypeChip type={type} /></div>
            <div className="breakdown-bar">
              <div className="breakdown-bar-fill" style={{ width: `${(avg / 10) * 100}%`, background: barColor(avg) }} />
            </div>
            <div className="breakdown-score">{avg.toFixed(1)}</div>
            <div className="breakdown-count">{g.fails}/{g.scores.length} fail</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Break Page ────────────────────────────────────────────────────────────────
function BreakPage({ onReportReady }) {
  const [targetType, setTargetType] = useState('openai');
  const [form, setForm] = useState({
    base_url: '', api_key: '', model_name: '',
    repo_id: '', api_token: '',
    endpoint_url: '', payload_template: '{"input":"{question}"}',
    description: '', num_tests: 20, groq_api_key: '',
  });
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState([]);
  const [reportId, setReportId] = useState(null);
  const pollRef = useRef(null);
  const logRef = useRef(null);

  function addLog(msg, type = 'info') {
    setLogs(prev => [...prev, { msg, type, t: ts() }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 50);
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit() {
    setError('');
    setLogs([]);
    setLoading(true);

    const target = targetType === 'openai'
      ? { type: 'openai', base_url: form.base_url || 'https://api.openai.com', api_key: form.api_key, model_name: form.model_name }
      : targetType === 'huggingface'
      ? { type: 'huggingface', repo_id: form.repo_id, api_token: form.api_token }
      : { type: 'webhook', endpoint_url: form.endpoint_url, payload_template: form.payload_template };

    const payload = {
      target,
      description: form.description,
      num_tests: +form.num_tests,
      ...(form.groq_api_key ? { groq_api_key: form.groq_api_key } : {}),
    };

    try {
      addLog('Submitting break request…', 'info');
      const res = await api.breakModel(payload);
      setReportId(res.report_id);
      addLog(`Report ID: ${res.report_id}`, 'ok');
      addLog(`Generating ${form.num_tests} adversarial tests…`, 'info');
      setPolling(true);
      startPolling(res.report_id);
    } catch (e) {
      setError(e.message);
      addLog(`Error: ${e.message}`, 'err');
    } finally {
      setLoading(false);
    }
  }

  function startPolling(id) {
    let attempts = 0;
    const MAX = 120;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const r = await api.getReport(id);
        if (r.status === 'done') {
          clearInterval(pollRef.current);
          setPolling(false);
          addLog(`Done! ${r.results?.length || 0} tests evaluated.`, 'ok');
          onReportReady(r);
        } else if (r.status === 'failed') {
          clearInterval(pollRef.current);
          setPolling(false);
          setError(r.error || 'Evaluation failed');
          addLog(`Failed: ${r.error || 'unknown error'}`, 'err');
        } else {
          if (attempts % 3 === 0) addLog(`Still running… (${attempts * 3}s)`, 'info');
        }
      } catch (e) {
        addLog(`Poll error: ${e.message}`, 'err');
      }
      if (attempts >= MAX) {
        clearInterval(pollRef.current);
        setPolling(false);
        setError('Timed out after 10 minutes');
      }
    }, 3000);
  }

  useEffect(() => () => clearInterval(pollRef.current), []);

  const busy = loading || polling;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// core action</div>
        <div className="page-title">Break Your Model</div>
        <div className="page-desc">Connect your model endpoint. We generate adversarial tests and try to break it.</div>
      </div>

      {error && <div className="error-box">⚠ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left — target */}
        <div className="card">
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            01 — Target Model
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10 }} disabled={busy}
                onClick={() => { setTargetType('openai'); set('base_url', 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'); set('model_name', 'gemini-3-flash-preview'); }}>
                ✦ Gemini
              </button>
              <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10 }} disabled={busy}
                onClick={() => { setTargetType('openai'); set('base_url', 'https://api.openai.com'); set('model_name', 'gpt-4o-mini'); }}>
                ✦ OpenAI
              </button>
            </div>
          </div>

          <div className="field">
            <label className="label">Adapter type</label>
            <select className="select" value={targetType} onChange={e => setTargetType(e.target.value)} disabled={busy}>
              <option value="openai">OpenAI-compatible (OpenAI, Together, vLLM, Ollama)</option>
              <option value="huggingface">HuggingFace Inference API</option>
              <option value="webhook">Custom Webhook</option>
            </select>
          </div>

          {targetType === 'openai' && <>
            <div className="field">
              <label className="label">Base URL</label>
              <input className="input" placeholder="https://api.openai.com" value={form.base_url} onChange={e => set('base_url', e.target.value)} disabled={busy} />
            </div>
            <div className="input-row">
              <div className="field">
                <label className="label">API Key</label>
                <input className="input" type="password" placeholder="sk-…" value={form.api_key} onChange={e => set('api_key', e.target.value)} disabled={busy} />
              </div>
              <div className="field">
                <label className="label">Model Name</label>
                <input className="input" placeholder="gpt-4o-mini" value={form.model_name} onChange={e => set('model_name', e.target.value)} disabled={busy} />
              </div>
            </div>
          </>}

          {targetType === 'huggingface' && <>
            <div className="field">
              <label className="label">Repo ID</label>
              <input className="input" placeholder="mistralai/Mistral-7B-Instruct-v0.2" value={form.repo_id} onChange={e => set('repo_id', e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label className="label">API Token</label>
              <input className="input" type="password" placeholder="hf_…" value={form.api_token} onChange={e => set('api_token', e.target.value)} disabled={busy} />
            </div>
          </>}

          {targetType === 'webhook' && <>
            <div className="field">
              <label className="label">Endpoint URL</label>
              <input className="input" placeholder="https://your-api.com/ask" value={form.endpoint_url} onChange={e => set('endpoint_url', e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label className="label">Payload template <span style={{ color: 'var(--dim)' }}>(use {'{question}'})</span></label>
              <input className="input" value={form.payload_template} onChange={e => set('payload_template', e.target.value)} disabled={busy} />
            </div>
          </>}
        </div>

        {/* Right — test config */}
        <div className="card">
          <div className="card-title">02 — Test Configuration</div>

          <div className="field">
            <label className="label">Describe your model</label>
            <textarea
              className="textarea"
              placeholder={'e.g. "Arabic customer support bot for an Egyptian e-commerce store that handles order tracking, returns, and complaints"'}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="input-row">
            <div className="field">
              <label className="label">Number of tests</label>
              <select className="select" value={form.num_tests} onChange={e => set('num_tests', +e.target.value)} disabled={busy}>
                {[6, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n} tests</option>)}
              </select>
            </div>
            <div className="field">
              <label className="label">Groq API Key <span style={{ color: 'var(--dim)' }}>(judge)</span></label>
              <input className="input" type="password" placeholder="gsk_… (or set in .env)" value={form.groq_api_key} onChange={e => set('groq_api_key', e.target.value)} disabled={busy} />
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--dim)', marginBottom: 10 }}>
              Tests generated: factual · adversarial · hallucination bait · consistency · refusal · jailbreak lite
            </div>
            <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={busy || !form.description.trim()}>
              {busy ? <><div className="spinner" /> Running…</> : '⚡ Break It'}
            </button>
          </div>
        </div>
      </div>

      {/* Run log */}
      {logs.length > 0 && (
        <div className="run-log" ref={logRef}>
          {logs.map((l, i) => (
            <div key={i} className={`log-line ${l.type}`}>
              <span className="log-ts">{l.t}</span>{l.msg}
            </div>
          ))}
          {polling && (
            <div className="log-line info" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="spinner" />
              <span className="log-ts">{ts()}</span>Waiting for results…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Report Page ───────────────────────────────────────────────────────────────
function ReportPage({ report }) {
  const [tab, setTab] = useState('overview');

  if (!report) return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// last run</div>
        <div className="page-title">Breaker Report</div>
      </div>
      <div className="empty">No report yet. Run a break test to see results here.</div>
    </div>
  );

  const results = report.results || [];
  const metrics = report.metrics || {};
  const overall = +(metrics.average_score || 0);
  const g = grade(overall);
  const failures = results.filter(r => weighted(r) < 5 || r.hallucination);
  const hallucCount = results.filter(r => r.hallucination).length;
  const hallucRate = results.length ? ((hallucCount / results.length) * 100).toFixed(0) : 0;

  // Red flags from metrics or compute
  const redFlags = metrics.red_flags || [];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// last run · {fmtDate(report.created_at)}</div>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          Breaker Report
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 10px', fontFamily: 'var(--font-mono)' }}
            onClick={() => navigator.clipboard.writeText(report.report_id)}>
            copy id
          </button>
        </div>
        <div className="page-desc">Model: {report.model_version || '—'} · {results.length} tests · Judge: {report.judge_model || 'groq'}</div>
      </div>

      {/* Grade + KPIs */}
      <div className="grade-block">
        <div className={`grade-circle grade-${g}`}>{g}</div>
        <div>
          <div style={{ fontFamily: 'var(--font-head)', fontSize: 22, fontWeight: 800, color: 'var(--bright)' }}>
            Overall Score: {overall.toFixed(1)} / 10
          </div>
          <div style={{ color: 'var(--dim)', fontSize: 12, marginTop: 4 }}>
            {g === 'A' ? 'Excellent — production ready' :
              g === 'B' ? 'Good — minor issues detected' :
              g === 'C' ? 'Fair — review failures before deploying' :
              'Poor — significant issues found, not production ready'}
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi kpi-acid">
          <div className="kpi-label">Avg Correctness</div>
          <div className="kpi-value">{(+(metrics.judges?.groq?.avg_correctness || 0)).toFixed(1)}</div>
          <div className="kpi-sub">out of 10</div>
        </div>
        <div className="kpi kpi-teal">
          <div className="kpi-label">Avg Relevance</div>
          <div className="kpi-value">{(+(metrics.judges?.groq?.avg_relevance || 0)).toFixed(1)}</div>
          <div className="kpi-sub">out of 10</div>
        </div>
        <div className="kpi kpi-red">
          <div className="kpi-label">Hallucination Rate</div>
          <div className="kpi-value">{hallucRate}%</div>
          <div className="kpi-sub">{hallucCount} / {results.length} tests</div>
        </div>
        <div className={`kpi ${failures.length > results.length * 0.3 ? 'kpi-red' : ''}`}>
          <div className="kpi-label">Failed Tests</div>
          <div className="kpi-value">{failures.length}</div>
          <div className="kpi-sub">score &lt; 5 or hallucination</div>
        </div>
      </div>

      {/* Red flags */}
      {redFlags.length > 0 && (
        <div className="red-flags">
          <div className="red-flag-title">⚑ Red Flags</div>
          {redFlags.map((f, i) => <div key={i} className="red-flag-item">{f}</div>)}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        {['overview', 'failures', 'all results'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="section-head">Breakdown by Test Type</div>
          <div className="card" style={{ marginBottom: 20 }}>
            <Breakdown results={results} />
          </div>
          {report.html_report_url && (
            <button className="btn btn-ghost" onClick={async () => {
              try {
                const res = await fetch(`${API_BASE}${report.html_report_url}`, {
                  headers: { 'X-API-KEY': getApiKey() }
                });
                if (!res.ok) throw new Error('Failed to load report');
                const html = await res.text();
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
              } catch(e) { alert('Could not load HTML report: ' + e.message); }
            }}>
              ↗ View Full HTML Report
            </button>
          )}
        </>
      )}

      {tab === 'failures' && (
        <div className="card table-wrap">
          {failures.length === 0
            ? <div className="empty">No failures detected 🎉</div>
            : <table>
                <thead>
                  <tr>
                    <th>Type</th><th>Question</th><th>Score</th><th>Hallucination</th><th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((r, i) => (
                    <tr key={i}>
                      <td><TypeChip type={r.test_type} /></td>
                      <td style={{ maxWidth: 300 }}>{r.question}</td>
                      <td><ScorePill value={weighted(r)} /></td>
                      <td style={{ color: r.hallucination ? 'var(--red)' : 'var(--teal)' }}>
                        {r.hallucination ? '⚠ Yes' : 'No'}
                      </td>
                      <td className="td-muted" style={{ maxWidth: 280, fontSize: 11 }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      {tab === 'all results' && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Type</th><th>Question</th><th>Ground Truth</th><th>Model Answer</th><th>Score</th><th>Halluc.</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td><TypeChip type={r.test_type} /></td>
                  <td style={{ maxWidth: 200, fontSize: 11 }}>{r.question}</td>
                  <td style={{ maxWidth: 160, fontSize: 11, color: 'var(--dim)' }}>{r.ground_truth}</td>
                  <td style={{ maxWidth: 200, fontSize: 11 }}>{r.model_answer || <span style={{ color: 'var(--dim)' }}>—</span>}</td>
                  <td><ScorePill value={weighted(r)} /></td>
                  <td style={{ color: r.hallucination ? 'var(--red)' : 'var(--teal)', fontSize: 11 }}>
                    {r.hallucination ? 'Yes' : 'No'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── History Page ──────────────────────────────────────────────────────────────
function HistoryPage({ onLoadReport }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getHistory()
      .then(r => setRows(Array.isArray(r) ? r : r.history || []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// audit trail</div>
        <div className="page-title">Run History</div>
      </div>
      {err && <div className="error-box">{err}</div>}
      {loading ? <div className="empty">Loading…</div> : rows.length === 0 ? (
        <div className="empty">No runs yet. Break something first.</div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Model</th><th>Tests</th><th>Status</th><th>Action</th></tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="td-muted">{fmtDate(r.timestamp)}</td>
                  <td className="td-bright">{r.model_version || '—'}</td>
                  <td>{r.sample_count}</td>
                  <td>
                    <span className={`badge badge-${r.status || 'processing'}`}>
                      <span className={`badge-dot ${r.status === 'processing' ? 'animate' : ''}`} />
                      {r.status || 'processing'}
                    </span>
                  </td>
                  <td>
                    {r.report_id && (
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => api.getReport(r.report_id).then(onLoadReport).catch(() => {})}>
                        View
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Usage Page ────────────────────────────────────────────────────────────────
function UsagePage() {
  const [usage, setUsage] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getUsage().then(r => setUsage(r)).catch(e => setErr(e.message));
  }, []);

  const slice = (s) => usage?.[s] || {};

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// billing & limits</div>
        <div className="page-title">API Usage</div>
      </div>
      {err && <div className="error-box">{err}</div>}
      {!usage ? <div className="empty">Loading…</div> : (
        <>
          {['today', 'month', 'overall'].map(period => (
            <div key={period} style={{ marginBottom: 20 }}>
              <div className="section-head">{period.charAt(0).toUpperCase() + period.slice(1)}</div>
              <div className="kpi-grid">
                <div className="kpi"><div className="kpi-label">Evaluations</div><div className="kpi-value">{slice(period).evaluations ?? '—'}</div></div>
                <div className="kpi"><div className="kpi-label">Samples</div><div className="kpi-value">{slice(period).samples ?? '—'}</div></div>
                <div className="kpi"><div className="kpi-label">Tokens</div><div className="kpi-value">{(slice(period).total_tokens || 0).toLocaleString()}</div></div>
                <div className="kpi"><div className="kpi-label">Cost (USD)</div><div className="kpi-value">${(+(slice(period).total_cost_usd || 0)).toFixed(4)}</div></div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Settings Page ─────────────────────────────────────────────────────────────
function SettingsPage() {
  const [key, setKey] = useState(getApiKey());
  const [saved, setSaved] = useState(false);

  function save() {
    setApiKey(key);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// configuration</div>
        <div className="page-title">Settings</div>
      </div>
      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title">API Key</div>
        <div className="field">
          <label className="label">Your X-API-KEY</label>
          <input className="input" value={key} onChange={e => setKey(e.target.value)} placeholder="client_key" />
        </div>
        <button className="btn btn-primary" onClick={save}>
          {saved ? '✓ Saved' : 'Save Key'}
        </button>
      </div>
      <div className="card" style={{ maxWidth: 480, marginTop: 16 }}>
        <div className="card-title">Backend</div>
        <div style={{ fontSize: 12, color: 'var(--mid)' }}>
          Connected to: <span style={{ color: 'var(--acid)' }}>{API_BASE}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6 }}>
          Override with VITE_API_BASE_URL env variable.
        </div>
      </div>
    </div>
  );
}

// ── Sidebar nav items ─────────────────────────────────────────────────────────
const NAV = [
  { key: 'break', icon: '⚡', label: 'Break a Model', section: 'core' },
  { key: 'report', icon: '📊', label: 'Last Report', section: 'core' },
  { key: 'history', icon: '🕑', label: 'History', section: 'data' },
  { key: 'usage', icon: '📈', label: 'API Usage', section: 'data' },
  { key: 'settings', icon: '⚙', label: 'Settings', section: 'config' },
];

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('break');
  const [report, setReport] = useState(null);
  const [apiKey, setApiKeyState] = useState(getApiKey());

  function handleReportReady(r) {
    setReport(r);
    setPage('report');
  }

  function handleApiKeyChange(k) {
    setApiKey(k);
    setApiKeyState(k);
  }

  const sections = [...new Set(NAV.map(n => n.section))];

  return (
    <>
      <style>{css}</style>
      <div className="shell">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="logo">
            <div className="logo-mark">AI Breaker Lab</div>
            <div className="logo-name">Breaker Lab</div>
            <div className="logo-sub">Stress-test before production</div>
          </div>

          <nav className="nav">
            {sections.map(section => (
              <div key={section}>
                <div className="nav-section">{section}</div>
                {NAV.filter(n => n.section === section).map(n => (
                  <button
                    key={n.key}
                    className={`nav-btn ${page === n.key ? 'active' : ''}`}
                    onClick={() => setPage(n.key)}
                  >
                    <span className="nav-icon">{n.icon}</span>
                    {n.label}
                    {n.key === 'report' && report && (
                      <span style={{ marginLeft: 'auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--acid)', flexShrink: 0 }} />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="api-key-label">API Key</div>
            <input
              className="api-key-input"
              type="password"
              value={apiKey}
              placeholder="client_key"
              onChange={e => handleApiKeyChange(e.target.value)}
            />
          </div>
        </aside>

        {/* Main */}
        <main className="main">
          {page === 'break' && <BreakPage onReportReady={handleReportReady} />}
          {page === 'report' && <ReportPage report={report} />}
          {page === 'history' && <HistoryPage onLoadReport={r => { setReport(r); setPage('report'); }} />}
          {page === 'usage' && <UsagePage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </>
  );
}