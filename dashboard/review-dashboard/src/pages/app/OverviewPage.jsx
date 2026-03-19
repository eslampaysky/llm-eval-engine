import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Bug, Globe, Zap, ArrowRight, TrendingUp, Loader } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../../App.jsx';
import StatCard from '../../components/StatCard.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';

export default function OverviewPage() {
  const [stats, setStats] = useState(null);
  const [latestAudit, setLatestAudit] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const audits = await apiFetch('/agentic-qa/history').catch(() => []);
        const list = Array.isArray(audits) ? audits : [];

        // Stats
        const thisWeek = list.filter((a) => {
          const d = new Date(a.created_at);
          const now = new Date();
          return now - d < 7 * 24 * 60 * 60 * 1000;
        });
        const scores = list.filter((a) => a.score != null).map((a) => Number(a.score));
        const avgScore = scores.length
          ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length)
          : 0;
        const bugsThisWeek = thisWeek.reduce((sum, a) => {
          const findings = a.findings_count ?? (a.findings ? a.findings.length : 0);
          return sum + findings;
        }, 0);

        // Unique monitored sites
        const uniqueSites = new Set(list.map((a) => a.url).filter(Boolean)).size;

        setStats({
          totalAudits: list.length,
          avgScore,
          bugsThisWeek,
          sitesMonitored: uniqueSites,
        });

        if (list.length > 0) setLatestAudit(list[0]);

        // Chart data — last 10 audits with scores, reversed to chronological
        const withScores = list
          .filter((a) => a.score != null && a.created_at)
          .slice(0, 10)
          .reverse();
        setChartData(
          withScores.map((a) => ({
            name: new Date(a.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            }),
            score: Number(a.score),
          }))
        );
      } catch (err) {
        console.error('Overview fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="page-container fade-in" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400,
      }}>
        <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Dashboard</div>
        <h1 className="page-title">Overview</h1>
        <p className="page-subtitle">Your reliability metrics at a glance.</p>
      </div>

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 28,
      }}>
        <StatCard label="Total Audits" value={stats?.totalAudits ?? 0} icon={<BarChart3 size={18} />} />
        <StatCard
          label="Avg Reliability"
          value={stats?.avgScore ?? 0}
          suffix="/100"
          icon={<TrendingUp size={18} />}
          color={
            (stats?.avgScore ?? 0) >= 70
              ? 'var(--green)'
              : (stats?.avgScore ?? 0) >= 50
              ? 'var(--amber)'
              : 'var(--red)'
          }
        />
        <StatCard
          label="Bugs This Week"
          value={stats?.bugsThisWeek ?? 0}
          icon={<Bug size={18} />}
          color={(stats?.bugsThisWeek ?? 0) > 0 ? 'var(--coral)' : 'var(--green)'}
        />
        <StatCard label="Sites Monitored" value={stats?.sitesMonitored ?? 0} icon={<Globe size={18} />} />
      </div>

      {/* Score trend chart */}
      {chartData.length > 1 && (
        <div className="card" style={{ padding: 24, marginBottom: 28 }}>
          <div className="card-label">Score Trend — Last 10 Audits</div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="name"
                  stroke="var(--text-dim)"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line)' }}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke="var(--text-dim)"
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  tickLine={false}
                  axisLine={{ stroke: 'var(--line)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-raised)',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    color: 'var(--text-primary)',
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--bg-deep)', strokeWidth: 2 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Bottom row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 16,
      }}>
        {/* Latest audit */}
        {latestAudit ? (
          <div className="card">
            <div className="card-label">Latest Audit</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <ScoreRing score={latestAudit.score ?? 0} size={72} />
              <div>
                <div style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  marginBottom: 4,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 200,
                }}>
                  {latestAudit.url || 'Unknown URL'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(latestAudit.created_at).toLocaleDateString()} · {(latestAudit.tier || 'vibe').replace(/^\w/, (c) => c.toUpperCase())}
                </div>
              </div>
            </div>
            <Link to={`/app/audits/${latestAudit.audit_id}`} style={{
              fontSize: 13, color: 'var(--accent)', fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              View Report <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="card">
            <div className="card-label">No audits yet</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Run your first Vibe Check to see results here.
            </p>
            <Link to="/app/vibe-check" className="btn btn-primary" style={{ justifyContent: 'center' }}>
              <Zap size={16} /> Start Vibe Check
            </Link>
          </div>
        )}

        {/* Quick actions */}
        <div className="card">
          <div className="card-label">Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Link to="/app/vibe-check" className="btn btn-primary" style={{ justifyContent: 'center' }}>
              <Zap size={16} /> Run New Audit
            </Link>
            <Link to="/app/audits" className="btn btn-ghost" style={{ justifyContent: 'center' }}>
              View All Audits
            </Link>
            <Link to="/app/monitoring" className="btn btn-ghost" style={{ justifyContent: 'center' }}>
              Set Up Monitoring
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
