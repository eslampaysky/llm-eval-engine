import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../../App.jsx';

export default function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [latestAudit, setLatestAudit] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [audits] = await Promise.all([
          apiFetch('/agentic-qa/history').catch(() => []),
        ]);
        const list = Array.isArray(audits) ? audits : [];
        const thisWeek = list.filter((a) => {
          const d = new Date(a.created_at);
          const now = new Date();
          return now - d < 7 * 24 * 60 * 60 * 1000;
        });
        const scores = list.filter((a) => a.score != null).map((a) => Number(a.score));
        const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0;
        const bugsThisWeek = thisWeek.reduce((sum, a) => {
          const findings = a.findings_count ?? (a.findings ? a.findings.length : 0);
          return sum + findings;
        }, 0);

        setStats({
          totalAudits: list.length,
          avgScore,
          bugsThisWeek,
        });
        if (list.length > 0) setLatestAudit(list[0]);
      } catch (err) {
        console.error('Overview fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-eyebrow">Overview</div>
          <div className="page-title">Dashboard</div>
        </div>
        <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Overview</div>
        <div className="page-title">Dashboard</div>
        <div className="page-desc">Your app reliability at a glance.</div>
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Total Audits</div>
          <div className="kpi-value">{stats?.totalAudits ?? 0}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Avg Reliability Score</div>
          <div className="kpi-value" style={{ color: (stats?.avgScore ?? 0) >= 70 ? 'var(--green)' : (stats?.avgScore ?? 0) >= 50 ? '#fbbf24' : 'var(--red)' }}>
            {stats?.avgScore ?? 0}<span style={{ fontSize: 13, color: 'var(--mute)' }}>/100</span>
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Bugs This Week</div>
          <div className="kpi-value" style={{ color: (stats?.bugsThisWeek ?? 0) > 0 ? 'var(--red)' : 'var(--green)' }}>
            {stats?.bugsThisWeek ?? 0}
          </div>
        </div>
      </div>

      {latestAudit ? (
        <div className="card">
          <div className="card-label">Latest Audit</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--hi)', marginBottom: 4 }}>
                {latestAudit.url || 'Unknown URL'}
              </div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
                {latestAudit.tier?.toUpperCase() || 'VIBE'} · Score: {latestAudit.score ?? '—'}/100 · {new Date(latestAudit.created_at).toLocaleDateString()}
              </div>
            </div>
            <Link
              to={`/app/audits/${latestAudit.audit_id}`}
              className="btn btn-primary"
              style={{ textDecoration: 'none' }}
            >
              View Audit
            </Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-label">No audits yet</div>
          <div style={{ color: 'var(--mid)', fontSize: 13 }}>
            Run your first Vibe Check to see results here.
          </div>
          <Link to="/app/vibe-check" className="btn btn-primary" style={{ marginTop: 12, textDecoration: 'none' }}>
            Start Vibe Check
          </Link>
        </div>
      )}
    </div>
  );
}
