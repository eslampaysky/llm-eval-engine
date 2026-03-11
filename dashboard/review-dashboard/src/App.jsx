import { useState, useEffect, useRef, useCallback } from 'react';

// ── API ───────────────────────────────────────────────────────────────────────
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
  breakModel:   (p)  => apiFetch('/break',          { method: 'POST', body: JSON.stringify(p) }),
  getReport:    (id) => apiFetch(`/report/${id}`),
  getHistory:   ()   => apiFetch('/history?limit=100'),
  getUsage:     ()   => apiFetch('/usage/summary'),
  health:       ()   => apiFetch('/health'),
  deleteReport: (id) => fetch(`${API_BASE}/report/${id}`, {
    method: 'DELETE',
    headers: { 'X-API-KEY': getApiKey() },
  }),
};

// ── Poll store — survives tab switches ────────────────────────────────────────
const POLL = { timerId: null, reportId: null, attempts: 0, callbacks: new Set() };

function pollSubscribe(cb) { POLL.callbacks.add(cb); return () => POLL.callbacks.delete(cb); }
function pollNotify(ev)    { POLL.callbacks.forEach(cb => cb(ev)); }
function pollIsActive()    { return !!POLL.timerId; }

// Stage progression based on elapsed ticks
// Backend flow: ~3-8s generate tests → ~(5s*N) call model → scoring → done
const STAGES = [
  { id: 'init',     label: 'Initialising',         icon: '⬡' },
  { id: 'generate', label: 'Generating test suite', icon: '◈' },
  { id: 'calling',  label: 'Calling target model',  icon: '⟳' },
  { id: 'scoring',  label: 'Scoring with Groq',     icon: '◎' },
  { id: 'report',   label: 'Building report',       icon: '▣' },
];

function stageFromAttempts(attempts, numTests) {
  // Each attempt = 3s poll tick
  const secs = attempts * 3;
  if (secs < 5)                            return 0;
  if (secs < 12)                           return 1;
  if (secs < 12 + numTests * 5 * 0.5)     return 2; // midpoint of calling phase
  if (secs < 12 + numTests * 5 * 0.9)     return 3;
  return 4;
}

