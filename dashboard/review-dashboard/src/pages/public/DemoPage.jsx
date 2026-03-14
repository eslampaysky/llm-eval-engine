import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { API_BASE, grade, overallScore } from '../../App.jsx';

const COUNTER_TARGETS = {
  models: 1847,
  failures: 23492,
  redFlags: 4201,
};

const STATUS_STEPS = [
  'Generating adversarial test cases...',
  'Testing hallucination resistance...',
  'Probing for prompt injection...',
  'Evaluating reasoning consistency...',
  'Compiling your report...',
];

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

function pctColor(pct) {
  if (pct >= 90) return '#f87171';
  if (pct >= 60) return '#fbbf24';
  return '#4ade80';
}

export default function DemoPage() {
  const [description, setDescription] = useState('');
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({
    progress_pct: 0,
    current_step: STATUS_STEPS[0],
    steps_done: 0,
    steps_total: 0,
    elapsed_seconds: 0,
  });
  const [statusIndex, setStatusIndex] = useState(0);
  const [shareMsg, setShareMsg] = useState('');
  const [counters, setCounters] = useState({ models: 0, failures: 0, redFlags: 0 });

  const progressTimer = useRef(null);
  const reportTimer = useRef(null);
  const statusTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (reportTimer.current) clearInterval(reportTimer.current);
      if (statusTimer.current) clearInterval(statusTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const start = performance.now();
    const duration = 1600;

    function tick(now) {
      if (!active) return;
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setCounters({
        models: Math.floor(COUNTER_TARGETS.models * eased),
        failures: Math.floor(COUNTER_TARGETS.failures * eased),
        redFlags: Math.floor(COUNTER_TARGETS.redFlags * eased),
      });
      if (t < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!running) return;
    statusTimer.current = setInterval(() => {
      setStatusIndex((idx) => (idx + 1) % STATUS_STEPS.length);
    }, 2200);
    return () => {
      if (statusTimer.current) clearInterval(statusTimer.current);
      statusTimer.current = null;
    };
  }, [running]);

  const statusMessage = progress.current_step || STATUS_STEPS[statusIndex];

  const derivedMetrics = useMemo(() => {
    const breakdown = report?.metrics?.breakdown_by_type || report?.metrics?.breakdown || report?.metrics?.test_type_breakdown || {};
    const hallucinations = breakdown?.Hallucination?.failures ?? breakdown?.Hallucination?.failed ?? null;
    const failures = Array.isArray(report?.metrics?.failed_rows) ? report.metrics.failed_rows.length : null;
    const adversarialScore = breakdown?.Adversarial?.avg_score ?? breakdown?.Adversarial?.average_score ?? report?.metrics?.adversarial_score ?? null;
    return { hallucinations, failures, adversarialScore };
  }, [report]);

  const score = overallScore(report || {});
  const letter = grade(score || 0);

  const runDemo = async () => {
    if (running) return;
    setError('');
    setReport(null);
    setRunning(true);
    setProgress({
      progress_pct: 0,
      current_step: STATUS_STEPS[0],
      steps_done: 0,
      steps_total: 20,
      elapsed_seconds: 0,
    });

    let reportId = null;

    try {
      const res = await fetch(`${API_BASE}/demo/break`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description.trim() || 'Customer support chatbot for an e-commerce platform',
          model_name: 'gemini-3-flash-preview',
          num_tests: 20,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || 'Demo request failed.');
      reportId = data.report_id;
      if (!reportId) throw new Error('No report id returned.');
    } catch (err) {
      setError(err?.message || 'Unable to start demo run.');
      setRunning(false);
      return;
    }

    const startedAt = Date.now();

    const pollProgress = async () => {
      try {
        const res = await fetch(`${API_BASE}/report/${encodeURIComponent(reportId)}/progress`);
        if (!res.ok) throw new Error('progress failed');
        const data = await res.json();
        if (data?.progress_pct != null) {
          setProgress({
            progress_pct: data.progress_pct,
            current_step: data.current_step || STATUS_STEPS[statusIndex],
            steps_done: data.steps_done ?? 0,
            steps_total: data.steps_total ?? 0,
            elapsed_seconds: data.elapsed_seconds ?? (Date.now() - startedAt) / 1000,
          });
        }
      } catch {
        setProgress((prev) => {
          const nextPct = Math.min(95, Math.max(prev.progress_pct, Math.min(95, prev.progress_pct + 4)));
          return {
            ...prev,
            progress_pct: nextPct,
            elapsed_seconds: (Date.now() - startedAt) / 1000,
          };
        });
      }
    };

    const pollReport = async () => {
      try {
        const res = await fetch(`${API_BASE}/demo/report/${encodeURIComponent(reportId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || 'Demo report failed.');
        if (data.status === 'done') {
          setReport(data);
          setRunning(false);
          setProgress((prev) => ({
            ...prev,
            progress_pct: 100,
            steps_done: prev.steps_total || data.sample_count || 0,
            current_step: 'Completed',
          }));
          if (progressTimer.current) clearInterval(progressTimer.current);
          if (reportTimer.current) clearInterval(reportTimer.current);
        }
        if (data.status === 'failed') {
          setError(data?.error || 'Demo run failed.');
          setRunning(false);
          if (progressTimer.current) clearInterval(progressTimer.current);
          if (reportTimer.current) clearInterval(reportTimer.current);
        }
      } catch (err) {
        setError(err?.message || 'Unable to fetch demo report.');
        setRunning(false);
        if (progressTimer.current) clearInterval(progressTimer.current);
        if (reportTimer.current) clearInterval(reportTimer.current);
      }
    };

    progressTimer.current = setInterval(pollProgress, 2000);
    reportTimer.current = setInterval(pollReport, 3000);
    pollProgress();
    pollReport();
  };

  const shareReport = async () => {
    if (!report?.report_id) return;
    const url = `${window.location.origin}/report/${report.report_id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('Copied link to clipboard.');
    } catch {
      setShareMsg('Copy failed.');
    }
    setTimeout(() => setShareMsg(''), 2500);
  };

  return (
    <section className="page fade-in" style={{ maxWidth: 1100, margin: '0 auto', paddingTop: 48, paddingBottom: 64 }}>
      <div className="card" style={{ padding: 28, marginBottom: 22 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: 24, alignItems: 'center' }}>
          <div>
            <div className="page-eyebrow">// public demo</div>
            <h1 className="page-title" style={{ fontSize: 40, lineHeight: 1.05, marginBottom: 10 }}>
              Is your AI agent production-ready?
            </h1>
            <div className="page-desc" style={{ fontSize: 16, maxWidth: 560 }}>
              Find out in 60 seconds. No signup required.
            </div>
          </div>
          <div className="card" style={{ margin: 0, padding: 18, background: 'var(--bg3)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.12em' }}>
              Live activity
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--hi)' }}>
                {formatNumber(counters.models)} models tested
              </div>
              <div style={{ fontSize: 13, color: 'var(--hi)' }}>
                {formatNumber(counters.failures)} failures caught
              </div>
              <div style={{ fontSize: 13, color: 'var(--hi)' }}>
                {formatNumber(counters.redFlags)} red flags found today
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 24, marginBottom: 22 }}>
        <div className="card-label">Describe your AI model or agent in one sentence</div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Customer support chatbot for an e-commerce platform"
          rows={3}
          style={{
            width: '100%',
            marginTop: 10,
            marginBottom: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--line2)',
            color: 'var(--text)',
            padding: 12,
            borderRadius: 'var(--r)',
            fontFamily: 'var(--sans)',
          }}
        />
        <button className="btn btn-primary" onClick={runDemo} disabled={running}>
          {running ? 'Running...' : 'Run Free Test'}
        </button>
        <div style={{ marginTop: 10, fontSize: 11, color: 'var(--mute)' }}>
          Takes ~30 seconds - 20 adversarial tests - Free forever
        </div>
        {error && (
          <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 11 }}>
            {error}
          </div>
        )}
      </div>

      {running && (
        <div className="card" style={{ padding: 22, marginBottom: 22 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>
            Live run progress
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--bg2)', overflow: 'hidden' }}>
            <div style={{
              width: `${progress.progress_pct || 0}%`,
              height: '100%',
              background: pctColor(progress.progress_pct || 0),
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ marginTop: 10, color: 'var(--hi)' }}>{statusMessage}</div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mute)' }}>
            Step {progress.steps_done || 0} of {progress.steps_total || 20} - {Math.round(progress.elapsed_seconds || 0)}s elapsed
          </div>
        </div>
      )}

      {!running && report && (
        <div className="card" style={{ padding: 26 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 260px)', gap: 24, alignItems: 'center' }}>
            <div>
              <div className="card-label">Your AI readiness score</div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
                <div style={{
                  width: 120,
                  height: 120,
                  borderRadius: '50%',
                  border: '2px solid var(--line2)',
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 36,
                  fontFamily: 'var(--display)',
                  color: 'var(--hi)',
                  background: 'var(--bg2)',
                }}>
                  {letter}
                </div>
                <div>
                  <div style={{ fontSize: 28, fontFamily: 'var(--display)' }}>{score.toFixed(1)} / 10</div>
                  <div style={{ fontSize: 12, color: 'var(--mid)' }}>Overall audit score</div>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="card" style={{ margin: 0, padding: 12, background: 'var(--bg3)' }}>
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>Hallucinations</div>
                <div style={{ fontSize: 20, color: 'var(--hi)' }}>
                  {derivedMetrics.hallucinations != null ? derivedMetrics.hallucinations : '--'}
                </div>
              </div>
              <div className="card" style={{ margin: 0, padding: 12, background: 'var(--bg3)' }}>
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>Failures</div>
                <div style={{ fontSize: 20, color: 'var(--hi)' }}>
                  {derivedMetrics.failures != null ? derivedMetrics.failures : '--'}
                </div>
              </div>
              <div className="card" style={{ margin: 0, padding: 12, background: 'var(--bg3)' }}>
                <div style={{ fontSize: 11, color: 'var(--mute)' }}>Adversarial Score</div>
                <div style={{ fontSize: 20, color: 'var(--hi)' }}>
                  {derivedMetrics.adversarialScore != null ? Number(derivedMetrics.adversarialScore).toFixed(1) : '--'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={shareReport}>Share This Report</button>
            <Link className="btn btn-primary" to="/auth/signup">Get Full Access</Link>
            {shareMsg && <span style={{ fontSize: 11, color: 'var(--accent)' }}>{shareMsg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
