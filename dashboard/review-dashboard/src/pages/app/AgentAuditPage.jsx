import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ArrowRight, Loader } from 'lucide-react';
import TierPill from '../../components/TierPill.jsx';
import { useAppShell } from '../../context/AppShellContext.jsx';
import { api } from '../../services/api';

export default function AgentAuditPage() {
  const navigate = useNavigate();
  const shell = useAppShell();
  const activeAudit = shell?.activeAudit ?? null;
  const beginAudit = shell?.beginAudit ?? (() => {});
  const hasActiveAudit = shell?.hasActiveAudit ?? false;
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('fix');
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function startAudit() {
    if (!url.trim()) return;
    if (hasActiveAudit) {
      setError('An audit is already running. Wait for it to finish before starting another.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await api.startAgenticQA({ url, tier });
      beginAudit({
        auditId: data.audit_id,
        url,
        tier,
        startedAt: Date.now(),
        hasSourceCode: Boolean(code.trim()),
      });
      navigate(`/app/audits/${data.audit_id}`);
    } catch (err) {
      setError(err.message || 'Failed to start audit');
      setLoading(false);
    }
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Fix & Verify</div>
        <h1 className="page-title">Agent Audit</h1>
        <p className="page-subtitle">AI-powered fixes with verification. Paste code for deeper analysis.</p>
      </div>

      {error && (
        <div className="card" style={{
          padding: '12px 16px', marginBottom: 20,
          background: 'rgba(232, 89, 60, 0.08)', border: '1px solid rgba(232, 89, 60, 0.3)',
          color: 'var(--coral)', fontSize: 13, borderRadius: 'var(--radius-md)',
        }}>
          ⚠ {error}
        </div>
      )}

      {hasActiveAudit && (
        <div className="card" style={{
          padding: '12px 16px', marginBottom: 20,
          background: 'rgba(59, 180, 255, 0.08)', border: '1px solid rgba(59, 180, 255, 0.2)',
          color: 'var(--text-primary)', fontSize: 13, borderRadius: 'var(--radius-md)',
        }}>
          An audit is already running for {activeAudit?.url || 'another URL'}. Finish it before starting a new Fix & Verify run.
        </div>
      )}

      {!loading && (
        <>
          <div className="card" style={{ padding: 32, marginBottom: 20 }}>
            <label className="form-label" style={{ marginBottom: 8 }}>URL to Audit</label>
            <input className="form-input form-input-lg" type="url" value={url}
              onChange={(e) => setUrl(e.target.value)} placeholder="https://your-app.vercel.app"
              style={{ marginBottom: 20 }} />
            <label className="form-label" style={{ marginBottom: 8 }}>Audit Tier</label>
            <TierPill selected={tier} onChange={setTier} />
          </div>

          {/* Code editor section */}
          <div className="card" style={{ padding: 0, marginBottom: 20, overflow: 'hidden' }}>
            <button
              onClick={() => setShowCode(!showCode)}
              style={{
                width: '100%', padding: '16px 24px', background: 'none', border: 'none',
                color: 'var(--text-primary)', fontSize: 14, fontWeight: 500,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: showCode ? '1px solid var(--line)' : 'none',
              }}
            >
              <span>Paste Source Code (optional)</span>
              {showCode ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showCode && (
              <div style={{ padding: 20 }}>
                <textarea
                  className="form-textarea"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste your component code here for deeper analysis..."
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    minHeight: 200, background: 'var(--bg-deepest)',
                  }}
                />
              </div>
            )}
          </div>

          <button className="btn btn-primary-lg" onClick={startAudit}
            disabled={!url.trim() || hasActiveAudit} style={{ width: '100%' }}>
            Run Fix & Verify Audit <ArrowRight size={18} />
          </button>
        </>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Starting Fix & Verify Audit...</div>
        </div>
      )}
    </div>
  );
}
