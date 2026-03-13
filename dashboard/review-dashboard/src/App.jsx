/**
 * AI Breaker Lab — App.jsx (Full Replacement)
 *
 * Drop this into dashboard/review-dashboard/src/App.jsx
 *
 * Wired to the real backend:
 *   POST   /break                   → start a break run
 *   GET    /report/{id}             → poll for results
 *   GET    /reports                 → list all reports for client
 *   GET    /history                 → history rows
 *   GET    /usage/summary           → usage numbers
 *   GET    /health                  → health check
 *   DELETE /report/{id}             → delete report
 *
 * New features:
 *   1. Comparison View — two runs side-by-side, diff per test-type
 *   2. Shareable Report URL — /r/{token} (read-only preview)
 *   3. Live Progress View — stage tracker + real progress bar + log stream
 *   4. Notifications — Slack webhook / email config (stored in localStorage)
 *
 * Three persona views (switcher in sidebar):
 *   dev  → full data, comparison, CI regression detection
 *   pm   → one-page summary, grade, top 3 failures, recommendation
 *   ent  → branded "evaluation certificate" for clients / regulators
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getAuthHeader } from './context/AuthContext.jsx';
import JudgeConfigPanel from './components/JudgeConfigPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_BASE_URL
  || 'https://llm-eval-engine-production.up.railway.app';
export const SHARE_BASE = import.meta.env.VITE_SHARE_BASE_URL
  || 'https://llm-eval-engine-production.up.railway.app';

const STAGES = [
  { id: 'init',     label: 'Initialising',          icon: '◈', detail: 'Connecting to target model' },
  { id: 'generate', label: 'Generating test suite',  icon: '⟐', detail: 'Building adversarial test cases with Groq' },
  { id: 'calling',  label: 'Calling target model',   icon: '⟳', detail: 'Running prompts against your model' },
  { id: 'scoring',  label: 'Scoring responses',      icon: '◎', detail: 'Judge model evaluating each output' },
  { id: 'report',   label: 'Compiling report',       icon: '▣', detail: 'Computing metrics and generating report' },
];

const PRESETS = [
  { label: 'GPT-4o mini',  url: 'https://api.openai.com',                                              model: 'gpt-4o-mini' },
  { label: 'Gemini Flash', url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash' },
  { label: 'Groq Llama',  url: 'https://api.groq.com/openai/v1',                                       model: 'llama-3.3-70b-versatile' },
];

const DEMO_MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', hint: 'stable' },
  { value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', hint: 'preview' },
  { value: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite', hint: 'preview' },
];

const DEMO_DESCRIPTION_SUGGESTIONS = [
  'A customer support chatbot for an e-commerce store',
  'A medical FAQ assistant',
  'نظام دعم عملاء بالعربية',
];

const TEST_TYPE_SEQUENCE = ['Hallucination', 'Adversarial', 'Safety', 'Correctness', 'Grounding', 'Red-team'];

// ─── Storage helpers ──────────────────────────────────────────────────────────

export const ls = {
  get: (k, fallback = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export function getApiKey() { return ls.get('abl_api_key') || 'client_key'; }
export function setApiKey(k) { ls.set('abl_api_key', k); }

// ─── API layer ────────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}, includeAuth = true) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(includeAuth ? { 'X-API-KEY': getApiKey() } : {}),
      ...(includeAuth ? getAuthHeader() : {}),
      ...(opts.headers || {}),
    },
  });
  const ct   = res.headers.get('content-type') || '';
  const body = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(typeof body === 'string' ? body : body?.detail || 'Request failed');
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

export const api = {
  health:       ()    => apiFetch('/health'),
  breakModel:   (p)   => apiFetch('/break', { method: 'POST', body: JSON.stringify(p) }),
  demoBreak:    (p)   => apiFetch('/demo/break', { method: 'POST', body: JSON.stringify(p) }, false),
  createTarget: (p)   => apiFetch('/targets', { method: 'POST', body: JSON.stringify(p) }),
  getTargets:   ()    => apiFetch('/targets'),
  getTarget:    (id)  => apiFetch(`/targets/${id}`),
  deleteTarget: (id)  => apiFetch(`/targets/${id}`, { method: 'DELETE' }),
  getReport:    (id)  => apiFetch(`/report/${id}`),
  getDemoReport:(id)  => apiFetch(`/demo/report/${id}`, {}, false),
  cancelReport: (id)  => apiFetch(`/report/${id}/cancel`, { method: 'POST' }),
  cancelDemoReport: (id) => apiFetch(`/demo/report/${id}/cancel`, { method: 'POST' }, false),
  getReports:   ()    => apiFetch('/reports'),
  getHistory:   ()    => apiFetch('/history?limit=100'),
  getUsage:     ()    => apiFetch('/usage/summary'),
  getUsageSummary: () => apiFetch('/usage/summary'),
  deleteReport: (id)  => apiFetch(`/report/${id}`, { method: 'DELETE' }),
};

// ─── Poll store (survives tab switches) ──────────────────────────────────────

export const POLL = { timerId: null, reportId: null, attempts: 0, numTests: 20, cbs: new Set(), fetchReport: api.getReport, mode: 'break' };
export const pollSub    = (cb) => { POLL.cbs.add(cb); return () => POLL.cbs.delete(cb); };
const pollNotify = (ev) => POLL.cbs.forEach(cb => cb(ev));
export const pollActive = ()   => !!POLL.timerId;

function stageFromAttempts(attempts, n) {
  const s = attempts * 3;
  if (s < 5)                         return 0;
  if (s < 12)                        return 1;
  if (s < 12 + n * 5 * 0.5)         return 2;
  if (s < 12 + n * 5 * 0.9)         return 3;
  return 4;
}

export function pollStart(reportId, numTests = 20, fetchReport = api.getReport, mode = 'break') {
  if (POLL.timerId) clearInterval(POLL.timerId);
  POLL.reportId = reportId; POLL.attempts = 0; POLL.numTests = numTests; POLL.fetchReport = fetchReport; POLL.mode = mode;
  POLL.timerId = setInterval(async () => {
    POLL.attempts++;
    try {
      const r = await POLL.fetchReport(reportId);
      if (r.status === 'done' || r.status === 'stale') {
        clearInterval(POLL.timerId); POLL.timerId = null;
        pollNotify({ type: 'done', report: r, mode: POLL.mode });
      } else if (r.status === 'canceled') {
        clearInterval(POLL.timerId); POLL.timerId = null;
        pollNotify({ type: 'canceled', report: r, mode: POLL.mode });
      } else if (r.status === 'failed') {
        clearInterval(POLL.timerId); POLL.timerId = null;
        pollNotify({ type: 'failed', error: r.error || 'Evaluation failed', report: r, mode: POLL.mode });
      } else {
        const stage = stageFromAttempts(POLL.attempts, numTests);
        const total = 12 + numTests * 5;
        const pct   = Math.min(95, Math.round((POLL.attempts * 3 / total) * 100));
        pollNotify({ type: 'tick', attempts: POLL.attempts, stage, pct, mode: POLL.mode });
      }
    } catch (e) {
      pollNotify({ type: 'error', error: e.message, mode: POLL.mode });
    }
    if (POLL.attempts >= 140) {
      clearInterval(POLL.timerId); POLL.timerId = null;
      pollNotify({ type: 'timeout', mode: POLL.mode });
    }
  }, 3000);
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

export function grade(s) {
  if (s >= 8.5) return 'A'; if (s >= 7) return 'B'; if (s >= 5.5) return 'C';
  if (s >= 4)   return 'D'; return 'F';
}

export function gradeColor(g) {
  return { A: 'var(--accent2)', B: '#86efac', C: '#fbbf24', D: '#fb923c', F: '#f87171' }[g] || '#888';
}

export function scoreColor(s) {
  return s >= 7 ? '#4ade80' : s >= 5 ? '#fbbf24' : '#f87171';
}

export function overallScore(report) {
  return parseFloat(
    report?.metrics?.average_score
    ?? report?.metrics?.overall_score
    ?? report?.average_score
    ?? report?.score
    ?? 0
  );
}

export function breakdownFromReport(report) {
  const bd = report?.metrics?.breakdown_by_type || report?.metrics?.breakdown || report?.metrics?.test_type_breakdown || {};
  return Object.entries(bd).map(([type, v]) => ({
    type,
    score:    parseFloat(v.avg_score ?? v.average_score ?? 0),
    count:    parseInt(v.count ?? 0),
    failures: parseInt(v.failures ?? v.failed ?? 0),
  }));
}

export function topFailures(report) {
  const failed = report?.metrics?.failed_rows || [];
  return failed.slice(0, 5);
}

export function regressionSummary(prevReport, nextReport) {
  if (!prevReport || !nextReport) {
    return { hasRegression: false, scoreRegressions: [], newFailures: [] };
  }

  const prevBreakdown = breakdownFromReport(prevReport);
  const nextBreakdown = breakdownFromReport(nextReport);
  const scoreRegressions = nextBreakdown.filter(row => {
    const prev = prevBreakdown.find(candidate => candidate.type === row.type);
    return prev && row.score - prev.score < -0.2;
  });

  const prevFailed = prevReport?.metrics?.failed_rows || [];
  const nextFailed = nextReport?.metrics?.failed_rows || [];
  const newFailures = nextFailed.filter(row => !prevFailed.find(prev => prev.question === row.question));

  return {
    hasRegression: scoreRegressions.length > 0 || newFailures.length > 0,
    scoreRegressions,
    newFailures,
  };
}

export function currentTestType(stage, pct) {
  if (stage <= 1) return 'Suite generation';
  if (stage >= 3) return 'Judge scoring';
  const progress = Math.max(0, Math.min(0.999, pct / 100));
  const index = Math.min(TEST_TYPE_SEQUENCE.length - 1, Math.floor(progress * TEST_TYPE_SEQUENCE.length));
  return TEST_TYPE_SEQUENCE[index];
}

export function selectComparisonBaseline(rows, focusReport) {
  const doneRows = (rows || []).filter(row => row?.status === 'done');
  if (!focusReport) {
    return {
      current: doneRows[0] || null,
      baseline: doneRows[1] || null,
    };
  }

  const focusCreatedAt = focusReport?.created_at ? new Date(focusReport.created_at).getTime() : null;
  const candidates = doneRows.filter(row => row?.report_id !== focusReport.report_id);
  const sameModel = candidates.filter(row => row?.model_version && row.model_version === focusReport.model_version);
  const ordered = (sameModel.length ? sameModel : candidates)
    .filter(row => !focusCreatedAt || !row?.created_at || new Date(row.created_at).getTime() <= focusCreatedAt)
    .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime());

  return {
    current: focusReport,
    baseline: ordered[0] || candidates.sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())[0] || null,
  };
}

async function shouldNotifyForRegression(report) {
  const rows = await api.getReports();
  const { baseline } = selectComparisonBaseline(rows, report);
  const baselineRow = baseline?.report_id ? baseline : null;
  if (!baselineRow) return false;

  const baselineReport = await api.getReport(baselineRow.report_id);
  return regressionSummary(baselineReport, report).hasRegression;
}

export function redFlags(report) {
  return report?.metrics?.red_flags || [];
}

export function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function ts() {
  return new Date().toLocaleTimeString('en', { hour12: false });
}

// ─── Notification helper (fire-and-forget) ────────────────────────────────────

export async function fireNotifications(report) {
  const cfg = ls.get('abl_notif_cfg', {});
  const failedRows = report?.metrics?.failed_rows || [];
  if (cfg.when === 'failure' && failedRows.length === 0) return;
  if (cfg.when === 'regression') {
    try {
      const hasRegression = await shouldNotifyForRegression(report);
      if (!hasRegression) return;
    } catch {
      return;
    }
  }
  const sc  = overallScore(report);
  const g   = grade(sc);
  const shareToken = report.share_token || report.report_id;
  const publicUrl = `${SHARE_BASE}/r/${shareToken}`;

  if (cfg.slack_enabled && cfg.slack_url) {
    const msg = {
      text: `*AI Breaker Lab* - run complete
` +
            `Model: \`${report.model_version || 'unknown'}\`  |  Score: *${sc.toFixed(1)}/10* (${g})
` +
            `Tests: ${report.sample_count || 0}  |  Failures: ${failedRows.length}
` +
            `Report: ${publicUrl}`,
    };
    try { await fetch(cfg.slack_url, { method: 'POST', body: JSON.stringify(msg) }); } catch {}
  }

  if (cfg.email_enabled && cfg.email_addr) {
    try {
      await apiFetch('/notify', {
        method: 'POST',
        body: JSON.stringify({
          report_id: report.report_id,
          email_enabled: true,
          email: cfg.email_addr,
        }),
      });
    } catch {}
  }
}

// ─── CSS (inline for portability) ─────────────────────────────────────────────

export const css = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg0:    #060810;
  --bg1:    #0C0F1A;
  --bg2:    #111520;
  --bg3:    #171C2C;
  --bg4:    #1E2638;
  --line:   #1F2A3D;
  --line2:  #263347;
  --text:   #E6EEFF;
  --hi:     #F0F6FF;
  --mid:    #7A96C0;
  --mute:   #3A4F6E;
  --accent:       #3BB4FF;
  --accent2:      #26F0B9;
  --accent-glow:  0 0 0 3px rgba(59, 180, 255, 0.12);
  --accent-dim:   rgba(59, 180, 255, 0.08);
  --green:  #3DDC97;
  --red:    #FF5C72;
  --blue:   #5B9BF5;
  --mono:   'IBM Plex Mono', monospace;
  --sans:   'IBM Plex Sans', sans-serif;
  --display:'Space Grotesk', sans-serif;
  --r:      5px;
  --r2:     9px;
  --sw:     220px;
}

html, body, #root { height: 100%; overflow: hidden; }
body {
  font-family: var(--sans);
  background:
    radial-gradient(circle at 10% 15%, rgba(59,180,255,0.10), transparent 36%),
    radial-gradient(circle at 85% 12%, rgba(38,240,185,0.08), transparent 30%),
    radial-gradient(circle at 35% 88%, rgba(59,180,255,0.06), transparent 28%),
    repeating-linear-gradient(
      to right,
      rgba(59,180,255,0.04) 0,
      rgba(59,180,255,0.04) 1px,
      transparent 1px,
      transparent 48px
    ),
    #060810;
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* ── Shell ───────────────────────────────────────────────────── */
.shell {
  display: grid;
  grid-template-columns: var(--sw) 1fr;
  height: 100vh;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────────── */
.sidebar {
  background: var(--bg1);
  border-right: 1px solid var(--line);
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
}
.logo-area {
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}
.logo-mark {
  display: flex; align-items: center; gap: 9px;
  font-family: var(--mono); font-size: 12px; font-weight: 600;
  letter-spacing: .08em; color: var(--hi);
}
.logo-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 10px rgba(59,180,255,.9);
  animation: pulsedot 2.4s ease-in-out infinite;
}
@keyframes pulsedot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.65)} }
.logo-sub { font-family: var(--mono); font-size: 9px; color: var(--mute); letter-spacing:.1em; margin-top:3px; text-transform:uppercase; }