function pollStart(reportId, numTests) {
  if (POLL.timerId) clearInterval(POLL.timerId);
  POLL.reportId = reportId; POLL.attempts = 0;
  POLL.timerId = setInterval(async () => {
    POLL.attempts++;
    try {
      const r = await api.getReport(reportId);
      if (r.status === 'done') {
        clearInterval(POLL.timerId); POLL.timerId = null; POLL.reportId = null;
        pollNotify({ type: 'done', report: r });
      } else if (r.status === 'failed') {
        clearInterval(POLL.timerId); POLL.timerId = null; POLL.reportId = null;
        pollNotify({ type: 'failed', error: r.error || 'Evaluation failed' });
      } else {
        const stage = stageFromAttempts(POLL.attempts, numTests || 20);
        // estimate progress: 0-95% while running (never hit 100 until done)
        const totalExpected = 12 + (numTests || 20) * 5;
        const pct = Math.min(95, Math.round((POLL.attempts * 3 / totalExpected) * 100));
        pollNotify({ type: 'tick', attempts: POLL.attempts, stage, pct });
      }
    } catch (e) {
      pollNotify({ type: 'error', error: e.message });
    }
    if (POLL.attempts >= 140) {
      clearInterval(POLL.timerId); POLL.timerId = null; POLL.reportId = null;
      pollNotify({ type: 'timeout' });
    }
  }, 3000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function grade(s) {
  if (s >= 8) return 'A'; if (s >= 6.5) return 'B'; if (s >= 5) return 'C';
  if (s >= 3) return 'D'; return 'F';
}
function weighted(row) { return (+row.correctness || 0) * 0.6 + (+row.relevance || 0) * 0.4; }
function ts() { return new Date().toLocaleTimeString('en', { hour12: false }); }
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function scoreColor(s) {
  if (s >= 7) return 'var(--teal)'; if (s >= 5) return 'var(--amber)'; return 'var(--red)';
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const css = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:    #080a0f;
    --bg2:   #0d1018;
    --bg3:   #141720;
    --bg4:   #1a1e2a;
    --line:  #1f2333;
    --line2: #272c3d;
    --mute:  #404758;
    --mid:   #7a8499;
    --text:  #ccd6ed;
    --hi:    #edf2ff;
    --acid:  #b8ff00;
    --acid2: #96d400;
    --red:   #ff4060;
    --amber: #ffac00;
    --teal:  #00d4a8;
    --blue:  #4d9eff;
    --plum:  #b06eff;
    --r:     8px;
    --r2:    14px;
    --head:  'Syne', sans-serif;
    --mono:  'JetBrains Mono', monospace;
    --sidebar-w: 236px;
  }

  html, body, #root { height: 100%; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Shell ── */
  .shell {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1fr;
    min-height: 100vh;
  }

  /* ── Mobile header ── */
  .mobile-header {
    display: none;
    position: fixed;
    top: 0; left: 0; right: 0;
    z-index: 200;
    background: var(--bg2);
    border-bottom: 1px solid var(--line);
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 52px;
  }
  .mobile-logo {
    font-family: var(--head);
    font-size: 16px;
    font-weight: 800;
    color: var(--hi);
    letter-spacing: -.03em;
  }
  .mobile-logo span { color: var(--acid); }
  .hamburger {
    background: none;
    border: 1px solid var(--line2);
    border-radius: 6px;
    color: var(--mid);
    cursor: pointer;
    padding: 7px 9px;
    display: flex; flex-direction: column; gap: 4px; align-items: center;
    transition: all .14s;
  }
  .hamburger:hover { border-color: var(--mid); color: var(--text); }
  .hamburger span {
    display: block;
    width: 16px; height: 1.5px;
    background: currentColor;
    border-radius: 1px;
    transition: all .2s;
  }
  .hamburger.open span:nth-child(1) { transform: translateY(5.5px) rotate(45deg); }
  .hamburger.open span:nth-child(2) { opacity: 0; }
  .hamburger.open span:nth-child(3) { transform: translateY(-5.5px) rotate(-45deg); }

  /* ── Sidebar ── */
  .sidebar {
    background: var(--bg2);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow: hidden;
    transition: transform .24s ease;
    z-index: 100;
  }
  .sidebar-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.55);
    z-index: 99;
  }

  /* logo */
  .logo { padding: 22px 20px 18px; border-bottom: 1px solid var(--line); }
  .logo-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: rgba(184,255,0,.08); border: 1px solid rgba(184,255,0,.2);
    border-radius: 4px; padding: 2px 8px;
    font-size: 9px; font-weight: 600; letter-spacing: .15em;
    text-transform: uppercase; color: var(--acid); margin-bottom: 10px;
  }
  .logo-pulse {
    width: 6px; height: 6px; background: var(--acid);
    border-radius: 50%; animation: pulse 2.2s ease-in-out infinite; flex-shrink: 0;
  }
  .logo-name {
    font-family: var(--head); font-size: 19px; font-weight: 800;
    color: var(--hi); letter-spacing: -.03em; line-height: 1;
  }
  .logo-sub { font-size: 10px; color: var(--mute); margin-top: 4px; letter-spacing: .03em; }

  /* nav */
  .nav { flex: 1; padding: 12px 10px; overflow-y: auto; }
  .nav-group-label {
    font-size: 9px; letter-spacing: .14em; text-transform: uppercase;
    color: var(--mute); padding: 10px 10px 4px;
  }
  .nav-btn {
    display: flex; align-items: center; gap: 9px;
    width: 100%; padding: 9px 10px;
    border: 1px solid transparent; border-radius: var(--r);
    background: transparent; color: var(--mid);
    font-family: var(--mono); font-size: 12px;
    cursor: pointer; text-align: left; transition: all .14s;
  }
  .nav-btn:hover { background: var(--bg3); color: var(--text); }
  .nav-btn.active { background: rgba(184,255,0,.07); color: var(--acid); border-color: rgba(184,255,0,.18); }
  .nav-icon { font-size: 13px; width: 18px; text-align: center; flex-shrink: 0; }
  .nav-badge {
    margin-left: auto; display: flex; align-items: center; gap: 4px;
    font-size: 9px; color: var(--amber); letter-spacing: .06em; flex-shrink: 0;
  }
  .nav-badge-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--amber); animation: pulse 1s ease-in-out infinite; }
  .nav-dot-acid { margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: var(--acid); flex-shrink: 0; }

  /* sidebar footer */
  .sidebar-footer { padding: 14px 16px; border-top: 1px solid var(--line); }
  .key-label { font-size: 9px; color: var(--mute); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 6px; }
  .key-row { display: flex; align-items: center; gap: 6px; }
  .key-input {
    flex: 1; background: var(--bg3); border: 1px solid var(--line2);
    border-radius: var(--r); color: var(--text); font-family: var(--mono);
    font-size: 11px; padding: 7px 10px; outline: none;
    transition: border-color .14s; min-width: 0;
  }
  .key-input:focus { border-color: var(--acid); }
  .eye-btn {
    background: var(--bg3); border: 1px solid var(--line2); border-radius: var(--r);
    color: var(--mute); cursor: pointer; padding: 6px 8px; font-size: 13px; line-height: 1;
    transition: all .14s; flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  }
  .eye-btn:hover { color: var(--text); background: var(--bg4); border-color: var(--mid); }

  /* ── Main ── */
  .main { overflow-y: auto; }
  .page { padding: 36px 40px; max-width: 1120px; }

  /* ── Page header ── */
  .page-header { margin-bottom: 28px; }
  .page-tag { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--acid); margin-bottom: 6px; }
  .page-title {
    font-family: var(--head); font-size: 30px; font-weight: 800;
    color: var(--hi); letter-spacing: -.035em; line-height: 1.05;
  }
  .page-desc { color: var(--mid); font-size: 13px; margin-top: 7px; line-height: 1.5; }

  /* ── Cards ── */
  .card { background: var(--bg2); border: 1px solid var(--line); border-radius: var(--r2); padding: 22px; }
  .card-title {
    font-family: var(--head); font-size: 13px; font-weight: 700;
    color: var(--hi); letter-spacing: -.01em; margin-bottom: 16px;
  }

  /* ── Forms ── */
  .field { margin-bottom: 14px; }
  .label {
    display: block; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--mid); margin-bottom: 5px;
  }
  .input, .select, .textarea {
    width: 100%; background: var(--bg3); border: 1px solid var(--line2);
    border-radius: var(--r); color: var(--text); font-family: var(--mono);
    font-size: 13px; padding: 10px 12px; outline: none;
    transition: border-color .14s, box-shadow .14s;
  }
  .input:focus, .select:focus, .textarea:focus {
    border-color: var(--acid); box-shadow: 0 0 0 3px rgba(184,255,0,.07);
  }
  .select option { background: var(--bg2); }
  .textarea { resize: vertical; min-height: 90px; }

  .pw-field { position: relative; }
  .pw-field .input { padding-right: 40px; }
  .pw-toggle {
    position: absolute; right: 0; top: 0; bottom: 0; width: 38px;
    background: none; border: none; color: var(--mute); cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; transition: color .14s;
  }
  .pw-toggle:hover { color: var(--text); }

  .input-row   { display: grid; grid-template-columns: 1fr 1fr;     gap: 12px; }
  .input-row-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }

  /* ── Buttons ── */
  .btn {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 9px 18px; border-radius: var(--r); border: none;
    font-family: var(--mono); font-size: 12px; font-weight: 600;
    cursor: pointer; transition: all .14s; letter-spacing: .02em; white-space: nowrap;
  }
  .btn-primary { background: var(--acid); color: var(--bg); }
  .btn-primary:hover { background: var(--acid2); transform: translateY(-1px); box-shadow: 0 6px 20px rgba(184,255,0,.22); }
  .btn-primary:disabled { opacity: .38; cursor: not-allowed; transform: none; box-shadow: none; }
  .btn-ghost { background: transparent; color: var(--mid); border: 1px solid var(--line2); }
  .btn-ghost:hover { border-color: var(--mid); color: var(--text); background: var(--bg3); }
  .btn-danger { background: transparent; color: var(--red); border: 1px solid rgba(255,64,96,.28); }
  .btn-danger:hover { background: rgba(255,64,96,.08); }
  .btn-lg { padding: 13px 28px; font-size: 14px; border-radius: 12px; }

  /* ── Presets ── */
  .presets { display: flex; align-items: center; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
  .presets-label { font-size: 9px; color: var(--mute); letter-spacing: .08em; text-transform: uppercase; }
  .preset-chip {
    background: var(--bg3); border: 1px solid var(--line2); border-radius: 5px;
    color: var(--mid); font-family: var(--mono); font-size: 10px; font-weight: 600;
    padding: 3px 10px; cursor: pointer; transition: all .14s; letter-spacing: .04em;
  }
  .preset-chip:hover { color: var(--acid); border-color: rgba(184,255,0,.3); background: rgba(184,255,0,.04); }
  .preset-chip:disabled { opacity: .4; cursor: not-allowed; }

  /* ── Progress panel ── */
  .progress-panel {
    background: var(--bg2);
    border: 1px solid rgba(184,255,0,.18);
    border-radius: var(--r2);
    padding: 20px 22px;
    margin-bottom: 18px;
    animation: fadeIn .3s ease;
  }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }

  .progress-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .progress-title { font-family: var(--head); font-size: 13px; font-weight: 700; color: var(--hi); display: flex; align-items: center; gap: 8px; }
  .progress-pct { font-size: 12px; color: var(--acid); font-weight: 600; }

  .progress-bar-wrap { height: 4px; background: var(--line2); border-radius: 2px; overflow: hidden; margin-bottom: 18px; }
  .progress-bar-fill {
    height: 100%; border-radius: 2px;
    background: linear-gradient(90deg, var(--acid2), var(--acid));
    transition: width .6s ease;
    box-shadow: 0 0 8px rgba(184,255,0,.4);
  }

  .stages { display: flex; gap: 0; }
  .stage-item {
    flex: 1; display: flex; flex-direction: column; align-items: center;
    gap: 6px; position: relative; opacity: .3; transition: opacity .3s;
  }
  .stage-item.active { opacity: 1; }
  .stage-item.done   { opacity: .6; }
  .stage-item:not(:last-child)::after {
    content: ''; position: absolute; top: 13px; left: 50%; right: -50%;
    height: 1px; background: var(--line2); z-index: 0;
  }
  .stage-item.done:not(:last-child)::after { background: rgba(184,255,0,.3); }
  .stage-icon {
    width: 26px; height: 26px; border-radius: 50%;
    background: var(--bg3); border: 1px solid var(--line2);
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; position: relative; z-index: 1; transition: all .3s;
  }
  .stage-item.active .stage-icon {
    background: rgba(184,255,0,.1); border-color: rgba(184,255,0,.4);
    color: var(--acid); box-shadow: 0 0 10px rgba(184,255,0,.2);
    animation: stagePulse 1.4s ease-in-out infinite;
  }
  .stage-item.done .stage-icon { background: rgba(0,212,168,.1); border-color: rgba(0,212,168,.3); color: var(--teal); }
  @keyframes stagePulse {
    0%,100% { box-shadow: 0 0 10px rgba(184,255,0,.2); }
    50%      { box-shadow: 0 0 20px rgba(184,255,0,.5); }
  }
  .stage-label { font-size: 9px; color: var(--mute); text-align: center; letter-spacing: .04em; }
  .stage-item.active .stage-label { color: var(--acid); }
  .stage-item.done   .stage-label { color: var(--teal); }

  /* ── Log ── */
  .run-log {
    background: var(--bg); border: 1px solid var(--line); border-radius: var(--r2);
    padding: 14px 16px; font-size: 11.5px; max-height: 200px; overflow-y: auto;
    margin-top: 14px; scrollbar-width: thin; scrollbar-color: var(--line2) transparent;
  }
  .log-line { padding: 2px 0; color: var(--mid); }
  .log-line.ok   { color: var(--teal); }
  .log-line.err  { color: var(--red); }
  .log-line.info { color: var(--acid); }
  .log-ts { color: var(--mute); margin-right: 10px; font-size: 10px; }

  /* ── Spinner ── */
  .spinner {
    width: 14px; height: 14px; border: 2px solid var(--line2);
    border-top-color: var(--acid); border-radius: 50%;
    animation: spin .65s linear infinite; flex-shrink: 0;
  }
  .spinner-sm { width: 10px; height: 10px; border-width: 1.5px; }
  .spinner-amber { border-top-color: var(--amber); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.25; transform:scale(.55); } }

  /* ── Badges ── */
  .badge {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 2px 9px; border-radius: 999px;
    font-size: 10px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  }
  .badge-processing { background: rgba(255,172,0,.1);  color: var(--amber); border: 1px solid rgba(255,172,0,.22); }
  .badge-done       { background: rgba(0,212,168,.09); color: var(--teal);  border: 1px solid rgba(0,212,168,.2); }
  .badge-failed     { background: rgba(255,64,96,.09); color: var(--red);   border: 1px solid rgba(255,64,96,.2); }
  .badge-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
  .badge-dot.animate { animation: pulse 1.1s ease-in-out infinite; }

  /* ── KPI grid ── */
  .kpi-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 20px; }
  .kpi {
    background: var(--bg2); border: 1px solid var(--line);
    border-radius: var(--r2); padding: 18px 16px;
    position: relative; overflow: hidden;
  }
  .kpi::after {
    content: ''; position: absolute; top: 0; left: 0; right: 0;
    height: 2px; background: var(--kpi-accent, var(--line));
  }
  .kpi-acid  { --kpi-accent: var(--acid); }
  .kpi-teal  { --kpi-accent: var(--teal); }
  .kpi-red   { --kpi-accent: var(--red); }
  .kpi-amber { --kpi-accent: var(--amber); }
  .kpi-label { font-size: 9px; color: var(--mute); letter-spacing: .1em; text-transform: uppercase; margin-bottom: 8px; }
  .kpi-value { font-family: var(--head); font-size: 28px; font-weight: 800; color: var(--hi); line-height: 1; }
  .kpi-acid  .kpi-value { color: var(--acid); }
  .kpi-teal  .kpi-value { color: var(--teal); }
  .kpi-red   .kpi-value { color: var(--red); }
  .kpi-amber .kpi-value { color: var(--amber); }
  .kpi-sub { font-size: 10px; color: var(--mute); margin-top: 5px; }

  /* ── Grade circle ── */
  .grade-block { display: flex; align-items: center; gap: 20px; margin-bottom: 20px; }
  .grade-circle {
    width: 70px; height: 70px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--head); font-size: 28px; font-weight: 800; flex-shrink: 0;
  }
  .grade-A { background: rgba(0,212,168,.12);  color: var(--teal);  border: 2px solid rgba(0,212,168,.3); }
  .grade-B { background: rgba(184,255,0,.09);  color: var(--acid);  border: 2px solid rgba(184,255,0,.25); }
  .grade-C { background: rgba(255,172,0,.11);  color: var(--amber); border: 2px solid rgba(255,172,0,.25); }
  .grade-D, .grade-F { background: rgba(255,64,96,.1); color: var(--red); border: 2px solid rgba(255,64,96,.25); }

  /* ── Tables ── */
  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
    color: var(--mute); padding: 10px 12px; border-bottom: 1px solid var(--line); font-weight: 600;
    white-space: nowrap;
  }
  td { padding: 11px 12px; font-size: 12px; border-bottom: 1px solid var(--line); vertical-align: top; color: var(--text); }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: rgba(255,255,255,.016); }
  .td-muted  { color: var(--mute); }
  .td-bright { color: var(--hi); font-weight: 600; }

  /* expandable result row */
  .result-row { cursor: pointer; }
  .result-row:hover td { background: rgba(184,255,0,.025); }
  .result-expand {
    background: var(--bg3) !important;
    animation: fadeIn .15s ease;
  }
  .result-expand td { padding: 14px 16px; }
  .expand-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .expand-section { }
  .expand-label { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--mute); margin-bottom: 6px; }
  .expand-value { font-size: 12px; color: var(--text); line-height: 1.5; }

  /* ── Delete button ── */
  .del-btn {
    background: none; border: 1px solid transparent; border-radius: 5px;
    color: var(--mute); cursor: pointer; padding: 4px 7px; font-size: 12px;
    line-height: 1; transition: all .14s; display: inline-flex; align-items: center;
  }
  .del-btn:hover { color: var(--red); background: rgba(255,64,96,.08); border-color: rgba(255,64,96,.25); }
  .del-btn:disabled { opacity: .4; cursor: not-allowed; }

  /* ── Chips ── */
  .chip {
    display: inline-block; padding: 2px 7px; border-radius: 4px;
    font-size: 10px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
  }
  .chip-factual            { background: rgba(77,158,255,.1);   color: var(--blue); }
  .chip-adversarial        { background: rgba(255,172,0,.1);    color: var(--amber); }
  .chip-hallucination_bait { background: rgba(255,64,96,.1);    color: var(--red); }
  .chip-consistency        { background: rgba(0,212,168,.08);   color: var(--teal); }
  .chip-refusal            { background: rgba(184,255,0,.07);   color: var(--acid); }
  .chip-jailbreak_lite     { background: rgba(176,110,255,.1);  color: var(--plum); }
  .chip-unknown            { background: var(--bg3); color: var(--mute); }

  /* ── Score pill ── */
  .score-pill {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 22px; border-radius: 6px; font-size: 11px; font-weight: 700;
  }
  .score-high { background: rgba(0,212,168,.13);  color: var(--teal); }
  .score-mid  { background: rgba(255,172,0,.13);  color: var(--amber); }
  .score-low  { background: rgba(255,64,96,.12);  color: var(--red); }

  /* ── Red flags ── */
  .red-flags {
    background: rgba(255,64,96,.04); border: 1px solid rgba(255,64,96,.18);
    border-radius: var(--r2); padding: 14px 18px; margin-bottom: 18px;
  }
  .red-flag-title {
    font-family: var(--head); font-size: 11px; font-weight: 700;
    color: var(--red); letter-spacing: .1em; text-transform: uppercase;
    margin-bottom: 10px; display: flex; align-items: center; gap: 8px;
  }
  .red-flag-item {
    display: flex; align-items: flex-start; gap: 9px;
    padding: 6px 0; border-bottom: 1px solid rgba(255,64,96,.08);
    font-size: 12px; color: #ffaab8;
  }
  .red-flag-item:last-child { border-bottom: none; }
  .red-flag-item::before { content:'⚑'; color: var(--red); flex-shrink: 0; margin-top:1px; }

  /* ── Tabs ── */
  .tabs { display: flex; gap: 2px; margin-bottom: 18px; border-bottom: 1px solid var(--line); overflow-x: auto; }
  .tab {
    padding: 9px 16px; font-family: var(--mono); font-size: 12px;
    background: transparent; border: none; border-bottom: 2px solid transparent;
    color: var(--mid); cursor: pointer; margin-bottom: -1px; transition: all .14s; white-space: nowrap;
  }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--acid); border-bottom-color: var(--acid); }

  /* ── Section head ── */
  .section-head {
    font-family: var(--head); font-size: 12px; font-weight: 700; color: var(--hi);
    letter-spacing: -.01em; margin: 22px 0 12px;
    display: flex; align-items: center; gap: 10px;
  }
  .section-head::after { content:''; flex:1; height:1px; background: var(--line); }

  /* ── Breakdown bars ── */
  .breakdown-row { display: flex; align-items: center; gap: 12px; margin-bottom: 11px; }
  .breakdown-label { width: 150px; font-size: 11px; color: var(--mid); flex-shrink: 0; }
  .breakdown-bar   { flex: 1; height: 5px; background: var(--line2); border-radius: 3px; overflow: hidden; }
  .breakdown-fill  { height: 100%; border-radius: 3px; transition: width .7s ease; }
  .breakdown-score { width: 34px; text-align: right; font-size: 11px; font-weight: 700; color: var(--hi); }
  .breakdown-count { width: 58px; text-align: right; font-size: 10px; color: var(--mute); }

  /* ── Error / empty ── */
  .error-box {
    background: rgba(255,64,96,.07); border: 1px solid rgba(255,64,96,.22);
    border-radius: var(--r); padding: 10px 14px;
    color: #ffaab8; font-size: 12px; margin-bottom: 14px;
  }
  .empty { text-align: center; padding: 48px; color: var(--mute); }
  .empty-icon { font-size: 28px; margin-bottom: 10px; opacity: .4; }

  /* ── Health dot ── */
  .health-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .health-ok   { background: var(--teal); box-shadow: 0 0 6px rgba(0,212,168,.5); }
  .health-fail { background: var(--red); }
  .health-idle { background: var(--mute); }

  /* ── Mobile bottom nav ── */
  .bottom-nav {
    display: none;
    position: fixed; bottom: 0; left: 0; right: 0;
    background: var(--bg2); border-top: 1px solid var(--line);
    padding: 6px 0 max(6px, env(safe-area-inset-bottom));
    z-index: 200;
  }
  .bottom-nav-inner { display: flex; justify-content: space-around; }
  .bottom-nav-btn {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: none; border: none; cursor: pointer;
    color: var(--mute); font-family: var(--mono); font-size: 9px;
    padding: 4px 0; transition: color .14s; position: relative;
  }
  .bottom-nav-btn.active { color: var(--acid); }
  .bottom-nav-btn .bnav-icon { font-size: 16px; }
  .bnav-badge {
    position: absolute; top: 2px; right: calc(50% - 16px);
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--amber); animation: pulse 1s ease-in-out infinite;
  }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .mobile-header { display: flex; }
    .bottom-nav { display: block; }
    .sidebar-overlay.open { display: block; }

    .shell {
      grid-template-columns: 1fr;
      padding-top: 52px;
      padding-bottom: 64px;
    }
    .sidebar {
      position: fixed;
      top: 0; left: 0; bottom: 0;
      width: var(--sidebar-w);
      transform: translateX(-100%);
    }
    .sidebar.open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,.5); }

    .main { grid-column: 1; }
    .page { padding: 20px 16px; }

    .kpi-grid { grid-template-columns: 1fr 1fr; }
    .input-row, .input-row-3 { grid-template-columns: 1fr; }

    .break-grid { grid-template-columns: 1fr !important; }

    .stages { flex-wrap: wrap; gap: 8px; justify-content: center; }
    .stage-item { flex: 0 0 auto; width: calc(33% - 6px); }
    .stage-item::after { display: none !important; }

    .expand-grid { grid-template-columns: 1fr; }

    .page-title { font-size: 24px; }
    .grade-circle { width: 54px; height: 54px; font-size: 22px; }
  }

  @media (max-width: 480px) {
    .kpi-grid { grid-template-columns: 1fr 1fr; gap: 8px; }
    .kpi { padding: 14px 12px; }
    .kpi-value { font-size: 22px; }
    table { font-size: 11px; }
    th, td { padding: 8px 10px; }
  }
