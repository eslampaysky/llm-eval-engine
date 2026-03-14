import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  API_BASE,
  api,
  currentTestType,
  grade,
  LiveProgress,
  ls,
  overallScore,
  pollStart,
  pollSub,
  ts,
} from '../../App.jsx';

const COUNTER_TARGETS = {
  models: 1847,
  failures: 23492,
  redFlags: 4201,
};

const DEFAULT_DESCRIPTION = 'Customer support chatbot for an e-commerce platform';

function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

function stageFromProgress(pct) {
  const safe = Math.max(0, Math.min(100, Number(pct) || 0));
  if (safe < 10) return 0;
  if (safe < 30) return 1;
  if (safe < 70) return 2;
  if (safe < 90) return 3;
  return 4;
}

export default function DemoPage() {
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [stage, setStage] = useState(0);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [report, setReport] = useState(null);
  const [logs, setLogs] = useState([]);
  const [runId, setRunId] = useState(ls.get('abl_demo_active_run_id'));
  const [activeType, setActiveType] = useState(currentTestType(0, 0));
  const [progressLive, setProgressLive] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [counters, setCounters] = useState({ models: 0, failures: 0, redFlags: 0 });
  const logRef = useRef(null);

  const addLog = useCallback((msg, type = 'info') => {
    setLogs((p) => [...p, { msg, type, t: ts() }]);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 40);
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
    let mounted = true;

    async function reattachIfStillProcessing() {
      const savedId = ls.get('abl_demo_active_run_id');
      if (!savedId) return;
      try {
        const savedReport = await api.getDemoReport(savedId);
        if (!mounted) return;
        if (savedReport?.status === 'processing') {
          setPolling(true);
          setRunId(savedId);
          pollStart(savedId, savedReport.sample_count || 20, api.getDemoReport, 'demo');
          addLog('Resumed demo run after refresh.', 'info');
        } else if (savedReport?.status === 'done') {
          setReport(savedReport);
          setPolling(false);
          ls.set('abl_demo_active_run_id', null);
        } else {
          ls.set('abl_demo_active_run_id', null);
        }
      } catch {
        ls.set('abl_demo_active_run_id', null);
      }
    }

    reattachIfStillProcessing();

    const unsub = pollSub((ev) => {
      if (ev.mode !== 'demo') return;
      if (ev.type === 'done') {
        setPolling(false);
        setPct(100);
        ls.set('abl_demo_active_run_id', null);
        addLog(`Demo complete - ${ev.report.results?.length || ev.report.sample_count || 0} tests completed.`, 'ok');
        setTimeout(() => setReport(ev.report), 200);
      } else if (ev.type === 'failed') {
        setPolling(false);
        ls.set('abl_demo_active_run_id', null);
        setError(ev.error || 'Demo run failed.');
        addLog(`Failed: ${ev.error}`, 'err');
      } else if (ev.type === 'timeout') {
        setPolling(false);
        ls.set('abl_demo_active_run_id', null);
        setError('Timed out after 7 minutes.');
        addLog('Timed out.', 'err');
      } else if (ev.type === 'error') {
        addLog(`Poll error: ${ev.error}`, 'err');
      } else if (ev.type === 'tick') {
        if (!progressLive) {
          setStage(ev.stage ?? 0);
          setPct(ev.pct ?? 0);
          setActiveType(currentTestType(ev.stage ?? 0, ev.pct ?? 0));
          if ((ev.attempts || 0) % 5 === 0) {
            addLog(`Stage update: ${ev.attempts * 3}s elapsed.`, 'info');
          }
        }
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [addLog]);

  useEffect(() => {
    if (!polling || !runId) return undefined;
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/report/${encodeURIComponent(runId)}/progress`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        const pctValue = Number(data?.progress_pct ?? 0);
        setProgressLive(true);
        setPct(pctValue);
        setStage(stageFromProgress(pctValue));
        if (data?.current_step) {
          setActiveType(data.current_step);
        }
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [polling, runId]);

  const derivedMetrics = useMemo(() => {
    const breakdown = report?.metrics?.breakdown_by_type || report?.metrics?.breakdown || report?.metrics?.test_type_breakdown || {};
    const hallucinations = report?.metrics?.hallucinations_detected
      ?? breakdown?.hallucination?.failures
      ?? breakdown?.hallucination?.failed
      ?? null;
    const failures = Array.isArray(report?.metrics?.failed_rows)
      ? report.metrics.failed_rows.length
      : null;
    const adversarialScore = breakdown?.adversarial?.avg_score
      ?? breakdown?.adversarial?.average_score
      ?? report?.metrics?.adversarial_score
      ?? null;
    return { hallucinations, failures, adversarialScore };
  }, [report]);

  const score = overallScore(report || {});
  const letter = grade(score || 0);

  async function handleSubmit() {
    if (loading || polling) return;
    setError('');
    setReport(null);
    setLogs([]);
    setStage(0);
    setPct(0);
    setActiveType(currentTestType(0, 0));
    setProgressLive(false);
    setLoading(true);

    try {
      addLog('Submitting public demo request...', 'info');
      const res = await api.demoBreak({
        description: description.trim() || DEFAULT_DESCRIPTION,
        model_name: 'gemini-3-flash-preview',
        num_tests: 20,
      });
      addLog(`Job queued - ID: ${res.report_id}`, 'ok');
      addLog('Generating adversarial tests...', 'info');
      setRunId(res.report_id);
      ls.set('abl_demo_active_run_id', res.report_id);
      setPolling(true);
      pollStart(res.report_id, res.num_tests || 20, api.getDemoReport, 'demo');
    } catch (e) {
      setError(e.message || 'Unable to start demo run.');
      addLog(`Failed: ${e.message || 'unknown error'}`, 'err');
    } finally {
      setLoading(false);
    }
  }

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
        <button className="btn btn-primary" onClick={handleSubmit} disabled={loading || polling}>
          {loading || polling ? 'Running...' : 'Run Free Test'}
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

      {polling && (
        <LiveProgress
          stage={stage}
          pct={pct}
          logs={logs}
          logRef={logRef}
          done={false}
          reportId={runId}
          activeType={activeType}
        />
      )}

      {!polling && report && (
        <>
          <div
            className="card"
            style={{
              padding: 28,
              background: 'linear-gradient(135deg, rgba(59,180,255,0.12), rgba(38,240,185,0.08))',
              borderColor: 'rgba(59,180,255,0.25)',
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 280px)', gap: 24, alignItems: 'center' }}>
              <div>
                <div className="card-label">Your AI readiness score</div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
                  <div style={{
                    width: 128,
                    height: 128,
                    borderRadius: '50%',
                    border: '2px solid rgba(59,180,255,0.45)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 40,
                    fontFamily: 'var(--display)',
                    color: 'var(--hi)',
                    background: 'radial-gradient(circle at 30% 30%, rgba(59,180,255,0.22), rgba(17,21,32,0.9))',
                    boxShadow: '0 0 0 4px rgba(59,180,255,0.1)',
                  }}>
                    {letter}
                  </div>
                  <div>
                    <div style={{ fontSize: 30, fontFamily: 'var(--display)' }}>{score.toFixed(1)} / 10</div>
                    <div style={{ fontSize: 12, color: 'var(--mid)' }}>Overall audit score</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div className="card" style={{ margin: 0, padding: 12, background: 'rgba(17,21,32,0.9)', borderColor: 'rgba(59,180,255,0.2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>Hallucinations</div>
                  <div style={{ fontSize: 20, color: 'var(--hi)' }}>
                    {derivedMetrics.hallucinations != null ? derivedMetrics.hallucinations : '--'}
                  </div>
                </div>
                <div className="card" style={{ margin: 0, padding: 12, background: 'rgba(17,21,32,0.9)', borderColor: 'rgba(255,92,114,0.25)' }}>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>Failures</div>
                  <div style={{ fontSize: 20, color: 'var(--hi)' }}>
                    {derivedMetrics.failures != null ? derivedMetrics.failures : '--'}
                  </div>
                </div>
                <div className="card" style={{ margin: 0, padding: 12, background: 'rgba(17,21,32,0.9)', borderColor: 'rgba(38,240,185,0.25)' }}>
                  <div style={{ fontSize: 11, color: 'var(--mute)' }}>Adversarial Score</div>
                  <div style={{ fontSize: 20, color: 'var(--hi)' }}>
                    {derivedMetrics.adversarialScore != null ? Number(derivedMetrics.adversarialScore).toFixed(1) : '--'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={shareReport}>Share This Report</button>
              <Link className="btn btn-ghost" to={`/report/${report.report_id}`}>View Full Report</Link>
              <Link className="btn btn-primary" to="/auth/signup">Get Full Access</Link>
              {shareMsg && <span style={{ fontSize: 11, color: 'var(--accent)' }}>{shareMsg}</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="card" style={{ padding: 18 }}>
              <div className="card-label">Explore plans</div>
              <div style={{ color: 'var(--mid)', marginBottom: 12 }}>
                See Pro and Enterprise options, billing, and feature comparison.
              </div>
              <Link className="btn btn-ghost" to="/pricing">View Pricing</Link>
            </div>
            <div className="card" style={{ padding: 18, borderColor: 'rgba(38,240,185,0.4)', background: 'rgba(38,240,185,0.08)' }}>
              <div className="card-label">Get Full Access</div>
              <div style={{ color: 'var(--mid)', marginBottom: 12 }}>
                Unlock unlimited runs, agentic evals, and export-ready audit reports.
              </div>
              <Link className="btn btn-primary" to="/auth/signup">Get Full Access</Link>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
