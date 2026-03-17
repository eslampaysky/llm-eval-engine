import { useState } from 'react';
import { Plus, X, ExternalLink, TrendingUp, TrendingDown } from 'lucide-react';
import ScoreRing from '../../components/ScoreRing.jsx';
import AuditStatusBadge from '../../components/AuditStatusBadge.jsx';

const MOCK_SITES = [
  { url: 'myapp.vercel.app', score: 83, trend: 'up', lastChecked: '2 hours ago', status: 'healthy' },
  { url: 'shop.example.com', score: 67, trend: 'down', lastChecked: '4 hours ago', status: 'degraded' },
  { url: 'dashboard.io', score: 91, trend: 'up', lastChecked: '1 hour ago', status: 'healthy' },
];

export default function MonitoringPage() {
  const [showModal, setShowModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [frequency, setFrequency] = useState('daily');

  return (
    <div className="page-container fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-eyebrow">Monitoring</div>
          <h1 className="page-title">Monitored Sites</h1>
          <p className="page-subtitle">Get alerted when reliability drops.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add Site
        </button>
      </div>

      {MOCK_SITES.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: 16,
        }}>
          {MOCK_SITES.map((site) => (
            <div key={site.url} className="card" style={{
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {site.url} <ExternalLink size={12} style={{ color: 'var(--text-dim)' }} />
                </div>
                <AuditStatusBadge status={site.status} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ScoreRing score={site.score} size={56} strokeWidth={4} />
                <div style={{ flex: 1 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    fontFamily: 'var(--font-mono)', fontSize: 13,
                    color: site.trend === 'up' ? 'var(--green)' : 'var(--coral)',
                  }}>
                    {site.trend === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {site.trend === 'up' ? '+3 pts' : '-5 pts'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Last checked {site.lastChecked}
                  </div>
                </div>
              </div>

              <a href="#" style={{
                fontSize: 13, color: 'var(--accent)', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                View Last Report →
              </a>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📡</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            No sites monitored yet
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Add your first site to get alerted when reliability drops.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Add Site
          </button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                Add Monitored Site
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">URL</label>
              <input className="form-input" type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://your-app.vercel.app" />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Check Frequency</label>
              <select className="form-select" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="deploy">On every deploy</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label className="form-label">Slack Webhook (optional)</label>
              <input className="form-input" placeholder="https://hooks.slack.com/..." />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Email (optional)</label>
              <input className="form-input" type="email" placeholder="alerts@company.com" />
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowModal(false)}>
              Add Site
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
