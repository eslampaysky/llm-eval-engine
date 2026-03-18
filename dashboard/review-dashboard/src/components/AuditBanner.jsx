import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader, CheckCircle, ArrowRight, X } from 'lucide-react';
import { useAppShell } from '../context/AppShellContext.jsx';

export default function AuditBanner() {
  const shell = useAppShell();
  if (!shell) return null;
  const { activeAudit, auditComplete, clearAuditComplete } = shell;
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed when a new audit completes
  useEffect(() => {
    if (auditComplete) setDismissed(false);
  }, [auditComplete]);

  // Show "in progress" banner
  if (activeAudit && !auditComplete) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 20px',
        background: 'linear-gradient(90deg, rgba(59, 180, 255, 0.08), rgba(38, 240, 185, 0.06))',
        borderBottom: '1px solid rgba(59, 180, 255, 0.15)',
        fontSize: 13,
        color: 'var(--text-primary)',
      }}>
        <Loader size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)', flexShrink: 0 }} />
        <span>
          Audit in progress{activeAudit.url ? ` for ${activeAudit.url}` : ''}…
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {activeAudit.tier?.toUpperCase() || 'VIBE'}
        </span>
      </div>
    );
  }

  // Show "completed" toast
  if (auditComplete && !dismissed) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 20px',
        background: 'linear-gradient(90deg, rgba(52, 211, 153, 0.1), rgba(59, 180, 255, 0.06))',
        borderBottom: '1px solid rgba(52, 211, 153, 0.2)',
        fontSize: 13,
        color: 'var(--text-primary)',
      }}>
        <CheckCircle size={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>Your audit is ready!</span>
        <Link
          to={`/app/audits/${auditComplete.audit_id}`}
          onClick={() => { clearAuditComplete(); setDismissed(true); }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: 'var(--accent)',
            fontWeight: 500,
            textDecoration: 'none',
            fontSize: 13,
          }}
        >
          View results <ArrowRight size={12} />
        </Link>
        <button
          onClick={() => { clearAuditComplete(); setDismissed(true); }}
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
}