`;

// ── Sub-components ────────────────────────────────────────────────────────────

function PwInput({ value, onChange, placeholder, disabled, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="pw-field">
      <input
        type={show ? 'text' : 'password'}
        className="input"
        value={value} onChange={onChange} placeholder={placeholder}
        disabled={disabled} autoComplete={autoComplete || 'off'}
      />
      <button type="button" className="pw-toggle" onClick={() => setShow(s => !s)}>
        {show ? '○' : '●'}
      </button>
    </div>
  );
}

function SidebarKeyInput({ value, onChange }) {
  const [show, setShow] = useState(false);
  return (
    <div className="key-row">
      <input
        type={show ? 'text' : 'password'}
        className="key-input"
        value={value} onChange={onChange} placeholder="client_key"
        autoComplete="off" spellCheck={false}
      />
      <button className="eye-btn" onClick={() => setShow(s => !s)} title={show ? 'Hide' : 'Show'}>
        {show ? '○' : '●'}
      </button>
    </div>
  );
}

function TypeChip({ type }) {
  return <span className={`chip chip-${(type || 'unknown').replace(/\s/g, '_')}`}>{type || 'unknown'}</span>;
}

function ScorePill({ value }) {
  const v = +value;
  const cls = v >= 7 ? 'score-high' : v >= 5 ? 'score-mid' : 'score-low';
  return <span className={`score-pill ${cls}`}>{v.toFixed(1)}</span>;
}

function Breakdown({ results }) {
  const types = [...new Set(results.map(r => r.test_type || 'unknown'))];
  return (
    <div>
      {types.map(t => {
        const rows = results.filter(r => (r.test_type || 'unknown') === t);
        const avg  = rows.reduce((s, r) => s + weighted(r), 0) / rows.length;
        return (
          <div key={t} className="breakdown-row">
            <div className="breakdown-label"><TypeChip type={t} /></div>
            <div className="breakdown-bar">
              <div className="breakdown-fill" style={{ width: `${avg * 10}%`, background: scoreColor(avg) }} />
            </div>
            <div className="breakdown-score">{avg.toFixed(1)}</div>
            <div className="breakdown-count">{rows.length} tests</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Progress Panel ────────────────────────────────────────────────────────────
function ProgressPanel({ stage, pct, numTests }) {
  return (
    <div className="progress-panel">
      <div className="progress-header">
        <div className="progress-title">
          <div className="spinner spinner-amber" />
          Breaking your model…
        </div>
        <div className="progress-pct">{pct}%</div>
      </div>

      <div className="progress-bar-wrap">
        <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="stages">
        {STAGES.map((s, i) => (
          <div
            key={s.id}
            className={`stage-item ${i === stage ? 'active' : i < stage ? 'done' : ''}`}
          >
            <div className="stage-icon">
              {i < stage ? '✓' : s.icon}
            </div>
            <div className="stage-label">{s.label}</div>
          </div>
        ))}
      </div>
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
  const [loading,  setLoading]  = useState(false);
  const [polling,  setPolling]  = useState(pollIsActive());
  const [stage,    setStage]    = useState(0);
  const [pct,      setPct]      = useState(0);
  const [error,    setError]    = useState('');
  const [logs,     setLogs]     = useState([]);
  const logRef = useRef(null);

  useEffect(() => {
    const unsub = pollSubscribe((ev) => {
      if (ev.type === 'done') {
        setPolling(false); setStage(0); setPct(100);
        addLog(`✓ Done! ${ev.report.results?.length || 0} tests completed.`, 'ok');
        setTimeout(() => onReportReady(ev.report), 400);
      } else if (ev.type === 'failed') {
        setPolling(false); setStage(0);
        setError(ev.error); addLog(`✗ Failed: ${ev.error}`, 'err');
      } else if (ev.type === 'timeout') {
        setPolling(false); setStage(0);
        setError('Timed out after 7 minutes'); addLog('✗ Timed out', 'err');
      } else if (ev.type === 'error') {
        addLog(`⚠ Poll error: ${ev.error}`, 'err');
      } else if (ev.type === 'tick') {
        setStage(ev.stage ?? 0);
        setPct(ev.pct ?? 0);
        if (ev.attempts % 5 === 0) addLog(`${STAGES[ev.stage ?? 0].label}… (${ev.attempts * 3}s)`, 'info');
      }
    });
    return unsub;
  }, []);

  function addLog(msg, type = 'info') {
    setLogs(prev => [...prev, { msg, type, t: ts() }]);
    setTimeout(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, 40);
  }

  function set(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSubmit() {
    setError(''); setLogs([]); setLoading(true); setStage(0); setPct(0);
    const target = targetType === 'openai'
      ? { type: 'openai', base_url: form.base_url || 'https://api.openai.com', api_key: form.api_key, model_name: form.model_name }
      : targetType === 'huggingface'
      ? { type: 'huggingface', repo_id: form.repo_id, api_token: form.api_token }
      : { type: 'webhook', endpoint_url: form.endpoint_url, payload_template: form.payload_template };

    const payload = {
      target, description: form.description,
      num_tests: +form.num_tests,
      ...(form.groq_api_key ? { groq_api_key: form.groq_api_key } : {}),
    };

    try {
      addLog('Submitting break request…', 'info');
      const res = await api.breakModel(payload);
      addLog(`Job queued · ID: ${res.report_id}`, 'ok');
      addLog(`Generating ${form.num_tests} adversarial tests…`, 'info');
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

  const PRESETS = [
    { label: '✦ Gemini',     url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash' },
    { label: '✦ GPT-4o mini', url: 'https://api.openai.com', model: 'gpt-4o-mini' },
    { label: '✦ Groq Llama', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// core action</div>
        <div className="page-title">Break Your Model</div>
        <div className="page-desc">Connect your model endpoint. We generate adversarial tests and try to break it.</div>
      </div>

      {polling && <ProgressPanel stage={stage} pct={pct} numTests={+form.num_tests} />}
      {error && <div className="error-box">⚠ {error}</div>}

      <div className="break-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Target */}
        <div className="card">
          <div className="card-title">01 — Target Model</div>

          <div className="presets">
            <span className="presets-label">Quick fill:</span>
            {PRESETS.map(p => (
              <button key={p.label} className="preset-chip" disabled={busy}
                onClick={() => { setTargetType('openai'); set('base_url', p.url); set('model_name', p.model); }}>
                {p.label}
              </button>
            ))}
          </div>

          <div className="field">
            <label className="label">Adapter type</label>
            <select className="select" value={targetType} onChange={e => setTargetType(e.target.value)} disabled={busy}>
              <option value="openai">OpenAI-compatible (Gemini, OpenAI, Groq, vLLM…)</option>
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
                <PwInput placeholder="sk-… / AIza…" value={form.api_key} onChange={e => set('api_key', e.target.value)} disabled={busy} />
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
              <PwInput placeholder="hf_…" value={form.api_token} onChange={e => set('api_token', e.target.value)} disabled={busy} />
            </div>
          </>}

          {targetType === 'webhook' && <>
            <div className="field">
              <label className="label">Endpoint URL</label>
              <input className="input" placeholder="https://your-api.com/ask" value={form.endpoint_url} onChange={e => set('endpoint_url', e.target.value)} disabled={busy} />
            </div>
            <div className="field">
              <label className="label">Payload template <span style={{ color: 'var(--mute)' }}>(use {'{question}'})</span></label>
              <input className="input" value={form.payload_template} onChange={e => set('payload_template', e.target.value)} disabled={busy} />
            </div>
          </>}
        </div>

        {/* Config */}
        <div className="card">
          <div className="card-title">02 — Test Configuration</div>

          <div className="field">
            <label className="label">Describe your model</label>
            <textarea
              className="textarea"
              placeholder='e.g. "Arabic customer support bot for an Egyptian e-commerce store that handles order tracking, returns, and complaints"'
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
              <label className="label">Groq API Key <span style={{ color: 'var(--mute)' }}>(judge)</span></label>
              <PwInput placeholder="gsk_… (or set GROQ_API_KEY in .env)" value={form.groq_api_key} onChange={e => set('groq_api_key', e.target.value)} disabled={busy} />
            </div>
          </div>

          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--mute)', marginBottom: 12, lineHeight: 1.7 }}>
              Test types: <span style={{ color: 'var(--blue)' }}>factual</span> · <span style={{ color: 'var(--amber)' }}>adversarial</span> · <span style={{ color: 'var(--red)' }}>hallucination_bait</span> · <span style={{ color: 'var(--teal)' }}>consistency</span> · <span style={{ color: 'var(--acid)' }}>refusal</span> · <span style={{ color: 'var(--plum)' }}>jailbreak_lite</span>
            </div>
            <button className="btn btn-primary btn-lg" onClick={handleSubmit} disabled={busy || !form.description.trim()}>
              {loading ? <><div className="spinner" /> Submitting…</> : polling ? <><div className="spinner" /> Running…</> : '⚡ Break It'}
            </button>
          </div>
        </div>
      </div>

      {logs.length > 0 && (
        <div className="run-log" ref={logRef}>
          {logs.map((l, i) => (
            <div key={i} className={`log-line ${l.type}`}>
              <span className="log-ts">{l.t}</span>{l.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Report Page ───────────────────────────────────────────────────────────────
function ReportPage({ report }) {
  const [tab,      setTab]      = useState('overview');
  const [copied,   setCopied]   = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  function toggleRow(i) {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(i) ? s.delete(i) : s.add(i);
      return s;
    });
  }

  if (!report) return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// last run</div>
        <div className="page-title">Breaker Report</div>
      </div>
      <div className="empty">
        <div className="empty-icon">📊</div>
        No report yet — run a break test to see results here.
      </div>
    </div>
  );

  const results     = report.results || [];
  const metrics     = report.metrics || {};
  const overall     = +(metrics.average_score || 0);
  const g           = grade(overall);
  const failures    = results.filter(r => weighted(r) < 5 || r.hallucination);
  const hallucCount = results.filter(r => r.hallucination).length;
  const hallucRate  = results.length ? ((hallucCount / results.length) * 100).toFixed(0) : 0;
  const redFlags    = metrics.red_flags || [];

  function copyId() {
    navigator.clipboard.writeText(report.report_id);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  }

  function ResultTable({ rows }) {
    return (
      <div className="card table-wrap">
        {rows.length === 0
          ? <div className="empty"><div className="empty-icon">🎉</div>No failures detected</div>
          : <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Question</th>
                  <th>Score</th>
                  <th>Halluc.</th>
                  <th style={{ width: 24 }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const globalIdx = results.indexOf(r);
                  const isOpen    = expanded.has(globalIdx);
                  return [
                    <tr key={`r${i}`} className="result-row" onClick={() => toggleRow(globalIdx)}>
                      <td><TypeChip type={r.test_type} /></td>
                      <td style={{ maxWidth: 280, fontSize: 11 }}>{r.question}</td>
                      <td><ScorePill value={weighted(r)} /></td>
                      <td style={{ color: r.hallucination ? 'var(--red)' : 'var(--teal)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {r.hallucination ? '⚠ Yes' : '✓ No'}
                      </td>
                      <td style={{ color: 'var(--mute)', fontSize: 11 }}>{isOpen ? '▲' : '▼'}</td>
                    </tr>,
                    isOpen && (
                      <tr key={`e${i}`} className="result-expand">
                        <td colSpan={5}>
                          <div className="expand-grid">
                            <div className="expand-section">
                              <div className="expand-label">Ground Truth</div>
                              <div className="expand-value">{r.ground_truth || <span style={{ color: 'var(--mute)' }}>—</span>}</div>
                            </div>
                            <div className="expand-section">
                              <div className="expand-label">Model Answer</div>
                              <div className="expand-value">{r.model_answer || <span style={{ color: 'var(--mute)' }}>—</span>}</div>
                            </div>
                            <div className="expand-section" style={{ gridColumn: '1 / -1' }}>
                              <div className="expand-label">Judge Reasoning</div>
                              <div className="expand-value" style={{ color: 'var(--mid)' }}>{r.reason || '—'}</div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
        }
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// last run · {fmtDate(report.created_at)}</div>
        <div className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          Breaker Report
          <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 10px' }} onClick={copyId}>
            {copied ? '✓ copied' : 'copy id'}
          </button>
        </div>
        <div className="page-desc">
          Model: <strong style={{ color: 'var(--hi)' }}>{report.model_version || '—'}</strong>
          &nbsp;·&nbsp;{results.length} tests&nbsp;·&nbsp;Judge: {report.judge_model || 'groq'}
        </div>
      </div>

      <div className="grade-block">
        <div className={`grade-circle grade-${g}`}>{g}</div>
        <div>
          <div style={{ fontFamily: 'var(--head)', fontSize: 22, fontWeight: 800, color: 'var(--hi)' }}>
            Overall Score: {overall.toFixed(1)} / 10
          </div>
          <div style={{ color: 'var(--mute)', fontSize: 12, marginTop: 4 }}>
            {g === 'A' ? 'Excellent — production ready' :
             g === 'B' ? 'Good — minor issues detected' :
             g === 'C' ? 'Fair — review failures before deploying' :
             'Poor — significant issues, not production ready'}
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
          <div className="kpi-sub">{hallucCount} / {results.length}</div>
        </div>
        <div className={`kpi ${failures.length > results.length * 0.3 ? 'kpi-red' : ''}`}>
          <div className="kpi-label">Failed Tests</div>
          <div className="kpi-value">{failures.length}</div>
          <div className="kpi-sub">score &lt; 5 or hallucination</div>
        </div>
      </div>

      {redFlags.length > 0 && (
        <div className="red-flags">
          <div className="red-flag-title">⚑ Red Flags</div>
          {redFlags.map((f, i) => <div key={i} className="red-flag-item">{f}</div>)}
        </div>
      )}

      <div className="tabs">
        {['overview', 'failures', 'all results'].map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          <div className="section-head">Breakdown by Test Type</div>
          <div className="card" style={{ marginBottom: 18 }}>
            <Breakdown results={results} />
          </div>
          {report.html_report_url && (
            <button className="btn btn-ghost" onClick={async () => {
              try {
                const res = await fetch(`${API_BASE}${report.html_report_url}`, { headers: { 'X-API-KEY': getApiKey() } });
                if (!res.ok) throw new Error('Failed to load');
                const html = await res.text();
                window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
              } catch (e) { alert('Could not load HTML report: ' + e.message); }
            }}>↗ View Full HTML Report</button>
          )}
        </>
      )}

      {tab === 'failures' && <ResultTable rows={failures} />}
      {tab === 'all results' && <ResultTable rows={results} />}
    </div>
  );
}

// ── History Page ──────────────────────────────────────────────────────────────
function HistoryPage({ onLoadReport }) {
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [err,      setErr]      = useState('');
  const [deleting, setDeleting] = useState(new Set());
  const [sortKey,  setSortKey]  = useState('timestamp');
  const [sortDir,  setSortDir]  = useState(-1); // -1 = desc

  useEffect(() => {
    api.getHistory()
      .then(r => setRows(Array.isArray(r) ? r : r.history || []))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(reportId) {
    setDeleting(prev => new Set(prev).add(reportId));
    try {
      const res = await api.deleteReport(reportId);
      if (res.ok || res.status === 404) {
        setRows(prev => prev.filter(r => r.report_id !== reportId));
      } else {
        const body = await res.json().catch(() => ({}));
        setErr(body?.detail || `Delete failed (${res.status})`);
      }
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeleting(prev => { const s = new Set(prev); s.delete(reportId); return s; });
    }
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? '';
    const bv = b[sortKey] ?? '';
    return sortDir * (av < bv ? -1 : av > bv ? 1 : 0);
  });

  function SortTh({ k, label }) {
    const active = sortKey === k;
    return (
      <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(k)}>
        {label} {active ? (sortDir === -1 ? '↓' : '↑') : <span style={{ opacity: .3 }}>↕</span>}
      </th>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// audit trail</div>
        <div className="page-title">Run History</div>
        <div className="page-desc">{rows.length} run{rows.length !== 1 ? 's' : ''} · click column headers to sort</div>
      </div>

      {err && <div className="error-box">{err}</div>}

      {loading ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto 12px' }} /></div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🕑</div>
          No runs yet — break something first.
        </div>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <SortTh k="timestamp"     label="Date" />
                <SortTh k="model_version" label="Model" />
                <SortTh k="sample_count"  label="Tests" />
                <SortTh k="status"        label="Status" />
                <SortTh k="total_cost_usd" label="Cost" />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.report_id}>
                  <td className="td-muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.timestamp)}</td>
                  <td className="td-bright" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.model_version || '—'}
                  </td>
                  <td>{r.sample_count}</td>
                  <td>
                    <span className={`badge badge-${r.status || 'done'}`}>
                      <span className={`badge-dot ${r.status === 'processing' ? 'animate' : ''}`} />
                      {r.status || 'done'}
                    </span>
                  </td>
                  <td className="td-muted">
                    {r.total_cost_usd != null ? `$${(+r.total_cost_usd).toFixed(4)}` : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {r.report_id && (
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '4px 10px', fontSize: 11 }}
                          onClick={() => api.getReport(r.report_id).then(onLoadReport).catch(e => setErr(e.message))}
                        >
                          View
                        </button>
                      )}
                      <button
                        className="del-btn"
                        title="Delete report"
                        disabled={deleting.has(r.report_id)}
                        onClick={() => handleDelete(r.report_id)}
                      >
                        {deleting.has(r.report_id)
                          ? <div className="spinner spinner-sm" />
                          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        }
                      </button>
                    </div>
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
  const [err,   setErr]   = useState('');

  useEffect(() => {
    api.getUsage().then(r => setUsage(r)).catch(e => setErr(e.message));
  }, []);

  const slice = s => usage?.[s] || {};

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// billing & limits</div>
        <div className="page-title">API Usage</div>
      </div>
      {err && <div className="error-box">{err}</div>}
      {!usage ? (
        <div className="empty"><div className="spinner" style={{ margin: '0 auto 12px' }} /></div>
      ) : (
        <>
          {['today', 'month', 'overall'].map(period => (
            <div key={period} style={{ marginBottom: 22 }}>
              <div className="section-head">{period.charAt(0).toUpperCase() + period.slice(1)}</div>
              <div className="kpi-grid">
                <div className="kpi"><div className="kpi-label">Evaluations</div><div className="kpi-value">{slice(period).evaluations ?? slice(period).req_count ?? '—'}</div></div>
                <div className="kpi"><div className="kpi-label">Samples</div><div className="kpi-value">{slice(period).samples ?? slice(period).sample_count ?? '—'}</div></div>
                <div className="kpi"><div className="kpi-label">Tokens</div><div className="kpi-value">{(slice(period).total_tokens || 0).toLocaleString()}</div></div>
                <div className="kpi"><div className="kpi-label">Cost</div><div className="kpi-value">${(+(slice(period).total_cost_usd || 0)).toFixed(4)}</div></div>
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
  const [key,         setKeyLocal] = useState(getApiKey());
  const [saved,       setSaved]    = useState(false);
  const [healthState, setHealth]   = useState('idle'); // idle | checking | ok | fail
  const [healthMsg,   setHealthMsg] = useState('');

  function save() {
    setApiKey(key); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function checkHealth() {
    setHealth('checking'); setHealthMsg('');
    try {
      const h = await api.health();
      setHealth('ok');
      setHealthMsg(`v${h.version} · queue: ${h.queue?.queued_jobs ?? 0} jobs`);
    } catch (e) {
      setHealth('fail'); setHealthMsg(e.message);
    }
  }

  const healthDotClass = healthState === 'ok' ? 'health-ok' : healthState === 'fail' ? 'health-fail' : 'health-idle';

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-tag">// configuration</div>
        <div className="page-title">Settings</div>
      </div>

      <div className="card" style={{ maxWidth: 480, marginBottom: 14 }}>
        <div className="card-title">API Key</div>
        <div className="field">
          <label className="label">Your X-API-KEY</label>
          <PwInput value={key} onChange={e => setKeyLocal(e.target.value)} placeholder="client_key" autoComplete="off" />
        </div>
        <button className="btn btn-primary" onClick={save}>
          {saved ? '✓ Saved' : 'Save Key'}
        </button>
      </div>

      <div className="card" style={{ maxWidth: 480 }}>
        <div className="card-title">Backend</div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 12 }}>
          Connected to: <span style={{ color: 'var(--acid)' }}>{API_BASE}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button
            className="btn btn-ghost"
            onClick={checkHealth}
            disabled={healthState === 'checking'}
            style={{ fontSize: 11 }}
          >
            {healthState === 'checking' ? <><div className="spinner spinner-sm" /> Checking…</> : 'Ping backend'}
          </button>
          {healthState !== 'idle' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11 }}>
              <div className={`health-dot ${healthDotClass}`} />
              <span style={{ color: healthState === 'ok' ? 'var(--teal)' : 'var(--red)' }}>
                {healthState === 'ok' ? 'Online' : 'Offline'}
              </span>
              {healthMsg && <span style={{ color: 'var(--mute)' }}>· {healthMsg}</span>}
            </div>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--mute)' }}>
          Override with VITE_API_BASE_URL env variable on Vercel.
        </div>
      </div>
    </div>
  );
}

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV = [
  { key: 'break',    icon: '⚡', label: 'Break a Model', section: 'core' },
  { key: 'report',   icon: '📊', label: 'Last Report',   section: 'core' },
  { key: 'history',  icon: '🕑', label: 'History',       section: 'data' },
  { key: 'usage',    icon: '📈', label: 'API Usage',     section: 'data' },
  { key: 'settings', icon: '⚙',  label: 'Settings',      section: 'config' },
];

const BOTTOM_NAV = [
  { key: 'break',   icon: '⚡', label: 'Break'   },
  { key: 'report',  icon: '📊', label: 'Report'  },
  { key: 'history', icon: '🕑', label: 'History' },
  { key: 'usage',   icon: '📈', label: 'Usage'   },
  { key: 'settings',icon: '⚙',  label: 'Settings'},
];

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [page,        setPage]        = useState('break');
  const [report,      setReport]      = useState(null);
  const [apiKey,      setApiKeyState] = useState(getApiKey());
  const [running,     setRunning]     = useState(pollIsActive());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = pollSubscribe(ev => {
      if (ev.type === 'done')                            { setRunning(false); setReport(ev.report); }
      else if (ev.type === 'failed' || ev.type === 'timeout') { setRunning(false); }
      else if (ev.type === 'tick')                       { setRunning(true); }
    });
    return unsub;
  }, []);

  // Close sidebar on page change (mobile)
  function navigate(key) {
    setPage(key);
    setSidebarOpen(false);
  }

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

      {/* Mobile header */}
      <header className="mobile-header">
        <div className="mobile-logo">Breaker<span>Lab</span></div>
        <button
          className={`hamburger ${sidebarOpen ? 'open' : ''}`}
          onClick={() => setSidebarOpen(o => !o)}
        >
          <span /><span /><span />
        </button>
      </header>

      {/* Sidebar overlay (mobile) */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <div className="shell">
        <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="logo">
            <div className="logo-badge"><span className="logo-pulse" /> AI Breaker Lab</div>
            <div className="logo-name">Breaker Lab</div>
            <div className="logo-sub">Stress-test before production</div>
          </div>

          <nav className="nav">
            {sections.map(section => (
              <div key={section}>
                <div className="nav-group-label">{section}</div>
                {NAV.filter(n => n.section === section).map(n => (
                  <button
                    key={n.key}
                    className={`nav-btn ${page === n.key ? 'active' : ''}`}
                    onClick={() => navigate(n.key)}
                  >
                    <span className="nav-icon">{n.icon}</span>
                    {n.label}
                    {n.key === 'break' && running && (
                      <span className="nav-badge"><span className="nav-badge-dot" /> running</span>
                    )}
                    {n.key === 'report' && report && !running && (
                      <span className="nav-dot-acid" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="key-label">API Key</div>
            <SidebarKeyInput value={apiKey} onChange={e => handleApiKeyChange(e.target.value)} />
          </div>
        </aside>

        <main className="main">
          {page === 'break'    && <BreakPage onReportReady={handleReportReady} />}
          {page === 'report'   && <ReportPage report={report} />}
          {page === 'history'  && <HistoryPage onLoadReport={r => { setReport(r); setPage('report'); }} />}
          {page === 'usage'    && <UsagePage />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {BOTTOM_NAV.map(n => (
            <button
              key={n.key}
              className={`bottom-nav-btn ${page === n.key ? 'active' : ''}`}
              onClick={() => navigate(n.key)}
            >
              <span className="bnav-icon">{n.icon}</span>
              <span>{n.label}</span>
              {n.key === 'break' && running && <span className="bnav-badge" />}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}