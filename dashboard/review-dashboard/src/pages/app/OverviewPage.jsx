import { Link } from 'react-router-dom';
import { BarChart3, Bug, Globe, Zap, ArrowRight, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import StatCard from '../../components/StatCard.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';

const MOCK_CHART_DATA = [
  { name: 'Mar 1', score: 72 },
  { name: 'Mar 3', score: 68 },
  { name: 'Mar 5', score: 75 },
  { name: 'Mar 7', score: 71 },
  { name: 'Mar 9', score: 78 },
  { name: 'Mar 11', score: 74 },
  { name: 'Mar 13', score: 82 },
  { name: 'Mar 15', score: 79 },
  { name: 'Mar 17', score: 85 },
  { name: 'Mar 18', score: 83 },
];

export default function OverviewPage() {
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
        <StatCard label="Total Audits" value={47} icon={<BarChart3 size={18} />} />
        <StatCard label="Avg Reliability" value={78} suffix="/100" icon={<TrendingUp size={18} />} color="var(--green)" />
        <StatCard label="Bugs Found This Week" value={12} icon={<Bug size={18} />} color="var(--coral)" />
        <StatCard label="Sites Monitored" value={3} icon={<Globe size={18} />} />
      </div>

      {/* Score trend chart */}
      <div className="card" style={{ padding: 24, marginBottom: 28 }}>
        <div className="card-label">Score Trend — Last 10 Audits</div>
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={MOCK_CHART_DATA}>
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

      {/* Bottom row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: 16,
      }}>
        {/* Latest audit */}
        <div className="card">
          <div className="card-label">Latest Audit</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <ScoreRing score={83} size={72} />
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--text-primary)',
                marginBottom: 4,
              }}>
                myapp.vercel.app
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Mar 18, 2026 · Vibe Check
              </div>
            </div>
          </div>
          <Link to="/app/audits" style={{
            fontSize: 13, color: 'var(--accent)', fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            View Report <ArrowRight size={14} />
          </Link>
        </div>

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