.nav { padding: 10px 8px; flex: 1; }
.nav-group-label {
  font-family: var(--mono); font-size: 8.5px; letter-spacing:.14em;
  text-transform: uppercase; color: var(--mute);
  padding: 8px 8px 4px; user-select: none;
}
.nav-btn {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 7px 8px 7px 10px;
  border: none; background: none; border-radius: var(--r);
  color: var(--mid); font-family: var(--sans); font-size: 12.5px;
  cursor: pointer; transition: background .1s, color .1s;
  position: relative; text-align: left;
}
.nav-btn:hover { background: var(--bg3); color: var(--text); }
.nav-btn.active { background: var(--bg3); color: var(--accent); }
.nav-btn.active::before {
  content: ''; position: absolute; left: 0; top: 6px; bottom: 6px;
  width: 2px; background: var(--accent); border-radius: 1px;
}
.nav-icon { font-size: 13px; width: 16px; text-align: center; flex-shrink: 0; }
.nav-badge {
  margin-left: auto; font-family: var(--mono); font-size: 8.5px;
  padding: 1px 5px; border-radius: 3px;
  background: var(--accent); color: #020810;
  border: 1px solid var(--accent);
  animation: blinkbadge 2.5s step-end infinite;
}
@keyframes blinkbadge { 50%{opacity:.35} }

.sidebar-foot {
  padding: 12px 14px; border-top: 1px solid var(--line); flex-shrink: 0;
}
.persona-switcher {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 999px;
  border: 1px solid var(--line2); background: rgba(17,21,32,.92);
}
.persona-label {
  font-family: var(--mono); font-size: 8.5px; letter-spacing:.12em;
  text-transform: uppercase; color: var(--mute);
}
.persona-tabs { display: flex; gap: 4px; }
.ptab {
  min-width: 42px; padding: 6px 10px; font-size: 10px; font-family: var(--mono);
  border: 1px solid var(--line2); background: none; color: var(--mute);
  border-radius: var(--r); cursor: pointer; transition: all .1s;
}
.ptab.on { background: var(--accent); color: #020810; border-color: var(--accent); font-weight: 600; }

.key-label { font-family: var(--mono); font-size: 8.5px; letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin-bottom:5px; margin-top:10px; }
.key-row { display:flex; gap:4px; }
.key-input {
  flex:1; background:var(--bg3); border:1px solid var(--line2); border-radius:var(--r);
  color:var(--text); font-family:var(--mono); font-size:10px; padding:6px 9px;
  outline:none; transition:border-color .12s; min-width:0;
}
.key-input:focus { border-color:var(--accent); box-shadow: var(--accent-glow); }
.eye-btn {
  background:var(--bg3); border:1px solid var(--line2); border-radius:var(--r);
  color:var(--mute); cursor:pointer; padding:5px 7px; font-size:11px; flex-shrink:0;
  transition:all .12s;
}
.eye-btn:hover { color:var(--text); }

/* ── Main ────────────────────────────────────────────────────── */
.main { overflow-y: auto; background: var(--bg0); }
.page { padding: 28px 34px; max-width: 1180px; }

/* ── Page header ─────────────────────────────────────────────── */
.page-eyebrow {
  font-family: var(--mono); font-size: 9.5px; color: var(--accent2);
  letter-spacing:.14em; text-transform:uppercase; margin-bottom:5px;
}
.page-title {
  font-family: var(--display); font-size: 29px; font-weight: 700;
  color: var(--hi); letter-spacing:-.025em; line-height:1.1;
}
.page-desc { color: var(--mid); font-size: 13px; margin-top: 5px; }
.page-header { margin-bottom: 24px; }
.main-toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  padding: 18px 34px 0; max-width: 1180px;
}

/* ── Buttons ─────────────────────────────────────────────────── */
.btn {
  display:inline-flex; align-items:center; gap:6px;
  padding:7px 13px; border-radius:var(--r);
  font-family:var(--mono); font-size:11px; font-weight:500;
  cursor:pointer; border:none; transition:all .13s; letter-spacing:.02em; white-space:nowrap;
}
.btn-primary { background:var(--accent); color:#020810; }
.btn-primary:hover { background:var(--accent2); }
.btn-ghost {
  background:var(--bg3); color:var(--mid);
  border:1px solid var(--line2);
}
.btn-ghost:hover { color:var(--text); background:var(--bg4); }
.btn-danger { background:rgba(255,92,114,.12); color:var(--red); border:1px solid rgba(255,92,114,.28); }
.btn:disabled { opacity:.4; cursor:not-allowed; }

/* ── Cards ───────────────────────────────────────────────────── */
.card {
  background:var(--bg1); border:1px solid var(--line);
  border-radius:var(--r2); padding:18px;
}
.card-label {
  font-family:var(--mono); font-size:8.5px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--mute); margin-bottom:10px;
}

/* ── Form ────────────────────────────────────────────────────── */
.field { margin-bottom:12px; }
.label {
  display:block; font-family:var(--mono); font-size:8.5px;
  letter-spacing:.1em; text-transform:uppercase; color:var(--mute); margin-bottom:4px;
}
.input, .select, .textarea {
  width:100%; background:var(--bg3); border:1px solid var(--line2);
  border-radius:var(--r); color:var(--text); font-family:var(--mono);
  font-size:12px; padding:9px 11px; outline:none;
  transition:border-color .13s, box-shadow .13s;
}
.input:focus, .select:focus, .textarea:focus {
  border-color:var(--accent); box-shadow:var(--accent-glow);
}
.select option { background:var(--bg2); }
.textarea { resize:vertical; min-height:80px; }
.input::placeholder { color:var(--mute); }
.pw-field { position:relative; }
.pw-field .input { padding-right:38px; }
.pw-toggle {
  position:absolute; right:0; top:0; bottom:0; width:36px;
  background:none; border:none; color:var(--mute); cursor:pointer;
  display:flex; align-items:center; justify-content:center; font-size:13px;
  transition:color .12s;
}
.pw-toggle:hover { color:var(--text); }
.input-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }

/* ── Error / notice ──────────────────────────────────────────── */
.err-box {
  background:rgba(255,92,114,.07); border:1px solid rgba(255,92,114,.25);
  border-radius:var(--r); padding:10px 14px; color:var(--red);
  font-family:var(--mono); font-size:11.5px; margin-bottom:14px;
}
.ok-box {
  background:rgba(61,220,151,.07); border:1px solid rgba(61,220,151,.25);
  border-radius:var(--r); padding:10px 14px; color:var(--green);
  font-family:var(--mono); font-size:11.5px; margin-bottom:14px;
}

/* ── KPI grid ────────────────────────────────────────────────── */
.kpi-row { display:flex; gap:10px; margin-bottom:18px; flex-wrap:wrap; }
.kpi {
  flex:1; min-width:90px; background:var(--bg1); border:1px solid var(--line);
  border-radius:var(--r2); padding:14px 16px;
}
.kpi-label {
  font-family:var(--mono); font-size:8.5px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--mute); margin-bottom:5px;
}
.kpi-value { font-family:var(--mono); font-size:24px; font-weight:500; color:var(--hi); line-height:1; }
.kpi-sub { font-size:10px; color:var(--mute); margin-top:3px; }

/* ── Grade circle ────────────────────────────────────────────── */
.grade-circle {
  border-radius:50%; display:flex; align-items:center; justify-content:center;
  font-family:var(--mono); font-weight:700; border:2px solid; flex-shrink:0;
}

/* ── Score bar ───────────────────────────────────────────────── */
.sbar-wrap { display:flex; align-items:center; gap:7px; }
.sbar-bg { flex:1; height:3px; background:var(--bg4); border-radius:2px; overflow:hidden; }
.sbar-fill { height:100%; border-radius:2px; transition:width .5s ease; }
.sbar-num { font-family:var(--mono); font-size:11px; color:var(--hi); min-width:26px; text-align:right; }

