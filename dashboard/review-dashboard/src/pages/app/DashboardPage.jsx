import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, grade, overallScore } from '../../App.jsx';

export default function DashboardPage() {
  const [runs, setRuns] = useState([]);
  const [usage, setUsage] = useState(null);
  const [targetsCount, setTargetsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try {
      return localStorage.getItem('abl_onboarding_dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [ciSetupDone, setCiSetupDone] = useState(() => {
    try {
      return localStorage.getItem('abl_ci_setup_done') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    Promise.all([api.getReports(), api.getUsage()])
      .then(([nextRuns, nextUsage]) => {
        setRuns(nextRuns || []);
        setUsage(nextUsage || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    api.getTargets()
      .then((targets) => setTargetsCount(Array.isArray(targets) ? targets.length : 0))
      .catch(() => setTargetsCount(0));
  }, []);

  const latestRun = runs[0] || null;
  let latestScore = 0;
  if (latestRun?.metrics_json) {
    try {
      latestScore = overallScore({ metrics: JSON.parse(latestRun.metrics_json) });
    } catch {}
  }

  const setupTargetsDone = targetsCount > 0;
  const setupRunDone = runs.length > 0;
  const setupCiDone = ciSetupDone;
  const allSetupDone = setupTargetsDone && setupRunDone && setupCiDone;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app · dashboard</div>
        <div className="page-title">Dashboard</div>
        <div className="page-desc">High-level status across your latest break runs and current usage.</div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}
      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
        <>
          {!onboardingDismissed && !allSetupDone && (
            <div className="card" style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hi)', marginBottom: 6 }}>
                    Get started with AI Breaker
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 12 }}>
                    Complete these steps to finish your setup.
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <Link
                      className="btn btn-ghost"
                      to="/app/targets"
                      style={{ justifyContent: 'flex-start', gap: 10, width: '100%' }}
                    >
                      <span style={{ width: 18, textAlign: 'center', color: setupTargetsDone ? 'var(--accent2)' : 'var(--mid)' }}>
                        {setupTargetsDone ? '✓' : '○'}
                      </span>
                      <span style={{ color: setupTargetsDone ? 'var(--mid)' : 'var(--hi)' }}>Add your first target model</span>
                    </Link>

                    <Link
                      className="btn btn-ghost"
                      to="/app/playground"
                      style={{ justifyContent: 'flex-start', gap: 10, width: '100%' }}
                    >
                      <span style={{ width: 18, textAlign: 'center', color: setupRunDone ? 'var(--accent2)' : 'var(--mid)' }}>
                        {setupRunDone ? '✓' : '○'}
                      </span>
                      <span style={{ color: setupRunDone ? 'var(--mid)' : 'var(--hi)' }}>Run your first evaluation</span>
                    </Link>

                    <Link
                      className="btn btn-ghost"
                      to="/docs"
                      onClick={() => {
                        try {
                          localStorage.setItem('abl_ci_setup_done', '1');
                        } catch {}
                        setCiSetupDone(true);
                      }}
                      style={{ justifyContent: 'flex-start', gap: 10, width: '100%' }}
                    >
                      <span style={{ width: 18, textAlign: 'center', color: setupCiDone ? 'var(--accent2)' : 'var(--mid)' }}>
                        {setupCiDone ? '✓' : '○'}
                      </span>
                      <span style={{ color: setupCiDone ? 'var(--mid)' : 'var(--hi)' }}>Set up CI integration</span>
                    </Link>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    try {
                      localStorage.setItem('abl_onboarding_dismissed', '1');
                    } catch {}
                    setOnboardingDismissed(true);
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <div className="kpi-row">
            <div className="kpi"><div className="kpi-label">Total runs</div><div className="kpi-value">{runs.length}</div></div>
            <div className="kpi"><div className="kpi-label">Latest grade</div><div className="kpi-value">{latestRun ? grade(latestScore) : '—'}</div></div>
            <div className="kpi"><div className="kpi-label">Today requests</div><div className="kpi-value">{usage?.today?.req_count ?? 0}</div></div>
            <div className="kpi"><div className="kpi-label">Month samples</div><div className="kpi-value">{usage?.month?.sample_count ?? 0}</div></div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 14 }}>
            <div className="card">
              <div className="card-label">Latest run</div>
              {latestRun ? (
                <>
                  <div style={{ fontSize: 18, color: 'var(--hi)', fontWeight: 600, marginBottom: 6 }}>{latestRun.model_version || latestRun.report_id}</div>
                  <div style={{ color: 'var(--mid)', marginBottom: 14 }}>Completed {fmtDate(latestRun.created_at)} · {latestRun.sample_count ?? 0} tests</div>
                  <Link className="btn btn-primary" to={`/app/runs/${latestRun.report_id}`}>Open run detail</Link>
                </>
              ) : (
                <div style={{ color: 'var(--mid)' }}>No runs yet. Start with the playground to generate your first report.</div>
              )}
            </div>

            <div className="card">
              <div className="card-label">Quick actions</div>
              <div style={{ display: 'grid', gap: 8 }}>
                <Link className="btn btn-ghost" to="/app/playground">Launch playground</Link>
                <Link className="btn btn-ghost" to="/app/compare">Compare recent runs</Link>
                <Link className="btn btn-ghost" to="/app/targets">Browse targets</Link>
              </div>
            </div>
          </div>

          {runs.length === 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <div className="card" style={{ width: '100%', maxWidth: 720, textAlign: 'center' }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--hi)', marginBottom: 6 }}>
                  Run your first evaluation
                </div>
                <div style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 14 }}>
                  Point AI Breaker at any LLM and get a scored adversarial report in minutes.
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link className="btn btn-primary" to="/app/playground">Open Playground</Link>
                  <Link className="btn btn-ghost" to="/docs">Read the Docs</Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
