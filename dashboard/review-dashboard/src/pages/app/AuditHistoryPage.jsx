import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';

const TYPE_COLOR = {
  web_audit: 'var(--blue)',
  agent_audit: '#a855f7',
  monitor_check: '#14b8a6',
};

const HEALTH_COLOR = {
  good: 'var(--green)',
  warning: 'var(--amber, #fbbf24)',
  critical: 'var(--red)',
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function AuditHistoryPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getAuditHistory()
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message || 'Failed to load audit history'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// data · audit history</div>
        <div className="page-title">Audit History</div>
        <div className="page-desc">All web audits and monitor checks in one timeline.</div>
      </div>
      {error && <div className="err-box">! {error}</div>}
      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
        rows.length === 0 ? (
          <div className="empty">
            No audits yet. <a href="/app/web-audit">Start with a Web Audit -></a>
          </div>
        ) : (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Title</th>
                    <th>Status</th>
                    <th>Health</th>
                    <th>Issues</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.type}-${row.id}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => row.detail_url && navigate(row.detail_url)}
                    >
                      <td>
                        <span style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 3,
                          color: TYPE_COLOR[row.type] || 'var(--mid)',
                          border: `1px solid ${TYPE_COLOR[row.type] || 'var(--line2)'}`,
                        }}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text)' }}>{row.title}</td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          color: row.status === 'done' ? 'var(--accent2)' : row.status === 'failed' ? 'var(--red)' : 'var(--accent)',
                          background: row.status === 'done' ? 'rgba(61,220,151,.1)' : row.status === 'failed' ? 'rgba(255,92,114,.1)' : 'rgba(240,165,0,.1)',
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontFamily: 'var(--mono)',
                          fontSize: 10,
                          color: HEALTH_COLOR[row.health] || 'var(--mid)',
                          background: 'rgba(255,255,255,0.05)',
                          padding: '2px 6px',
                          borderRadius: 3,
                        }}
                        >
                          {row.health || '—'}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--mono)' }}>{row.issues_count ?? 0}</td>
                      <td>{fmtDate(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
