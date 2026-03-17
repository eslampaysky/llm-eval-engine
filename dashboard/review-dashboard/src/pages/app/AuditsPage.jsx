import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ArrowRight, Zap, Filter, Loader } from 'lucide-react';
import { apiFetch } from '../../App.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';

const TIER_LABELS = { vibe: 'Vibe', deep: 'Deep', fix: 'Fix' };
const TIER_COLORS = { vibe: 'badge-blue', deep: 'badge-amber', fix: 'badge-green' };

export default function AuditsPage() {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch('/agentic-qa/history');
        setAudits(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load audits:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = audits.filter((a) =>
    (a.url || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">History</div>
        <h1 className="page-title">Audits</h1>
        <p className="page-subtitle">All your audit results in one place.</p>
      </div>

      {/* Search */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-dim)',
          }} />
          <input className="form-input" placeholder="Search by URL..."
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: 36 }} />
        </div>
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
              {filtered.map((audit) => {
                const score = audit.score ?? 0;
                const tier = audit.tier || 'vibe';
                const findingsCount = audit.findings_count ?? (audit.findings ? audit.findings.length : 0);
                const id = audit.audit_id || audit.report_id;
                return (
                  <tr key={id} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 13,
                        color: 'var(--text-primary)',
                        maxWidth: 200, display: 'inline-block',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={audit.url}>
                        {audit.url || 'Unknown'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${TIER_COLORS[tier] || 'badge-blue'}`}>
                        {TIER_LABELS[tier] || tier}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ScoreRing score={score} size={28} strokeWidth={3} showScore={false} />
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 13,
                          color: score >= 80 ? 'var(--green)' : score >= 50 ? 'var(--amber)' : 'var(--red)',
                        }}>
                          {score}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {audit.created_at ? new Date(audit.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>{findingsCount}</td>
                    <td>
                      <Link to={`/app/audits/${id}`} className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
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
}
