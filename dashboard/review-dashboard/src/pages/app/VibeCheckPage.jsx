import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Loader } from 'lucide-react';
import { api } from '../../services/api';
import TierPill from '../../components/TierPill.jsx';
import LoadingSteps from '../../components/LoadingSteps.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

const AUDIT_STEPS = [
  { label: 'Launching browser...' },
  { label: 'Crawling pages — desktop + mobile...' },
  { label: 'Capturing screenshots...' },
  { label: 'Sending to AI vision model...' },
  { label: 'Generating fix prompts...' },
];

export default function VibeCheckPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('vibe');
  const [auditId, setAuditId] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const pollRef = useRef(null);
  const stepRef = useRef(null);

  const handleTierChange = (newTier) => {
    if (newTier !== 'vibe') {
      setShowUpgradeModal(true);
      return;
    }
    setTier(newTier);
  };

  async function startAudit() {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setError('');
    setCurrentStep(0);

    // Start step animation
    let step = 0;
    stepRef.current = setInterval(() => {
      step = Math.min(step + 1, AUDIT_STEPS.length - 1);
      setCurrentStep(step);
    }, 3000);

    try {
      const data = await api.startAgenticQA({ url, tier });
      setAuditId(data.audit_id);
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Failed to start audit');
      clearInterval(stepRef.current);
    }
  }

  // Poll for results
  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.getAgenticQAStatus(auditId);
        if (cancelled) return;
        if (data.status === 'done') {
          clearInterval(stepRef.current);
          setCurrentStep(AUDIT_STEPS.length);
          setTimeout(() => {
            setResult(data);
            setLoading(false);
          }, 600);
        } else if (data.status === 'failed') {
          clearInterval(stepRef.current);
          setLoading(false);
          setError('Audit failed. Please try again.');
        } else {
          pollRef.current = setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) pollRef.current = setTimeout(poll, 4000);
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [auditId]);

  const findings = result?.findings || [];
  const score = result?.score ?? 0;

  const phase = result ? 'results' : loading ? 'loading' : 'input';

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Audit</div>
        <h1 className="page-title">Vibe Check</h1>
        <p className="page-subtitle">Paste a URL, get a reliability score in 60 seconds.</p>
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

      {phase === 'input' && (
        <div className="card" style={{ padding: 32 }}>
          <label className="form-label" style={{ marginBottom: 8 }}>URL to Audit</label>
          <input
            className="form-input form-input-lg"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startAudit()}
            placeholder="https://your-app.vercel.app"
            style={{ marginBottom: 20 }}
          />

          <div style={{ marginBottom: 24 }}>
            <label className="form-label" style={{ marginBottom: 8 }}>Audit Tier</label>
            <TierPill selected={tier} onChange={handleTierChange} />
          </div>

          <button
            className="btn btn-primary-lg"
            onClick={startAudit}
            disabled={!url.trim()}
            style={{ width: '100%' }}
          >
            Run Audit <ArrowRight size={18} />
          </button>
        </div>
      )}

      {phase === 'loading' && (
        <div className="slide-up">
          <LoadingSteps steps={AUDIT_STEPS} currentStep={currentStep} done={currentStep >= AUDIT_STEPS.length} />
        </div>
      )}

      {phase === 'results' && (
        <div className="slide-up">
          <div className="card" style={{
            padding: 32, marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.06), rgba(59, 180, 255, 0.04))',
            borderColor: 'rgba(52, 211, 153, 0.15)',
            display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
          }}>
            <ScoreRing score={score} size={140} label="/100" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Reliability Score: {score}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className={`badge ${score >= 80 ? 'badge-green' : score >= 50 ? 'badge-amber' : 'badge-red'}`}>
                  {score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Work' : 'Critical'}
                </span>
                {result?.confidence != null && (
                  <span className="badge badge-blue">{result.confidence}% confident</span>
                )}
              </div>
              {result?.summary && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{result.summary}</p>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                {result?.url} · {tier.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Bundled fix prompt */}
          {result?.bundled_fix_prompt && (
            <div style={{ marginBottom: 24 }}>
              <CopyButton text={result.bundled_fix_prompt} label="Copy All Fix Prompts" size="lg" />
            </div>
          )}

          {/* Findings */}
          <div className="card-label" style={{ marginBottom: 12 }}>Findings ({findings.length})</div>
          {findings.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No issues found — your app looks great!</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {findings.map((f, i) => (
                <FindingCard
                  key={i}
                  severity={f.severity || 'info'}
                  category={f.category}
                  title={f.title}
                  description={f.description}
                  fixPrompt={f.fix_prompt}
                />
              ))}
            </div>
          )}

          <div style={{ marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => {
              setResult(null); setAuditId(null); setUrl(''); setError('');
            }}>
              Run Another Audit
            </button>
          </div>
        </div>
      )}

      {/* Upgrade modal */}
      {showUpgradeModal && (
        <div className="modal-overlay" onClick={() => setShowUpgradeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Upgrade to unlock {tier === 'deep' ? 'Deep Dive' : 'Fix & Verify'}
            </h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
              This tier requires a paid plan. Upgrade to access video replay, journey testing, and more.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/pricing" className="btn btn-primary">View Plans</a>
              <button className="btn btn-ghost" onClick={() => setShowUpgradeModal(false)}>Maybe Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
