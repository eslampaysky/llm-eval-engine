<<<<<<< HEAD
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowRight, Zap, Filter } from 'lucide-react';
import ScoreRing from '../../components/ScoreRing.jsx';

const MOCK_AUDITS = [
  { id: '1', url: 'myapp.vercel.app', tier: 'vibe', score: 83, date: 'Mar 18, 2026', findings: 3 },
  { id: '2', url: 'shop.example.com', tier: 'deep', score: 67, date: 'Mar 17, 2026', findings: 6 },
  { id: '3', url: 'dashboard.io', tier: 'fix', score: 91, date: 'Mar 15, 2026', findings: 1 },
  { id: '4', url: 'landing-page.dev', tier: 'vibe', score: 45, date: 'Mar 14, 2026', findings: 8 },
  { id: '5', url: 'api-docs.example.com', tier: 'deep', score: 78, date: 'Mar 12, 2026', findings: 4 },
];

const TIER_LABELS = { vibe: 'Vibe', deep: 'Deep', fix: 'Fix' };
const TIER_COLORS = { vibe: 'badge-blue', deep: 'badge-amber', fix: 'badge-green' };

export default function AuditsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = MOCK_AUDITS.filter((a) =>
    a.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">History</div>
        <h1 className="page-title">Audits</h1>
        <p className="page-subtitle">All your audit results in one place.</p>
      </div>

      {/* Search */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
      }}>
        <div style={{
          flex: 1, minWidth: 200, position: 'relative',
        }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)',
          }} />
          <input className="form-input" placeholder="Search by URL..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 36 }} />
        </div>
        <button className="btn btn-ghost">
          <Filter size={14} /> Filters
        </button>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Tier</th>
                <th>Score</th>
                <th>Date</th>
                <th>Findings</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((audit) => (
                <tr key={audit.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 13,
                      color: 'var(--text-primary)',
                      maxWidth: 200, display: 'inline-block',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={audit.url}>
                      {audit.url}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${TIER_COLORS[audit.tier]}`}>
                      {TIER_LABELS[audit.tier]}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ScoreRing score={audit.score} size={28} strokeWidth={3} showScore={false} />
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 13,
                        color: audit.score >= 80 ? 'var(--green)' : audit.score >= 50 ? 'var(--amber)' : 'var(--red)',
                      }}>
                        {audit.score}
                      </span>
                    </div>
                  </td>
                  <td>{audit.date}</td>
                  <td>{audit.findings}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Link to={`/app/audits/${audit.id}`} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
                        View
                      </Link>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
                        Re-run
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🔍</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            {searchQuery ? 'No results found' : 'No audits yet'}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            {searchQuery ? 'Try a different search term.' : 'Run your first audit to see results here.'}
          </p>
          {!searchQuery && (
            <Link to="/app/vibe-check" className="btn btn-primary">
              <Zap size={16} /> Run Your First Audit <ArrowRight size={16} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
=======
import { useNavigate } from 'react-router-dom';
import { HistoryPage as AuditsHistoryPage } from '../../App.jsx';

export default function AuditsPage() {
  const navigate = useNavigate();

  return <AuditsHistoryPage onLoadReport={(row) => navigate(`/app/audits/${row.report_id}`)} />;
>>>>>>> 952b221998466c82308faa3bf4986c92c664747d
}