/* ── Type chip ───────────────────────────────────────────────── */
.chip { font-family:var(--mono); font-size:9.5px; padding:2px 6px; border-radius:3px; letter-spacing:.03em; }
.chip-hallucination,.chip-Hallucination { background:rgba(255,92,114,.1); color:#FF5C72; }
.chip-correctness,.chip-Correctness     { background:rgba(61,220,151,.1); color:#3DDC97; }
.chip-relevance,.chip-Relevance         { background:rgba(91,155,245,.1); color:#5B9BF5; }
.chip-safety,.chip-Safety               { background:rgba(196,181,253,.1); color:#c4b5fd; }
.chip-adversarial,.chip-Adversarial     { background:var(--accent-dim);   color:var(--accent); }
.chip-consistency,.chip-Consistency     { background:rgba(255,200,100,.1); color:#fbbf24; }
.chip-factual,.chip-Factual             { background:rgba(61,220,151,.1);  color:#3DDC97; }
.chip-unknown,.chip-Unknown             { background:var(--bg4); color:var(--mid); }

/* ── Table ───────────────────────────────────────────────────── */
.table-wrap { overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th {
  font-family:var(--mono); font-size:8.5px; letter-spacing:.1em;
  text-transform:uppercase; color:var(--mute);
  text-align:left; padding:7px 12px; border-bottom:1px solid var(--line);
  white-space:nowrap;
}
td { padding:9px 12px; border-bottom:1px solid var(--line); font-size:12px; color:var(--mid); }
tr:last-child td { border-bottom:none; }
tr:hover td { background:rgba(255,255,255,.012); }

/* ── Tabs ────────────────────────────────────────────────────── */
.tab-row { display:flex; gap:2px; margin-bottom:18px; border-bottom:1px solid var(--line); }
.tab-btn {
  padding:7px 13px; font-family:var(--mono); font-size:11px;
  background:none; border:none; color:var(--mute); cursor:pointer;
  border-bottom:2px solid transparent; margin-bottom:-1px; transition:color .12s, border-color .12s;
}
.tab-btn:hover { color:var(--text); }
.tab-btn.active { color:var(--accent); border-bottom-color:var(--accent); }

/* ── Progress terminal ───────────────────────────────────────── */
.terminal {
  background:var(--bg1); border:1px solid var(--line);
  border-radius:var(--r2); overflow:hidden;
}
.terminal-bar {
  background:var(--bg2); border-bottom:1px solid var(--line);
  padding:9px 14px; display:flex; align-items:center; gap:8px;
}
.term-dots { display:flex; gap:5px; }
.term-dot { width:9px; height:9px; border-radius:50%; }
.term-title { font-family:var(--mono); font-size:10px; color:var(--mute); margin-left:6px; }
.term-body { padding:18px 20px; }

.stage-track { display:flex; flex-direction:column; gap:0; }
.stage-row {
  display:flex; align-items:flex-start; gap:10px;
  padding:7px 0; position:relative;
}
.stage-row:not(:last-child)::after {
  content:''; position:absolute; left:10px; top:26px; bottom:-7px;
  width:1px; background:var(--line);
}
.stage-icon-wrap {
  width:22px; height:22px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  font-size:10px; flex-shrink:0; border:1px solid var(--line2);
  background:var(--bg2); color:var(--mute); position:relative; z-index:1;
  transition:all .3s;
}
.stage-icon-wrap.done { background:rgba(61,220,151,.1); border-color:rgba(61,220,151,.4); color:var(--green); }
.stage-icon-wrap.active {
  background:var(--accent-dim); border-color:rgba(59,180,255,.5); color:var(--accent);
  animation:pulsestage .9s ease-in-out infinite;
}
@keyframes pulsestage { 0%,100%{box-shadow:0 0 0 0 rgba(59,180,255,.4)} 50%{box-shadow:0 0 0 5px rgba(59,180,255,0)} }
.stage-name { font-family:var(--mono); font-size:11.5px; color:var(--mid); transition:color .2s; }
.stage-name.done,.stage-name.active { color:var(--hi); }
.stage-detail { font-size:10.5px; color:var(--mute); margin-top:1px; }
.stage-check { font-family:var(--mono); font-size:10px; color:var(--green); margin-left:auto; flex-shrink:0; }

.prog-bar-wrap { height:2px; background:var(--bg4); border-radius:1px; overflow:hidden; margin:14px 0 10px; }
.prog-bar-fill { height:100%; background:linear-gradient(90deg,var(--accent),var(--accent2)); border-radius:1px; transition:width .5s ease; }

.term-log {
  background:var(--bg0); border-radius:var(--r); padding:10px 12px;
  margin-top:10px; max-height:110px; overflow-y:auto;
  font-family:var(--mono); font-size:10px; color:var(--mute); line-height:1.8;
}
.log-ok   { color:var(--green); }
.log-err  { color:var(--red); }
.log-info { color:var(--mid); }
.log-t    { color:var(--mute); margin-right:6px; }

/* ── Comparison ──────────────────────────────────────────────── */
.cmp-grid { display:grid; grid-template-columns:1fr 44px 1fr; gap:0; align-items:start; }
.cmp-center { display:flex; flex-direction:column; align-items:center; padding-top:22px; gap:6px; }
.cmp-vs { font-family:var(--mono); font-size:10px; color:var(--mute); background:var(--bg3); border:1px solid var(--line2); border-radius:3px; padding:2px 6px; }
.cmp-line { flex:1; width:1px; background:var(--line); min-height:30px; }
.delta-badge {
  font-family:var(--mono); font-size:13px; font-weight:600;
  padding:6px 9px; border-radius:5px; text-align:center;
}
.run-panel { background:var(--bg1); border:1px solid var(--line); border-radius:var(--r2); overflow:hidden; }
.run-panel-hd { padding:12px 16px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:10px; }
.run-panel-bd { padding:14px 16px; }
.run-label { font-family:var(--mono); font-size:12px; color:var(--hi); flex:1; }
.run-date  { font-family:var(--mono); font-size:9.5px; color:var(--mute); margin-top:1px; }
.run-score { font-family:var(--mono); font-size:20px; font-weight:600; color:var(--hi); }

.reg-panel { background:var(--bg1); border:1px solid var(--line); border-radius:var(--r2); padding:16px; margin-top:16px; }
.reg-col-title { font-family:var(--mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; margin-bottom:10px; }
.reg-row { font-size:11.5px; color:var(--text); padding:5px 0; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:8px; }
.reg-row:last-child { border-bottom:none; }

/* ── Share link ──────────────────────────────────────────────── */
.share-box {
  background:var(--bg2); border:1px solid var(--line2);
  border-radius:var(--r); padding:9px 12px;
  display:flex; align-items:center; gap:9px;
}
.share-url { flex:1; font-family:var(--mono); font-size:11.5px; color:var(--mid); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.share-url em { color:var(--accent); font-style:normal; }

/* ── PM summary ──────────────────────────────────────────────── */
.pm-card { background:var(--bg1); border:1px solid var(--line); border-radius:var(--r2); overflow:hidden; }
.pm-hd { padding:22px; border-bottom:1px solid var(--line); display:flex; align-items:center; gap:18px; }
.pm-grade { width:68px; height:68px; font-size:30px; flex-shrink:0; }
.pm-headline { font-size:17px; font-weight:600; color:var(--hi); line-height:1.3; }
.pm-sub { font-size:12px; color:var(--mid); margin-top:3px; }
.pm-bd { padding:22px; }
.pm-section-title { font-family:var(--mono); font-size:9px; letter-spacing:.12em; text-transform:uppercase; color:var(--mute); margin-bottom:10px; }
.fail-item { background:var(--bg2); border:1px solid var(--line); border-radius:var(--r); padding:10px 13px; margin-bottom:6px; }
.fail-q { font-size:12.5px; color:var(--text); margin-bottom:4px; line-height:1.4; }
.fail-meta { display:flex; align-items:center; gap:7px; flex-wrap:wrap; }
.rec-box { background:rgba(240,165,0,.06); border:1px solid rgba(240,165,0,.22); border-radius:var(--r); padding:13px 15px; }
.rec-label { font-family:var(--mono); font-size:9px; color:var(--accent); letter-spacing:.12em; text-transform:uppercase; margin-bottom:5px; }

/* ── Enterprise report ───────────────────────────────────────── */
.ent-wrap { background:#fff; color:#111; border-radius:var(--r2); overflow:hidden; box-shadow:0 8px 48px rgba(0,0,0,.5); font-family:'IBM Plex Sans', sans-serif; }
.ent-hd { background:#06080f; padding:24px 28px; display:flex; align-items:center; justify-content:space-between; }
.ent-logo { font-family:'IBM Plex Mono', monospace; font-size:13px; font-weight:600; color:var(--accent); letter-spacing:.07em; }
.ent-meta { font-family:'IBM Plex Mono', monospace; font-size:9.5px; color:#3A4F6E; text-align:right; line-height:1.7; }
.ent-bd { padding:26px 28px; }
.ent-title { font-size:20px; font-weight:700; color:#111; margin-bottom:3px; }
.ent-sub { font-size:12px; color:#666; margin-bottom:24px; }
.ent-stats { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
.ent-stat { flex:1; min-width:90px; border:1px solid #e5e7eb; border-radius:7px; padding:12px 14px; }
.ent-stat-label { font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#999; margin-bottom:5px; font-family:'IBM Plex Mono', monospace; }
.ent-stat-value { font-size:22px; font-weight:700; font-family:'IBM Plex Mono', monospace; }
.ent-section-title { font-size:9.5px; text-transform:uppercase; letter-spacing:.1em; color:#999; font-family:'IBM Plex Mono', monospace; border-top:1px solid #e5e7eb; padding-top:16px; margin-bottom:10px; }
.ent-finding { padding:9px 11px; background:#f8f9fb; border-radius:5px; margin-bottom:5px; font-size:11.5px; color:#444; }
.ent-foot { background:#f8f9fb; padding:12px 28px; border-top:1px solid #e5e7eb; font-size:9.5px; color:#999; font-family:'IBM Plex Mono', monospace; display:flex; justify-content:space-between; }

/* ── Notification card ───────────────────────────────────────── */
.notif-card { background:var(--bg1); border:1px solid var(--line); border-radius:var(--r2); padding:18px; margin-bottom:10px; }
.notif-hd { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.notif-title { font-family:var(--mono); font-size:11.5px; color:var(--hi); display:flex; align-items:center; gap:8px; }
.toggle { width:34px; height:19px; background:var(--bg4); border:1px solid var(--line2); border-radius:10px; cursor:pointer; position:relative; transition:background .2s; flex-shrink:0; }
.toggle.on { background:rgba(240,165,0,.25); border-color:rgba(240,165,0,.5); }
.toggle::after { content:''; position:absolute; top:2px; left:2px; width:13px; height:13px; background:var(--mute); border-radius:50%; transition:transform .2s, background .2s; }
.toggle.on::after { transform:translateX(15px); background:var(--accent); }
.notif-input { width:100%; background:var(--bg2); border:1px solid var(--line2); border-radius:var(--r); color:var(--text); font-family:var(--mono); font-size:11.5px; padding:7px 11px; outline:none; transition:border-color .13s; }
.notif-input:focus { border-color:var(--accent); box-shadow: var(--accent-glow); }
.notif-input::placeholder { color:var(--mute); }

/* ── History empty ───────────────────────────────────────────── */
.empty { text-align:center; padding:48px 24px; color:var(--mute); font-size:13px; }
.empty-icon { font-size:32px; margin-bottom:12px; }

/* ── Spinner ─────────────────────────────────────────────────── */
.spinner { width:16px; height:16px; border:2px solid var(--line2); border-top-color:var(--accent); border-radius:50%; animation:spin .7s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }

/* ── Breakpoints ─────────────────────────────────────────────── */
.fade-in { animation:fadein .18s ease; }
@keyframes fadein { from{opacity:0;transform:translateY(3px)} to{opacity:1;transform:none} }

@media (max-width:820px) {
  .shell { grid-template-columns:1fr; }
  .sidebar { display:none; }
  .page { padding:18px 14px; }
  .cmp-grid { grid-template-columns:1fr; }
  .cmp-center { display:none; }
}
`;

// ─── Reusable micro-components ────────────────────────────────────────────────

export function PwInput({ value, onChange, placeholder, disabled, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input type={show ? 'text' : 'password'} className="input" value={value}
        onChange={onChange} placeholder={placeholder} disabled={disabled} autoComplete={autoComplete || 'off'} />
      <button type="button" className="pw-toggle" onClick={() => setShow(s => !s)}>{show ? '○' : '●'}</button>
    </div>
  );
}

export function SidebarKey({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="key-row">
      <input type={show ? 'text' : 'password'} className="key-input" value={value}
        onChange={onChange} placeholder="client_key" autoComplete="off" spellCheck={false} />
      <button className="eye-btn" onClick={() => setShow(s => !s)}>{show ? '○' : '●'}</button>
    </div>
  );
}

function TypeChip({ type }) {
  const t = (type || 'unknown').replace(/\s/g, '_');
  return <span className={`chip chip-${t}`}>{type || 'unknown'}</span>;
}

function ScoreBar({ score, max = 10 }) {
  const pct   = (score / max) * 100;
  const color = scoreColor(score);
  return (
    <div className="sbar-wrap">
      <div className="sbar-bg"><div className="sbar-fill" style={{ width: `${pct}%`, background: color }} /></div>
      <div className="sbar-num">{score.toFixed(1)}</div>
    </div>
  );
}

function GradeCircle({ g, size = 50, fontSize = 22 }) {
  const color = gradeColor(g);
  return (
    <div className="grade-circle" style={{ width: size, height: size, fontSize, color, borderColor: `${color}55` }}>{g}</div>
  );
}

export function PersonaSwitcher({ persona, setPersona }) {
  return (
    <div className="persona-switcher">
      <div className="persona-label">Audience</div>
      <div className="persona-tabs">
        {[['dev', 'Dev'], ['pm', 'PM'], ['ent', 'Ent']].map(([k, l]) => (
          <button key={k} className={`ptab${persona === k ? ' on' : ''}`} onClick={() => setPersona(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ on, onClick }) {
  return <div className={`toggle ${on ? 'on' : ''}`} onClick={onClick} />;
}

// ─── Live Progress Panel ──────────────────────────────────────────────────────

export function LiveProgress({ stage, pct, logs, logRef, done, reportId, activeType, onStop, stopping = false }) {
  return (
    <div className="terminal fade-in" style={{ marginBottom: 20 }}>
      <div className="terminal-bar">
        <div className="term-dots">
          <div className="term-dot" style={{ background: '#f87171' }} />
          <div className="term-dot" style={{ background: '#fbbf24' }} />
          <div className="term-dot" style={{ background: '#4ade80' }} />
        </div>
        <div className="term-title">ai-breaker-lab — {reportId ? reportId.slice(0, 8) : 'pending'}</div>
        {!done && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {onStop && (
              <button className="btn btn-ghost" onClick={onStop} disabled={stopping} style={{ fontSize: 10.5, padding: '4px 10px' }}>
                {stopping ? 'Stopping…' : 'Stop'}
              </button>
            )}
            <div className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, borderTopColor: 'var(--accent)', borderColor: 'var(--bg4)' }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--accent)', letterSpacing: '.1em' }}>RUNNING</span>
          </div>
        )}
        {done && <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--green)' }}>✓ DONE</span>}
      </div>
      <div className="term-body">
        <div className="stage-track">
          {STAGES.map((s, i) => {
            const isDone   = done ? true : i < stage;
            const isActive = !done && i === stage;
            return (
              <div key={s.id} className="stage-row">
                <div className={`stage-icon-wrap${isDone ? ' done' : ''}${isActive ? ' active' : ''}`}>
                  {isDone ? '✓' : s.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div className={`stage-name${isDone ? ' done' : ''}${isActive ? ' active' : ''}`}>{s.label}</div>
                  {isActive && <div className="stage-detail">{s.detail}</div>}
                </div>
                {isDone && <div className="stage-check">✓</div>}
              </div>
            );
          })}
        </div>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
          padding: '10px 12px',
          border: '1px solid var(--line)',
          borderRadius: 'var(--r)',
          background: 'linear-gradient(135deg, rgba(28,35,51,.95), rgba(17,21,32,.9))',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              Current test type
            </div>
            <div style={{ fontSize: 15, color: 'var(--hi)', fontWeight: 600 }}>
              {done ? 'Run complete' : activeType}
            </div>
          </div>
          <div style={{
            padding: '6px 10px',
            borderRadius: 999,
            background: 'rgba(77,158,255,.12)',
            border: '1px solid rgba(77,158,255,.28)',
            fontFamily: 'var(--mono)',
            fontSize: 10.5,
            color: 'var(--blue)',
            whiteSpace: 'nowrap',
          }}>
            {done ? 'all stages finished' : 'live execution'}
          </div>
        </div>
        <div className="prog-bar-wrap"><div className="prog-bar-fill" style={{ width: `${pct}%` }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)' }}>
          <span>{done ? 'Complete' : `${STAGES[Math.min(stage, STAGES.length - 1)]?.label}…`}</span>
          <span>{Math.round(pct)}%</span>
        </div>
        <div className="term-log" ref={logRef}>
          {logs.map((l, i) => (
            <div key={i}><span className="log-t">{l.t}</span><span className={`log-${l.type}`}>{l.msg}</span></div>
          ))}
          {!done && <span style={{ color: 'var(--accent)' }}>█</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Break Page ───────────────────────────────────────────────────────────────

export function BreakPage({ onReportReady, initialGroqApiKey = '', onGroqApiKeyChange }) {
  const [targetType, setTT]  = useState('openai');
  const [form, setForm]      = useState({
    base_url: '', api_key: '', model_name: '',
    repo_id: '', api_token: '',
    endpoint_url: '', payload_template: '{"input":"{question}"}',
    description: '', num_tests: 20, groq_api_key: initialGroqApiKey || '', language: 'auto',
  });
  const [judges, setJudges] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [polling,  setPolling]  = useState(pollActive());
  const [stage,    setStage]    = useState(0);
  const [pct,      setPct]      = useState(0);
  const [error,    setError]    = useState('');
  const [stopping, setStopping] = useState(false);
  const [logs,     setLogs]     = useState([]);
  const [runId,    setRunId]    = useState(ls.get('abl_active_run_id'));
  const [activeType, setActiveType] = useState(currentTestType(0, 0));
  const logRef = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs(p => [...p, { msg, type, t: ts() }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 40);
  }, []);

  useEffect(() => {
    const unsub = pollSub(ev => {
      if (ev.mode && ev.mode !== 'break') return;
      if (ev.type === 'done') {
        setStopping(false);
        setPolling(false); setPct(100);
        ls.set('abl_active_run_id', null);
        addLog(`✓ Done — ${ev.report.results?.length || ev.report.sample_count || 0} tests completed.`, 'ok');
        fireNotifications(ev.report);
        setTimeout(() => onReportReady(ev.report), 400);
      } else if (ev.type === 'canceled') {
        setStopping(false);
        setPolling(false); setError('Run canceled'); addLog('■ Run canceled by user.', 'info');
      } else if (ev.type === 'failed') {
        setStopping(false);
        setPolling(false); setError(ev.error); addLog(`✗ Failed: ${ev.error}`, 'err');
      } else if (ev.type === 'timeout') {
        setStopping(false);
        setPolling(false); setError('Timed out after 7 minutes'); addLog('✗ Timed out', 'err');
      } else if (ev.type === 'error') {
        addLog(`⚠ Poll error: ${ev.error}`, 'err');
      } else if (ev.type === 'tick') {
        setStage(ev.stage ?? 0); setPct(ev.pct ?? 0);
        setActiveType(currentTestType(ev.stage ?? 0, ev.pct ?? 0));
        if (ev.attempts % 5 === 0) addLog(`${STAGES[ev.stage ?? 0].label}… (${ev.attempts * 3}s elapsed)`, 'info');
      }
    });
    return unsub;
  }, [addLog, onReportReady]);

  useEffect(() => {
    setForm(p => (p.groq_api_key === (initialGroqApiKey || '') ? p : { ...p, groq_api_key: initialGroqApiKey || '' }));
  }, [initialGroqApiKey]);

  function set(k, v) {
    setForm(p => ({ ...p, [k]: v }));
    if (k === 'groq_api_key') onGroqApiKeyChange?.(v);
  }

  async function handleStop() {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await api.cancelReport(runId);
      ls.set('abl_active_run_id', null);
      if (POLL.timerId) {
        clearInterval(POLL.timerId);
        POLL.timerId = null;
      }
      setPolling(false);
      setError('Run canceled');
      addLog('■ Stop requested. This run has been canceled.', 'info');
    } catch (e) {
      setStopping(false);
      setError(e.message);
      addLog(`✗ ${e.message}`, 'err');
    }
  }

  async function handleSubmit() {
    setError(''); setStopping(false); setLogs([]); setLoading(true); setStage(0); setPct(0); setActiveType(currentTestType(0, 0));

    const configuredJudges = judges
      .filter(judge => judge.api_key && judge.model && judge.base_url)
      .map(({ id, provider, ...judge }) => judge);

    const target =
      targetType === 'openai'      ? { type: 'openai', base_url: form.base_url || 'https://api.openai.com', api_key: form.api_key, model_name: form.model_name }
      : targetType === 'huggingface' ? { type: 'huggingface', repo_id: form.repo_id, api_token: form.api_token }
      : { type: 'webhook', endpoint_url: form.endpoint_url, payload_template: form.payload_template };

    const payload = {
      target,
      description: form.description,
      num_tests: +form.num_tests,
      language: form.language || 'auto',
      ...(form.groq_api_key ? { groq_api_key: form.groq_api_key } : {}),
      ...(configuredJudges.length > 0 ? { judges: configuredJudges } : {}),
    };

    try {
      addLog('Submitting break request…', 'info');
      const res = await api.breakModel(payload);
      addLog(`✓ Job queued · ID: ${res.report_id}`, 'ok');
      addLog(`Generating ${form.num_tests} adversarial tests…`, 'info');
      setRunId(res.report_id);
      ls.set('abl_active_run_id', res.report_id);
      setPolling(true);
      pollStart(res.report_id, +form.num_tests);
    } catch (e) {
      setError(e.message);
      addLog(`✗ ${e.message}`, 'err');
    } finally {
      setLoading(false);
    }
  }

  const busy = loading || polling;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// core · break</div>
        <div className="page-title">Break a model</div>
        <div className="page-desc">Stress-test your model across hallucination, correctness, safety, adversarial attacks.</div>
      </div>

      {polling && <LiveProgress stage={stage} pct={pct} logs={logs} logRef={logRef} done={false} reportId={runId} activeType={activeType} />}
      {error && <div className="err-box">⚠ {error}</div>}

      {!polling && (
        <div style={{ maxWidth: 960 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            {/* Target */}
            <div className="card">
            <div className="card-label">01 — Target model</div>

            {/* Quick presets */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {PRESETS.map(p => (
                <button key={p.label} className="btn btn-ghost" style={{ fontSize: 10.5, padding: '4px 10px' }}
                  disabled={busy}
                  onClick={() => { setTT('openai'); set('base_url', p.url); set('model_name', p.model); }}>
                  {p.label}
                </button>
              ))}
            </div>

            <div className="field">
              <label className="label">Adapter type</label>
              <select className="select" value={targetType} onChange={e => setTT(e.target.value)} disabled={busy}>
                <option value="openai">OpenAI-compatible (GPT, Gemini, Groq, vLLM…)</option>
                <option value="huggingface">HuggingFace Inference API</option>
                <option value="webhook">Custom Webhook</option>
              </select>
            </div>

            {targetType === 'openai' && <>
              <div className="field">
                <label className="label">Base URL</label>
                <input className="input" value={form.base_url} onChange={e => set('base_url', e.target.value)} placeholder="https://api.openai.com" disabled={busy} />
              </div>
              <div className="field">
                <label className="label">Model name</label>
                <input className="input" value={form.model_name} onChange={e => set('model_name', e.target.value)} placeholder="gpt-4o-mini" disabled={busy} />
              </div>
              <div className="field">
                <label className="label">API key (target)</label>
                <PwInput value={form.api_key} onChange={e => set('api_key', e.target.value)} placeholder="sk-…" disabled={busy} />
              </div>
            </>}

            {targetType === 'huggingface' && <>
              <div className="field">
                <label className="label">Repo ID</label>
                <input className="input" value={form.repo_id} onChange={e => set('repo_id', e.target.value)} placeholder="meta-llama/Llama-2-7b-chat-hf" disabled={busy} />
              </div>
              <div className="field">
                <label className="label">API token</label>
                <PwInput value={form.api_token} onChange={e => set('api_token', e.target.value)} placeholder="hf_…" disabled={busy} />
              </div>
            </>}

            {targetType === 'webhook' && <>
              <div className="field">
                <label className="label">Endpoint URL</label>
                <input className="input" value={form.endpoint_url} onChange={e => set('endpoint_url', e.target.value)} placeholder="https://…" disabled={busy} />
              </div>
              <div className="field">
                <label className="label">Payload template</label>
                <textarea className="textarea" value={form.payload_template} onChange={e => set('payload_template', e.target.value)} disabled={busy} />
              </div>
            </>}
            </div>

            {/* Config */}
            <div className="card">
              <div className="card-label">02 — Run config</div>
              <div className="field">
                <label className="label">Run description</label>
                <input className="input" value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Customer-support chatbot v2.1" disabled={busy} />
              </div>
              <div className="field">
                <label className="label">Number of tests</label>
                <select className="select" value={form.num_tests} onChange={e => set('num_tests', e.target.value)} disabled={busy}>
                  <option value={10}>10 — quick check (~1 min)</option>
                  <option value={20}>20 — standard (~2 min)</option>
                  <option value={30}>30 — thorough (~3.5 min)</option>
                  <option value={50}>50 — deep (~6 min)</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Language</label>
                <select className="select" value={form.language} onChange={e => set('language', e.target.value)} disabled={busy}>
                  <option value="auto">Auto-detect</option>
                  <option value="en">English</option>
                  <option value="ar">Arabic</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Groq API key (primary judge)</label>
                <PwInput value={form.groq_api_key} onChange={e => set('groq_api_key', e.target.value)}
                  placeholder="gsk_… (optional if set server-side)" disabled={busy} />
              </div>
            </div>
          </div>

          <JudgeConfigPanel
            judges={judges}
            onChange={setJudges}
            groqKeySupplied={!!form.groq_api_key}
            disabled={busy}
          />

          <div className="card">
            <button className="btn btn-primary" style={{ width: '100%', marginTop: 4, justifyContent: 'center' }}
              onClick={handleSubmit} disabled={busy}>
              {loading ? <><div className="spinner" />Submitting…</> : '⚡ Start break run'}
            </button>
            <div style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 7 }}>
              You&apos;ll be notified via Slack when done — you can close this tab.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Report Page ──────────────────────────────────────────────────────────────

export function DemoPage({ report, onReportReady }) {
  const [form, setForm] = useState({
    description: '',
    model_name: DEMO_MODEL_OPTIONS[0].value,
    num_tests: 5,
  });
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(pollActive() && POLL.mode === 'demo');
  const [stage, setStage] = useState(0);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [errorStatus, setErrorStatus] = useState(null);
  const [retryableReport, setRetryableReport] = useState(null);
  const [countdown, setCountdown] = useState(60);
  const [stopping, setStopping] = useState(false);
  const [logs, setLogs] = useState([]);
  const [runId, setRunId] = useState(ls.get('abl_demo_active_run_id'));
  const [activeType, setActiveType] = useState(currentTestType(0, 0));
  const logRef = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs(p => [...p, { msg, type, t: ts() }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 40);
  }, []);

  useEffect(() => {
    const unsub = pollSub(ev => {
      if (ev.mode !== 'demo') return;
      if (ev.type === 'done') {
        setStopping(false);
        setRetryableReport(null);
        setPolling(false); setPct(100);
        ls.set('abl_demo_active_run_id', null);
        addLog(`✓ Demo complete — ${ev.report.results?.length || ev.report.sample_count || 0} tests completed.`, 'ok');
        setTimeout(() => onReportReady(ev.report), 400);
      } else if (ev.type === 'canceled') {
        setStopping(false);
        setPolling(false);
        ls.set('abl_demo_active_run_id', null);
        setRetryableReport(null);
        setError('Demo run canceled');
        addLog('Stop requested. This demo run has been canceled.', 'info');
      } else if (ev.type === 'failed') {
        setStopping(false);
        setPolling(false);
        ls.set('abl_demo_active_run_id', null);
        setError(ev.error);
        setErrorStatus(null);
        setRetryableReport(ev.report?.retryable ? ev.report : null);
        setCountdown(60);
        addLog(`✕ Failed: ${ev.error}`, 'err');
      } else if (ev.type === 'timeout') {
        setPolling(false); ls.set('abl_demo_active_run_id', null); setRetryableReport(null); setError('Timed out after 7 minutes'); addLog('✕ Timed out', 'err');
      } else if (ev.type === 'error') {
        addLog(`⚠ Poll error: ${ev.error}`, 'err');
      } else if (ev.type === 'tick') {
        setStage(ev.stage ?? 0); setPct(ev.pct ?? 0);
        setActiveType(currentTestType(ev.stage ?? 0, ev.pct ?? 0));
        if (ev.attempts % 5 === 0) addLog(`${STAGES[ev.stage ?? 0].label}… (${ev.attempts * 3}s elapsed)`, 'info');
      }
    });
    return unsub;
  }, [addLog, onReportReady]);

  useEffect(() => {
    if (!retryableReport || polling) return undefined;
    if (countdown <= 0) {
      handleSubmit();
      return undefined;
    }
    const timer = setTimeout(() => setCountdown(v => v - 1), 1000);
    return () => clearTimeout(timer);
  }, [retryableReport, countdown, polling]);

  async function handleSubmit() {
    setError(''); setErrorStatus(null); setRetryableReport(null); setCountdown(60); setStopping(false); setLogs([]); setLoading(true); setStage(0); setPct(0); setActiveType(currentTestType(0, 0));
    try {
      addLog('Submitting public demo request…', 'info');
      const res = await api.demoBreak({
        description: form.description,
        model_name: form.model_name,
        num_tests: +form.num_tests,
      });
      addLog(`✓ Job queued · ID: ${res.report_id}`, 'ok');
      addLog(`Generating ${form.num_tests} adversarial tests…`, 'info');
      setRunId(res.report_id);
      ls.set('abl_demo_active_run_id', res.report_id);
      setPolling(true);
      pollStart(res.report_id, +form.num_tests, api.getDemoReport, 'demo');
    } catch (e) {
      setErrorStatus(e.status || null);
      setError(e.message);
      addLog(`✕ ${e.message}`, 'err');
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!runId || stopping) return;
    setStopping(true);
    try {
      await api.cancelDemoReport(runId);
      ls.set('abl_demo_active_run_id', null);
      if (POLL.timerId) {
        clearInterval(POLL.timerId);
        POLL.timerId = null;
      }
      setPolling(false);
      setRetryableReport(null);
      setError('Demo run canceled');
      addLog('Stop requested. This demo run has been canceled.', 'info');
    } catch (e) {
      setStopping(false);
      setErrorStatus(e.status || null);
      setError(e.message);
      addLog(`âœ• ${e.message}`, 'err');
    }
  }

  const busy = loading || polling;
  const isQuotaError = (errorStatus === 429) || /demo quota/i.test(error || '');
  const showRetryableState = !polling && !report && !!retryableReport;
  const showHardFailure = !polling && !report && !!error && !isQuotaError && !showRetryableState;
  const showQuotaState = !polling && !report && !!error && isQuotaError;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// core · demo</div>
        <div className="page-title">Live Demo</div>
        <div className="page-desc">Try the public Gemini demo with server-hosted target and judge models.</div>
      </div>

      {polling && <LiveProgress stage={stage} pct={pct} logs={logs} logRef={logRef} done={false} reportId={runId} activeType={activeType} onStop={handleStop} stopping={stopping} />}
      {!report && error && <div className="err-box">⚠ {error}</div>}

      {showQuotaState && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(240,165,0,.35)' }}>
          <div className="card-label">Demo quota reached</div>
          <div style={{ color: 'var(--hi)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            You've used today's demo quota (5 runs). Come back tomorrow or sign up for full access.
          </div>
          <button className="btn btn-primary" onClick={() => setTimeout(() => { window.location.href = '/signup'; }, 0)}>
            Get Started
          </button>
        </div>
      )}

      {showRetryableState && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'rgba(77,158,255,.35)' }}>
          <div className="card-label">Temporary model limit</div>
          <div style={{ color: 'var(--hi)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
            Gemini is rate limited right now. Auto-retrying in {countdown}s.
          </div>
          <div style={{ color: 'var(--mid)', marginBottom: 12 }}>
            We’ll resubmit the exact same demo request automatically, or you can retry now.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
              Retry now
            </button>
            <button className="btn btn-ghost" onClick={() => setTimeout(() => { window.location.href = '/signup'; }, 0)}>
              Get Started
            </button>
          </div>
        </div>
      )}

      {showHardFailure && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-label">Demo failed</div>
          <div style={{ color: 'var(--mid)', marginBottom: 12 }}>{error}</div>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            Retry
          </button>
        </div>
      )}

      {!polling && !report && !showQuotaState && (
        <div style={{ maxWidth: 960 }}>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-label">01 — Demo setup</div>
            <div className="field">
              <label className="label">What does your model do?</label>
              <textarea
                className="textarea"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Describe the model you want to simulate and test."
                disabled={busy}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {DEMO_DESCRIPTION_SUGGESTIONS.map(suggestion => (
                <button
                  key={suggestion}
                  className="btn btn-ghost"
                  style={{ fontSize: 10.5 }}
                  onClick={() => setForm(p => ({ ...p, description: suggestion }))}
                  disabled={busy}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label className="label">Choose a model to test</label>
                <select
                  className="select"
                  value={form.model_name}
                  onChange={e => setForm(p => ({ ...p, model_name: e.target.value }))}
                  disabled={busy}
                >
                  {DEMO_MODEL_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label} — {option.hint}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label">Number of tests</label>
                <select
                  className="select"
                  value={form.num_tests}
                  onChange={e => setForm(p => ({ ...p, num_tests: Number(e.target.value) }))}
                  disabled={busy}
                >
                  <option value={5}>5 — quick check</option>
                  <option value={10}>10 — deeper sample</option>
                </select>
              </div>
            </div>
            <div style={{ marginTop: 6, padding: '12px 14px', border: '1px solid var(--line2)', borderRadius: 'var(--r)', background: 'rgba(255,255,255,.02)', color: 'var(--mid)', fontSize: 11.5 }}>
              Judge and target models are provided by AI Breaker Lab.
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
              onClick={handleSubmit}
              disabled={busy || form.description.trim().length < 5}
            >
              {loading ? <><div className="spinner" />Running…</> : 'Run Demo'}
            </button>
          </div>
        </div>
      )}

      {!polling && report && (
        <>
          <ReportPage report={report} persona="dev" />
          <div className="card" style={{ marginTop: 14, borderColor: 'rgba(240,165,0,.35)', background: 'linear-gradient(135deg, rgba(240,165,0,.10), rgba(77,158,255,.08))' }}>
            <div className="card-label">Next step</div>
            <div style={{ fontSize: 18, color: 'var(--hi)', fontWeight: 600, marginBottom: 6 }}>
              Testing your own model? Get full access — unlimited tests, all providers, CI integration.
            </div>
            <button className="btn btn-primary" onClick={() => setTimeout(() => { window.location.href = '/signup'; }, 0)}>
              Get Started
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function ReportPage({ report, persona, overviewExtra = null }) {
  const [tab, setTab]     = useState('overview');
  const [open, setOpen]   = useState(new Set());
  const [copied, setCopied] = useState(false);

  if (!report) return (
    <div className="page fade-in">
      <div className="empty"><div className="empty-icon">📊</div>No report loaded yet. Run a break first.</div>
    </div>
  );

  const sc = overallScore(report);
  const g  = grade(sc);
  const bd = breakdownFromReport(report);
  const tf = topFailures(report);
  const rf = redFlags(report);
  const results = report.results || [];

  // PM view
  if (persona === 'pm') {
    const headlines = { A: 'Your model is production-ready.', B: 'Your model is mostly solid with minor gaps.', C: 'Your model needs work before going live.', D: 'Significant reliability issues detected.', F: 'Critical failures. Do not deploy.' };
    const recs = {
      A: 'No immediate action needed. Schedule a quarterly re-test after your next prompt update.',
      B: `Hallucination rate is slightly elevated. Consider adding retrieval or citation grounding for factual queries before the next release. Top issue: ${tf[0]?.test_type || 'hallucination'}.`,
      C: 'Three or more test categories are below acceptable thresholds. Block deployment, assign an engineering sprint to address hallucination and adversarial scores.',
      D: 'Multiple critical failures. Recommend rollback to previous version and full prompt rewrite.',
      F: 'Critical failures across safety and adversarial categories. Do not ship. Escalate immediately.',
    };
    return (
      <div className="page fade-in">
        <div className="page-header">
          <div className="page-eyebrow">// report · pm summary</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="page-title">PM one-pager</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => window.print()}>⬇ Print / Screenshot</button>
            </div>
          </div>
        </div>
        <div className="pm-card">
          <div className="pm-hd">
            <GradeCircle g={g} size={68} fontSize={30} />
            <div>
              <div className="pm-headline">{headlines[g]}</div>
              <div className="pm-sub">{report.model_version || 'Unknown model'} · {fmtDate(report.created_at)} · {report.sample_count || results.length} tests · {tf.length} critical failures</div>
            </div>
          </div>
          <div className="pm-bd">
            <div style={{ marginBottom: 20 }}>
              <div className="pm-section-title">Top failures</div>
              {tf.length === 0 && <div style={{ color: 'var(--green)', fontSize: 12 }}>✓ No critical failures detected.</div>}
              {tf.slice(0, 3).map((f, i) => (
                <div key={i} className="fail-item">
                  <div className="fail-q">{f.question}</div>
                  <div className="fail-meta">
                    <TypeChip type={f.test_type} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>score {f.score?.toFixed(1) ?? '—'}/10</span>
                    {f.hallucination && <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--red)' }}>⚠ hallucination</span>}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="pm-section-title">Recommendation</div>
              <div className="rec-box">
                <div className="rec-label">Action required</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{recs[g]}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Enterprise view
  if (persona === 'ent') {
    return (
      <div className="page fade-in">
        <div className="page-header">
          <div className="page-eyebrow">// report · enterprise certificate</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="page-title">Enterprise report</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => window.print()}>⬇ Download / Print</button>
            </div>
          </div>
        </div>
        <div className="ent-wrap">
          <div className="ent-hd">
            <div>
              <div className="ent-logo">AI BREAKER LAB</div>
              <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 9.5, color: '#3A4F6E', marginTop: 3 }}>
                Model Safety & Quality Evaluation Report
              </div>
            </div>
            <div className="ent-meta">
              <div>REPORT ID: {(report.report_id || '').slice(0, 12).toUpperCase()}</div>
              <div>DATE: {fmtDate(report.created_at)}</div>
              <div>CONFIDENTIAL</div>
            </div>
          </div>
          <div className="ent-bd">
            <div className="ent-title">AI Model Evaluation Certificate</div>
            <div className="ent-sub">This report certifies the automated safety and quality evaluation of the specified AI model prior to deployment.</div>
            <div className="ent-stats">
              {[
                { label: 'Overall Score', value: `${sc.toFixed(1)}/10`, color: sc >= 7 ? '#16a34a' : sc >= 5 ? '#d97706' : '#dc2626' },
                { label: 'Grade',        value: g,                      color: sc >= 7 ? '#16a34a' : sc >= 5 ? '#d97706' : '#dc2626' },
                { label: 'Tests Run',    value: report.sample_count || results.length },
                { label: 'Failures',     value: tf.length,              color: tf.length === 0 ? '#16a34a' : '#d97706' },
              ].map(k => (
                <div key={k.label} className="ent-stat">
                  <div className="ent-stat-label">{k.label}</div>
                  <div className="ent-stat-value" style={{ color: k.color || '#111' }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div className="ent-section-title">Model Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 20 }}>
              {[
                ['Model', report.model_version || '—'],
                ['Evaluation Date', fmtDate(report.created_at)],
                ['Judge Model', report.judge_model || 'groq'],
                ['Report ID', (report.report_id || '').slice(0, 14)],
              ].map(([k, v]) => (
                <div key={k} style={{ background: '#f8f9fb', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.08em', color: '#999', marginBottom: 2, fontFamily: 'IBM Plex Mono, monospace' }}>{k}</div>
                  <div style={{ fontSize: 12, color: '#111', fontFamily: 'IBM Plex Mono, monospace' }}>{v}</div>
                </div>
              ))}
            </div>
            {bd.length > 0 && <>
              <div className="ent-section-title">Results by Category</div>
              {bd.map(b => (
                <div key={b.type} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 7 }}>
                  <div style={{ width: 110, fontSize: 11.5, color: '#555', fontFamily: 'IBM Plex Mono, monospace' }}>{b.type}</div>
                  <div style={{ flex: 1, height: 5, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${b.score * 10}%`, background: b.score >= 7 ? '#16a34a' : b.score >= 5 ? '#d97706' : '#dc2626', borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11.5, color: '#111', minWidth: 30 }}>{b.score.toFixed(1)}</div>
                  <div style={{ fontSize: 10.5, color: b.failures === 0 ? '#16a34a' : '#dc2626', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {b.failures === 0 ? 'PASS' : `${b.failures} FAIL`}
                  </div>
                </div>
              ))}
            </>}
            {rf.length > 0 && <>
              <div className="ent-section-title">Findings</div>
              {rf.map((f, i) => <div key={i} className="ent-finding">⚠ {f}</div>)}
            </>}
            <div className="ent-section-title">Certification Statement</div>
            <div style={{ fontSize: 11.5, color: '#555', lineHeight: 1.7 }}>
              This report certifies that the above-named AI model was subjected to automated adversarial testing covering
              hallucination detection, factual correctness, relevance, safety, and adversarial prompt resistance.
              Testing was conducted by AI Breaker Lab using independent judge models. Results reflect model performance
              at time of evaluation and may not reflect subsequent updates.
            </div>
          </div>
          <div className="ent-foot">
            <div>AI Breaker Lab · automated model evaluation</div>
            <div>{SHARE_BASE}/r/{report.share_token || report.report_id}</div>
          </div>
        </div>
      </div>
    );
  }

  // Developer (default) view
  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// report · {fmtDate(report.created_at)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="page-title">AI Breaker Report</div>
          <GradeCircle g={g} size={40} fontSize={18} />
          <button className="btn btn-ghost" style={{ fontSize: 10.5, padding: '3px 10px' }}
            onClick={() => { navigator.clipboard?.writeText(report.report_id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
            {copied ? '✓ copied' : 'copy id'}
          </button>
        </div>
        <div className="page-desc">
          Model: <strong style={{ color: 'var(--hi)' }}>{report.model_version || '—'}</strong>
          &nbsp;·&nbsp;{report.sample_count || results.length} tests&nbsp;·&nbsp;Judge: {report.judge_model || 'groq'}
        </div>
      </div>

      <div className="kpi-row">
        <div className="kpi"><div className="kpi-label">Score</div><div className="kpi-value" style={{ color: scoreColor(sc) }}>{sc.toFixed(1)}</div><div className="kpi-sub">out of 10</div></div>
        <div className="kpi"><div className="kpi-label">Tests</div><div className="kpi-value">{report.sample_count || results.length}</div></div>
        <div className="kpi"><div className="kpi-label">Failures</div><div className="kpi-value" style={{ color: tf.length ? 'var(--red)' : 'var(--accent2)' }}>{tf.length}</div></div>
        <div className="kpi"><div className="kpi-label">Hallucinations</div><div className="kpi-value" style={{ color: (report.metrics?.hallucinations_detected || 0) ? 'var(--red)' : 'var(--accent2)' }}>{report.metrics?.hallucinations_detected ?? '—'}</div></div>
        {report.metrics?.judges_agreement !== undefined && (
          <div className="kpi">
            <div className="kpi-label">Judge agreement</div>
            <div className="kpi-value" style={{ color: report.metrics.judges_agreement >= 0.7 ? 'var(--accent2)' : 'var(--accent)' }}>
              {Math.round(report.metrics.judges_agreement * 100)}%
            </div>
          </div>
        )}
      </div>

      {rf.length > 0 && (
        <div style={{ background: 'rgba(255,92,114,.06)', border: '1px solid rgba(255,92,114,.2)', borderRadius: 'var(--r)', padding: '10px 14px', marginBottom: 18 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--red)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Red flags</div>
          {rf.map((f, i) => <div key={i} style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 2 }}>⚠ {f}</div>)}
        </div>
      )}

      <div className="tab-row">
        {[['overview', 'Overview'], ['results', 'Results'], ['share', 'Share']].map(([k, l]) => (
          <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div>
          {overviewExtra && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-label">Radar snapshot</div>
              {overviewExtra}
            </div>
          )}
          {bd.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-label">Breakdown by category</div>
              {bd.map(b => (
                <div key={b.type} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <TypeChip type={b.type} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)' }}>
                      {b.count} tests · {b.failures} failed
                    </span>
                  </div>
                  <ScoreBar score={b.score} />
                </div>
              ))}
            </div>
          )}
          {tf.length > 0 && (
            <div className="card">
              <div className="card-label">Top failures</div>
              {tf.map((f, i) => (
                <div key={i} className="fail-item">
                  <div className="fail-q">{f.question}</div>
                  <div className="fail-meta">
                    <TypeChip type={f.test_type} />
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)' }}>score {f.score?.toFixed(1) ?? '—'}</span>
                    {f.hallucination && <span style={{ color: 'var(--red)', fontSize: 10, fontFamily: 'var(--mono)' }}>⚠ hallucination</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'results' && (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>Type</th><th>Question</th><th>Score</th><th>Hallucination</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const sc = ((+r.correctness || 0) * 0.6 + (+r.relevance || 0) * 0.4);
                  const isOpen = open.has(i);
                  return [
                    <tr key={i} style={{ cursor: 'pointer' }} onClick={() => setOpen(p => { const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s; })}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>{i + 1}</td>
                      <td><TypeChip type={r.test_type} /></td>
                      <td style={{ color: 'var(--text)', maxWidth: 320 }}>{(r.question || '').slice(0, 80)}{r.question?.length > 80 ? '…' : ''}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: scoreColor(sc) }}>{sc.toFixed(1)}</td>
                      <td style={{ fontFamily: 'var(--mono)', color: r.hallucination ? 'var(--red)' : 'var(--green)', fontSize: 11 }}>
                        {r.hallucination ? '⚠ yes' : '✓ no'}
                      </td>
                    </tr>,
                    isOpen && (
                      <tr key={`e${i}`}>
                        <td colSpan={5} style={{ padding: '10px 14px', background: 'var(--bg2)' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Model answer</div>
                              <div style={{ fontSize: 12, color: 'var(--mid)' }}>{r.model_answer || '—'}</div>
                            </div>
                            <div>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Ground truth</div>
                              <div style={{ fontSize: 12, color: 'var(--mid)' }}>{r.ground_truth || '—'}</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 4 }}>Judge reasoning</div>
                              <div style={{ fontSize: 11.5, color: 'var(--mute)' }}>{r.reason || '—'}</div>
                            </div>
                          </div>
                          {r.judges && Object.keys(r.judges).length > 1 && (
                            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(255,255,255,.03)', borderRadius: 6, border: '1px solid var(--line2)' }}>
                              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 8 }}>
                                Judge breakdown
                                {!r._judge_agreed && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>⚠ disagreement ({r._judge_gap?.toFixed(1)} gap)</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                {Object.entries(r.judges).map(([name, j]) => (
                                  <div key={name} style={{ flex: '1 1 180px', padding: '8px 12px', background: 'var(--bg1)', border: `1px solid ${j.available ? 'var(--line2)' : 'var(--red)'}`, borderRadius: 6 }}>
                                    <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--blue)', fontWeight: 600, marginBottom: 6 }}>{name}</div>
                                    <div style={{ fontSize: 11, color: 'var(--mute)', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Correctness</span><span style={{ color: 'var(--text)' }}>{j.correctness?.toFixed(1) ?? '—'}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--mute)', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Relevance</span><span style={{ color: 'var(--text)' }}>{j.relevance?.toFixed(1) ?? '—'}</span>
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--mute)', display: 'flex', justifyContent: 'space-between' }}>
                                      <span>Hallucination</span><span style={{ color: j.hallucination ? 'var(--red)' : 'var(--green)' }}>{j.hallucination ? 'yes' : 'no'}</span>
                                    </div>
                                    {j.reason && <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 5, borderTop: '1px solid var(--line2)', paddingTop: 5 }}>{j.reason}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'share' && <ShareTab reportId={report.report_id} shareToken={report.share_token} />}
    </div>
  );
}

// ─── Share Tab ────────────────────────────────────────────────────────────────

export function ShareTab({ reportId, shareToken }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${API_BASE}/report/${reportId}/html`;
  const publicUrl = `${SHARE_BASE}/r/${shareToken || reportId}`;

  function copy(url) {
    navigator.clipboard?.writeText(url);
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fade-in">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-label">Public share link</div>
        <div className="share-box" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 14 }}>🔗</span>
          <div className="share-url">
            {publicUrl.replace('https://', '')}
          </div>
          <button className="btn btn-ghost" onClick={() => copy(publicUrl)}>{copied ? '✓ Copied' : 'Copy'}</button>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--mute)', marginBottom: 14 }}>
          No auth required. Share in Slack, LinkedIn, or a client email.
        </div>
        <div className="card-label">Internal HTML report (authenticated)</div>
        <div className="share-box">
          <span style={{ fontSize: 13 }}>📄</span>
          <div className="share-url">{shareUrl.replace('https://', '')}</div>
          <button className="btn btn-ghost" onClick={() => window.open(shareUrl, '_blank')}>Open ↗</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--mute)' }}>
        The public link is safe to share. The HTML link is internal-only and still requires your API key header.
      </div>
    </div>
  );
}

// ─── Compare Page ─────────────────────────────────────────────────────────────

export function ComparePage({ focusReport, onOpenSingleRun }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [idA, setIdA]         = useState('');
  const [idB, setIdB]         = useState('');
  const [runA, setRunA]       = useState(null);
  const [runB, setRunB]       = useState(null);
  const [error, setError]     = useState('');
  const [tab, setTab]         = useState('overview');

  useEffect(() => {
    api.getReports().then(rows => {
      setHistory(rows || []);
      const { baseline, current } = selectComparisonBaseline(rows || [], focusReport);
      setIdA(baseline?.report_id || '');
      setIdB(current?.report_id || '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, [focusReport?.report_id]);

  async function loadReports() {
    if (!idA || !idB) return;
    setError('');
    try {
      const [a, b] = await Promise.all([api.getReport(idA), api.getReport(idB)]);
      setRunA(a); setRunB(b);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { if (idA && idB) loadReports(); }, [idA, idB]);

  const bdA = runA ? breakdownFromReport(runA) : [];
  const bdB = runB ? breakdownFromReport(runB) : [];
  const scA = runA ? overallScore(runA) : 0;
  const scB = runB ? overallScore(runB) : 0;
  const summary = runA && runB ? regressionSummary(runA, runB) : { hasRegression: false, scoreRegressions: [], newFailures: [] };

  function DeltaChip({ a, b }) {
    const d = b - a;
    if (Math.abs(d) < 0.05) return <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>—</span>;
    const color = d > 0 ? 'var(--green)' : 'var(--red)';
    return <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color, background: `${color}18`, border: `1px solid ${color}30`, borderRadius: 3, padding: '1px 5px' }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</span>;
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// core · compare runs</div>
        <div className="page-title">Run comparison</div>
        <div className="page-desc">Did your last prompt change make things better or worse?</div>
      </div>

      {runB && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => onOpenSingleRun?.(runB)}>
            Open single-run detail
          </button>
          <div style={{ fontSize: 10.5, color: 'var(--mute)', alignSelf: 'center' }}>
            Comparison is the default review flow. Single-run detail is still available when you need the raw report.
          </div>
        </div>
      )}

      {error && <div className="err-box">⚠ {error}</div>}

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto 12px' }} /></div>
      ) : history.length < 2 ? (
        <div className="empty"><div className="empty-icon">⇌</div>Run at least two break evaluations to compare them.</div>
      ) : (
        <>
          {/* Run selectors */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 280 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Baseline run</div>
              <select className="select" style={{ maxWidth: 280 }} value={idA} onChange={e => setIdA(e.target.value)}>
              {history.map(r => <option key={r.report_id} value={r.report_id}>{r.model_version || r.report_id?.slice(0, 8)} · {fmtDate(r.created_at)}</option>)}
              </select>
            </div>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>vs</span>
            <div style={{ minWidth: 280 }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>Latest run</div>
              <select className="select" style={{ maxWidth: 280 }} value={idB} onChange={e => setIdB(e.target.value)}>
              {history.map(r => <option key={r.report_id} value={r.report_id}>{r.model_version || r.report_id?.slice(0, 8)} · {fmtDate(r.created_at)}</option>)}
              </select>
            </div>
          </div>

          {runA && runB && (
            <>
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="card-label">Comparison verdict</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.25fr .85fr .85fr', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, color: 'var(--hi)', fontWeight: 600, marginBottom: 6 }}>
                      {summary.hasRegression ? 'Latest run regressed against baseline.' : scB >= scA ? 'Latest run improved or held steady.' : 'Latest run changed, but no material regression was detected.'}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--mid)', lineHeight: 1.7 }}>
                      Baseline: <span style={{ color: 'var(--text)' }}>{runA.model_version || 'previous run'}</span> from {fmtDate(runA.created_at)}.
                      Latest: <span style={{ color: 'var(--text)' }}> {runB.model_version || 'current run'}</span> from {fmtDate(runB.created_at)}.
                    </div>
                  </div>
                  <div className="kpi" style={{ minHeight: 0 }}>
                    <div className="kpi-label">Score delta</div>
                    <div className="kpi-value" style={{ color: scB >= scA ? 'var(--accent2)' : 'var(--red)' }}>
                      {`${scB >= scA ? '+' : ''}${(scB - scA).toFixed(1)}`}
                    </div>
                  </div>
                  <div className="kpi" style={{ minHeight: 0 }}>
                    <div className="kpi-label">New regressions</div>
                    <div className="kpi-value" style={{ color: summary.hasRegression ? 'var(--red)' : 'var(--accent2)' }}>
                      {summary.scoreRegressions.length + summary.newFailures.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="tab-row">
                {[['overview', 'Overview'], ['categories', 'Categories'], ['failures', 'Failure diff']].map(([k, l]) => (
                  <button key={k} className={`tab-btn${tab === k ? ' active' : ''}`} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>

              {tab === 'overview' && (
                <div className="cmp-grid">
                  {/* Run A */}
                  <div className="run-panel">
                    <div className="run-panel-hd">
                      <div style={{ flex: 1 }}>
                        <div className="run-label">{runA.model_version || 'Run A'}</div>
                        <div className="run-date">{fmtDate(runA.created_at)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="run-score">{scA.toFixed(1)}</div>
                        <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--mute)' }}>/10</div>
                      </div>
                      <GradeCircle g={grade(scA)} size={38} fontSize={16} />
                    </div>
                    <div className="run-panel-bd">
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', marginBottom: 10 }}>
                        {runA.sample_count || (runA.results || []).length} tests · {topFailures(runA).length} failures
                      </div>
                      {bdA.map(b => (
                        <div key={b.type} style={{ marginBottom: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                            <TypeChip type={b.type} />
                          </div>
                          <ScoreBar score={b.score} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Center delta */}
                  <div className="cmp-center">
                    <span className="cmp-vs">vs</span>
                    <div className="cmp-line" />
                    {(() => {
                      const d = scB - scA;
                      const color = Math.abs(d) < 0.1 ? 'var(--mute)' : d > 0 ? 'var(--green)' : 'var(--red)';
                      return (
                        <div className="delta-badge" style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}>
                          {Math.abs(d) < 0.1 ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)}`}
                        </div>
                      );
                    })()}
                    <div className="cmp-line" />
                  </div>

                  {/* Run B */}
                  <div className="run-panel">
                    <div className="run-panel-hd">
                      <div style={{ flex: 1 }}>
                        <div className="run-label">{runB.model_version || 'Run B'}</div>
                        <div className="run-date">{fmtDate(runB.created_at)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="run-score">{scB.toFixed(1)}</div>
                        <div style={{ fontSize: 9.5, fontFamily: 'var(--mono)', color: 'var(--mute)' }}>/10</div>
                      </div>
                      <GradeCircle g={grade(scB)} size={38} fontSize={16} />
                    </div>
                    <div className="run-panel-bd">
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', marginBottom: 10 }}>
                        {runB.sample_count || (runB.results || []).length} tests · {topFailures(runB).length} failures
                      </div>
                      {bdB.map(b => {
                        const aRow = bdA.find(r => r.type === b.type);
                        return (
                          <div key={b.type} style={{ marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                              <TypeChip type={b.type} />
                              {aRow && <DeltaChip a={aRow.score} b={b.score} />}
                            </div>
                            <ScoreBar score={b.score} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'categories' && (
                <div className="reg-panel">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                    <div>
                      <div className="reg-col-title" style={{ color: 'var(--green)' }}>▲ Improvements</div>
                      {bdB.filter(b => { const a = bdA.find(r => r.type === b.type); return a && b.score - a.score >= 0.3; }).length === 0
                        ? <div style={{ fontSize: 11.5, color: 'var(--mute)' }}>None</div>
                        : bdB.filter(b => { const a = bdA.find(r => r.type === b.type); return a && b.score - a.score >= 0.3; }).map(b => {
                          const a = bdA.find(r => r.type === b.type);
                          return (
                            <div key={b.type} className="reg-row">
                              <TypeChip type={b.type} />
                              <span style={{ color: 'var(--mute)', fontFamily: 'var(--mono)', fontSize: 11 }}>{a.score.toFixed(1)}</span>
                              <span style={{ color: 'var(--mute)' }}>→</span>
                              <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 11 }}>{b.score.toFixed(1)}</span>
                            </div>
                          );
                        })}
                    </div>
                    <div>
                      <div className="reg-col-title" style={{ color: 'var(--red)' }}>▼ Regressions</div>
                      {bdB.filter(b => { const a = bdA.find(r => r.type === b.type); return a && b.score - a.score < -0.2; }).length === 0
                        ? <div style={{ fontSize: 11.5, color: 'var(--mute)' }}>No regressions detected ✓</div>
                        : bdB.filter(b => { const a = bdA.find(r => r.type === b.type); return a && b.score - a.score < -0.2; }).map(b => {
                          const a = bdA.find(r => r.type === b.type);
                          return (
                            <div key={b.type} className="reg-row">
                              <TypeChip type={b.type} />
                              <span style={{ color: 'var(--mute)', fontFamily: 'var(--mono)', fontSize: 11 }}>{a.score.toFixed(1)}</span>
                              <span style={{ color: 'var(--mute)' }}>→</span>
                              <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 11 }}>{b.score.toFixed(1)}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'failures' && (() => {
                const tA = topFailures(runA);
                const tB = topFailures(runB);
                const fixed     = tA.filter(f => !tB.find(b => b.question === f.question));
                const newFails  = tB.filter(f => !tA.find(a => a.question === f.question));
                const persistent = tB.filter(f => tA.find(a => a.question === f.question));
                return (
                  <div>
                    {fixed.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--green)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>✓ Fixed ({fixed.length})</div>
                        {fixed.map((f, i) => (
                          <div key={i} className="fail-item" style={{ borderColor: 'rgba(61,220,151,.2)' }}>
                            <div className="fail-q">{f.question}</div>
                            <div className="fail-meta"><TypeChip type={f.test_type} /><span style={{ color: 'var(--green)', fontFamily: 'var(--mono)', fontSize: 10 }}>was {f.score?.toFixed(1)} → fixed</span></div>
                          </div>
                        ))}
                      </div>
                    )}
                    {persistent.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--accent)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>⚠ Persistent ({persistent.length})</div>
                        {persistent.map((f, i) => {
                          const aVer = tA.find(a => a.question === f.question);
                          return (
                            <div key={i} className="fail-item" style={{ borderColor: 'rgba(240,165,0,.2)' }}>
                              <div className="fail-q">{f.question}</div>
                              <div className="fail-meta">
                                <TypeChip type={f.test_type} />
                                <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)' }}>{aVer?.score?.toFixed(1) ?? '—'} → {f.score?.toFixed(1) ?? '—'}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {newFails.length > 0 && (
                      <div>
                        <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--red)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10 }}>✕ New regressions ({newFails.length})</div>
                        {newFails.map((f, i) => (
                          <div key={i} className="fail-item" style={{ borderColor: 'rgba(255,92,114,.2)' }}>
                            <div className="fail-q">{f.question}</div>
                            <div className="fail-meta"><TypeChip type={f.test_type} /><span style={{ color: 'var(--red)', fontFamily: 'var(--mono)', fontSize: 10 }}>{f.score?.toFixed(1)} — new failure</span></div>
                          </div>
                        ))}
                      </div>
                    )}
                    {fixed.length === 0 && persistent.length === 0 && newFails.length === 0 && (
                      <div className="empty"><div className="empty-icon">✓</div>No failure data to compare. Run both reports with enough tests to populate failures.</div>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── History Page ─────────────────────────────────────────────────────────────

export function HistoryPage({ onLoadReport }) {
  const [rows, setRows]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getReports().then(setRows).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  async function handleDelete(id) {
    try { await api.deleteReport(id); setRows(p => p.filter(r => r.report_id !== id)); }
    catch (e) { alert(e.message); }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// data · history</div>
        <div className="page-title">Run history</div>
        <div className="page-desc">All past break runs. Click a row to load its report.</div>
      </div>
      {error && <div className="err-box">⚠ {error}</div>}
      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
        rows.length === 0 ? <div className="empty"><div className="empty-icon">🕑</div>No runs yet.</div> : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Model / Description</th><th>Date</th><th>Score</th><th>Tests</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    let parsedMetrics = null;
                    try { parsedMetrics = r.metrics_json ? JSON.parse(r.metrics_json) : null; } catch {}
                    const sc = parseFloat(parsedMetrics?.average_score ?? parsedMetrics?.overall_score ?? 0);
                    const g  = grade(sc);
                    return (
                      <tr key={r.report_id} style={{ cursor: 'pointer' }} onClick={() => onLoadReport(r)}>
                        <td style={{ color: 'var(--text)' }}>{r.model_version || r.report_id?.slice(0, 12) || '—'}</td>
                        <td>{fmtDate(r.created_at)}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <GradeCircle g={g} size={26} fontSize={11} />
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{sc > 0 ? sc.toFixed(1) : '—'}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--mono)' }}>{r.sample_count ?? '—'}</td>
                        <td>
                          <span style={{
                            fontFamily: 'var(--mono)', fontSize: 10,
                            color: r.status === 'done' ? 'var(--accent2)' : r.status === 'failed' ? 'var(--red)' : 'var(--accent)',
                            background: r.status === 'done' ? 'rgba(61,220,151,.1)' : r.status === 'failed' ? 'rgba(255,92,114,.1)' : 'rgba(240,165,0,.1)',
                            padding: '2px 6px', borderRadius: 3,
                          }}>{r.status}</span>
                        </td>
                        <td>
                          <button className="btn btn-danger" style={{ fontSize: 10, padding: '3px 8px' }}
                            onClick={e => { e.stopPropagation(); handleDelete(r.report_id); }}>del</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Usage Page ───────────────────────────────────────────────────────────────

export function UsagePage() {
  const [data, setData]   = useState(null);
  const [loading, setL]   = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getUsage()
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setL(false));
  }, []);

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>;
  if (error) return <div className="page"><div className="empty">{error}</div></div>;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// data · usage</div>
        <div className="page-title">API usage</div>
      </div>
      {['today', 'month', 'overall'].map(p => {
        const d = data?.[p] || {};
        return (
          <div key={p} style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>{p}</div>
            <div className="kpi-row">
              <div className="kpi"><div className="kpi-label">Evaluations</div><div className="kpi-value">{d.req_count ?? d.evaluations ?? '—'}</div></div>
              <div className="kpi"><div className="kpi-label">Samples</div><div className="kpi-value">{d.sample_count ?? d.samples ?? '—'}</div></div>
              <div className="kpi"><div className="kpi-label">Tokens</div><div className="kpi-value">{(d.total_tokens || 0).toLocaleString()}</div></div>
              <div className="kpi"><div className="kpi-label">Cost</div><div className="kpi-value">${(+(d.total_cost_usd || 0)).toFixed(4)}</div></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Notifications Page ───────────────────────────────────────────────────────

export function NotifsPage() {
  const [cfg, setCfg]   = useState(() => ls.get('abl_notif_cfg', { slack_enabled: false, slack_url: '', email_enabled: false, email_addr: '', when: 'always' }));
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  function update(k, v) { setCfg(p => ({ ...p, [k]: v })); }

  function save() {
    ls.set('abl_notif_cfg', cfg); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function testSlack() {
    if (!cfg.slack_url) return;
    setTesting(true); setTestMsg('');
    try {
      await fetch(cfg.slack_url, {
        method: 'POST',
        body: JSON.stringify({ text: '🧪 *AI Breaker Lab* — test notification. Your webhook is working.' }),
      });
      setTestMsg('✓ Test sent');
    } catch {
      setTestMsg('⚠ Failed — check URL and CORS');
    } finally { setTesting(false); setTimeout(() => setTestMsg(''), 3000); }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// config · notifications</div>
        <div className="page-title">Notify when done</div>
        <div className="page-desc">Get pinged when a break run finishes — kick off a 50-test run, go do other work.</div>
      </div>

      <div className="notif-card">
        <div className="notif-hd">
          <div className="notif-title"><span style={{ fontSize: 15 }}>💬</span> Slack webhook</div>
          <Toggle on={cfg.slack_enabled} onClick={() => update('slack_enabled', !cfg.slack_enabled)} />
        </div>
        {cfg.slack_enabled && (
          <>
            <div style={{ marginBottom: 10 }}>
              <label className="label">Webhook URL</label>
              <input className="notif-input" value={cfg.slack_url} onChange={e => update('slack_url', e.target.value)} placeholder="https://hooks.slack.com/services/T…/B…/xxx" />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn btn-ghost" onClick={testSlack} disabled={testing} style={{ fontSize: 10.5 }}>
                {testing ? <><div className="spinner" />Sending…</> : '▷ Test'}
              </button>
              {testMsg && <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: testMsg.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{testMsg}</span>}
            </div>
            <div style={{ marginTop: 12, background: 'var(--bg0)', borderRadius: 'var(--r)', padding: '10px 12px' }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--mute)', marginBottom: 5 }}>Preview</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mid)', lineHeight: 1.8 }}>
                <span style={{ color: 'var(--accent)' }}>AI Breaker Lab</span><br />
                ✓ Run complete: <span style={{ color: 'var(--hi)' }}>gpt-4o-mini</span><br />
                Score: <span style={{ color: 'var(--green)' }}>8.2/10 (A)</span> · 3 failures<br />
                <span style={{ color: 'var(--blue)' }}>{SHARE_BASE}/r/demoShareToken</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="notif-card">
        <div className="notif-hd">
          <div className="notif-title"><span style={{ fontSize: 15 }}>✉️</span> Email</div>
          <Toggle on={cfg.email_enabled} onClick={() => update('email_enabled', !cfg.email_enabled)} />
        </div>
        {cfg.email_enabled && (
          <div>
            <label className="label">Email address</label>
            <input className="notif-input" type="email" value={cfg.email_addr} onChange={e => update('email_addr', e.target.value)} placeholder="you@company.com" />
            <div style={{ fontSize: 10.5, color: 'var(--mute)', marginTop: 6 }}>
              Requires backend email integration. Configure <code style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>SMTP_*</code> env vars on the server.
            </div>
          </div>
        )}
      </div>

      <div className="notif-card">
        <div className="notif-hd"><div className="notif-title"><span style={{ fontSize: 15 }}>🔔</span> Notify when</div></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['always', 'Every run'], ['failure', 'Only on failure'], ['regression', 'Only on regression']].map(([k, l]) => (
            <button key={k} onClick={() => update('when', k)} style={{
              padding: '5px 11px', fontFamily: 'var(--mono)', fontSize: 10.5,
              border: '1px solid', borderRadius: 'var(--r)', cursor: 'pointer',
              background: cfg.when === k ? 'rgba(240,165,0,.12)' : 'var(--bg2)',
              color: cfg.when === k ? 'var(--accent)' : 'var(--mute)',
              borderColor: cfg.when === k ? 'rgba(240,165,0,.4)' : 'var(--line2)',
            }}>{l}</button>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={save}>{saved ? '✓ Saved' : 'Save settings'}</button>
    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const [key, setKey]         = useState(getApiKey());
  const [saved, setSaved]     = useState(false);
  const [health, setHealth]   = useState('idle');
  const [healthMsg, setHMsg]  = useState('');
  const [apiBase, setApiBase] = useState(API_BASE);

  function saveKey() { setApiKey(key); setSaved(true); setTimeout(() => setSaved(false), 2000); }

  async function checkHealth() {
    setHealth('checking'); setHMsg('');
    try {
      const h = await api.health();
      setHealth('ok'); setHMsg(`v${h.version} · queue: ${h.queue?.queued_jobs ?? 0} jobs`);
    } catch (e) { setHealth('fail'); setHMsg(e.message); }
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// config · settings</div>
        <div className="page-title">Settings</div>
      </div>

      <div className="card" style={{ maxWidth: 480, marginBottom: 12 }}>
        <div className="card-label">API key</div>
        <div className="field">
          <label className="label">X-API-KEY header</label>
          <PwInput value={key} onChange={e => setKey(e.target.value)} placeholder="client_key" />
        </div>
        <button className="btn btn-primary" onClick={saveKey}>{saved ? '✓ Saved' : 'Save key'}</button>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-label">Backend</div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)', marginBottom: 10, wordBreak: 'break-all' }}>
          {apiBase}
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--mute)', marginBottom: 12 }}>
          Override with <code style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>VITE_API_BASE_URL</code> env variable on Vercel.
        </div>
        <button className="btn btn-ghost" onClick={checkHealth}>
          {health === 'checking' ? <><div className="spinner" />Checking…</> : 'Check health'}
        </button>
        {health !== 'idle' && health !== 'checking' && (
          <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: health === 'ok' ? 'var(--green)' : 'var(--red)' }}>
            {health === 'ok' ? '✓ Online' : '✗ Offline'} {healthMsg && `· ${healthMsg}`}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV = [
  { key: 'demo',     icon: '🎯', label: 'Live Demo',         section: 'core' },
  { key: 'break',    icon: '⚡', label: 'Break Your Model',   section: 'core' },
  { key: 'compare',  icon: '⇌',  label: 'Compare runs',    section: 'core' },
  { key: 'report',   icon: '📊', label: 'Single run',      section: 'reports' },
  { key: 'history',  icon: '🕑', label: 'History',         section: 'reports' },
  { key: 'usage',    icon: '📈', label: 'API usage',       section: 'data' },
  { key: 'notifs',   icon: '🔔', label: 'Notifications',   section: 'config', badge: 'new' },
  { key: 'settings', icon: '⚙',  label: 'Settings',        section: 'config' },
];

const sections = [...new Set(NAV.map(n => n.section))];

// ─── App root ─────────────────────────────────────────────────────────────────

export function LegacyApp() {
  const initialPage = window.location.pathname.toLowerCase() === '/demo' ? 'demo' : 'break';
  const [page,        setPage]     = useState(initialPage);
  const [report,      setReport]   = useState(null);
  const [demoReport,  setDemoReport] = useState(null);
  const [compareFocus, setCompareFocus] = useState(null);
  const [persona,     setPersona]  = useState('dev');
  const [apiKey,      setApiKeyS]  = useState(getApiKey());
  const [running,     setRunning]  = useState(pollActive());

  useEffect(() => {
    let mounted = true;

    async function reattachIfStillProcessing() {
      const savedId = ls.get('abl_active_run_id');
      const savedDemoId = ls.get('abl_demo_active_run_id');
      if (pollActive()) return;

      if (savedDemoId) {
        try {
          const report = await api.getDemoReport(savedDemoId);
          if (!mounted) return;
          if (report.status === 'processing') {
            setRunning(true);
            setPage('demo');
            pollStart(savedDemoId, report.sample_count || 5, api.getDemoReport, 'demo');
            return;
          }
        } catch {}
        ls.set('abl_demo_active_run_id', null);
      }

      if (savedId) {
        try {
          const report = await api.getReport(savedId);
          if (!mounted) return;
          if (report.status === 'processing') {
            setRunning(true);
            setPage('break');
            pollStart(savedId, report.sample_count || 20, api.getReport, 'break');
            return;
          }
        } catch {}
        ls.set('abl_active_run_id', null);
      }

      if (mounted) setRunning(false);
    }

    reattachIfStillProcessing();
    const unsub = pollSub(ev => {
      if (ev.type === 'done')   {
        setRunning(false);
        if (ev.mode === 'demo') setDemoReport(ev.report);
        else { setReport(ev.report); setCompareFocus(ev.report); }
        fireNotifications(ev.report);
        ls.set(ev.mode === 'demo' ? 'abl_demo_active_run_id' : 'abl_active_run_id', null);
      }
      if (ev.type === 'failed' || ev.type === 'timeout' || ev.type === 'canceled') {
        setRunning(false);
        ls.set(ev.mode === 'demo' ? 'abl_demo_active_run_id' : 'abl_active_run_id', null);
      }
      if (ev.type === 'tick')   setRunning(true);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  function navigate(key) {
    setPage(key);
    window.history.replaceState({}, '', key === 'demo' ? '/demo' : '/');
  }

  function handleReportReady(r) {
    setReport(r); setCompareFocus(r); setPage('compare');
  }

  function handleDemoReportReady(r) {
    setDemoReport(r); setPage('demo');
  }

  function handleApiKeyChange(k) { setApiKey(k); setApiKeyS(k); }

  // Load a history row as the active report
  async function handleLoadReport(row) {
    try {
      const full = await api.getReport(row.report_id);
      setReport(full); setCompareFocus(full); setPage('compare');
    } catch { setPage('compare'); }
  }

  function handleOpenSingleRun(run) {
    setReport(run); setPage('report');
  }

  return (
    <>
      <style>{css}</style>
      <div className="shell">
        {/* ── Sidebar ── */}
        <aside className="sidebar">
          <div className="logo-area">
            <div className="logo-mark">
              <div className="logo-dot" />
              AI BREAKER LAB
            </div>
            <div className="logo-sub">AI model stress-tester</div>
          </div>

          <nav className="nav">
            {sections.map(sec => (
              <div key={sec}>
                <div className="nav-group-label">{sec}</div>
                {NAV.filter(n => n.section === sec).map(n => (
                  <button key={n.key} className={`nav-btn${page === n.key ? ' active' : ''}`} onClick={() => navigate(n.key)}>
                    <span className="nav-icon">{n.icon}</span>
                    {n.label}
                    {((n.key === 'break' && running && POLL.mode === 'break') || (n.key === 'demo' && running && POLL.mode === 'demo')) && <span className="nav-badge">running</span>}
                    {n.badge && !((n.key === 'break' && running && POLL.mode === 'break') || (n.key === 'demo' && running && POLL.mode === 'demo')) && <span className="nav-badge">{n.badge}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sidebar-foot">
            <div className="key-label">API Key</div>
            <SidebarKey value={apiKey} onChange={e => handleApiKeyChange(e.target.value)} />
          </div>
        </aside>

        {/* ── Main ── */}
        <main className="main">
          <div className="main-toolbar">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              AI Breaker Lab
            </div>
            <PersonaSwitcher persona={persona} setPersona={setPersona} />
          </div>
          {page === 'demo'     && <DemoPage report={demoReport} onReportReady={handleDemoReportReady} />}
          {page === 'break'    && <BreakPage onReportReady={handleReportReady} />}
          {page === 'compare'  && <ComparePage focusReport={compareFocus || report} onOpenSingleRun={handleOpenSingleRun} />}
          {page === 'report'   && <ReportPage report={report} persona={persona} />}
          {page === 'history'  && <HistoryPage onLoadReport={handleLoadReport} />}
          {page === 'usage'    && <UsagePage />}
          {page === 'notifs'   && <NotifsPage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
    </>
  );
}
