import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtDate, grade, overallScore } from '../../App.jsx';

export default function DashboardPage() {
  const [runs, setRuns] = useState([]);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.getReports(), api.getUsage()])
      .then(([nextRuns, nextUsage]) => {
        setRuns(nextRuns || []);
        setUsage(nextUsage || null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const latestRun = runs[0] || null;
  let latestScore = 0;
  if (latestRun?.metrics_json) {
    try {
      latestScore = overallScore({ metrics: JSON.parse(latestRun.metrics_json) });
    } catch {}
  }

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
        </>
      )}
    </div>
  );
}
