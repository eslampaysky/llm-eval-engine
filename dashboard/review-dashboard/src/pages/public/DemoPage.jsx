import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
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
        setStage(ev.stage ?? 0);
        setPct(ev.pct ?? 0);
        setActiveType(currentTestType(ev.stage ?? 0, ev.pct ?? 0));
        if ((ev.attempts || 0) % 5 === 0) {
          addLog(`Stage update: ${ev.attempts * 3}s elapsed.`, 'info');
        }
      }
    });

    return () => {
      mounted = false;
      unsub();
    };
  }, [addLog]);

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
            <Link className="btn btn-ghost" to={`/report/${report.report_id}`}>View Full Report</Link>
            <Link className="btn btn-primary" to="/auth/signup">Get Full Access</Link>
            {shareMsg && <span style={{ fontSize: 11, color: 'var(--accent)' }}>{shareMsg}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
