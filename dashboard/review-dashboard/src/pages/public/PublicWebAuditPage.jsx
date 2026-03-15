import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../services/api';

const HEALTH_COLOR = {
  good: 'var(--green)',
  warning: 'var(--amber, #fbbf24)',
  critical: 'var(--red)',
};

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

export default function PublicWebAuditPage() {
  const { token } = useParams();
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');
    api.getPublicWebAudit(token)
      .then((data) => {
        if (!active) return;
        setReport(data);
        setStatus('done');
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Report not found.');
        setStatus('error');
      });
    return () => { active = false; };
  }, [token]);

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (status !== 'done' || !report) {
    return (
      <div className="page">
        <div className="empty">
          {error || 'Report not available.'}
        </div>
      </div>
    );
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// public</div>
        <div className="page-title">Audited by AiBreaker</div>
        <div className="page-desc">Read-only AI site audit report.</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-label">Audit summary</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 18, color: HEALTH_COLOR[report.health] }}>
            {String(report.health || '').toUpperCase()}
          </span>
          <span style={{ color: 'var(--mid)', fontSize: 13 }}>
            {report.confidence}% confidence
          </span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>
          {report.url} · {formatDate(report.created_at)}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{report.summary}</div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-label">Issues</div>
        {(report.issues || []).length === 0 && (
          <div style={{ color: 'var(--mid)' }}>No issues listed.</div>
        )}
        {(report.issues || []).map((issue, idx) => (
          <div key={idx} className="card" style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{issue.title}</div>
            <div style={{ fontSize: 12, color: 'var(--mid)' }}>{issue.detail}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div className="card-label">Get your free audit</div>
          <div style={{ fontSize: 12, color: 'var(--mid)' }}>
            Run your own AI site audit in under 60 seconds.
          </div>
        </div>
        <a className="btn btn-primary" href="/auth/signup">
          Get your free AI site audit ->
        </a>
      </div>
    </div>
  );
}
