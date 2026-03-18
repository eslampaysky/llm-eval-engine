import { useEffect, useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowRight, Loader, Zap, ChevronDown, ChevronUp, Key } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { useAppShell } from '../../context/AppShellContext.jsx';
import TierPill from '../../components/TierPill.jsx';
import LoadingSteps from '../../components/LoadingSteps.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';
import { api } from '../../services/api';

const AUDIT_STEPS = [
  { label: 'Launching browser...' },
  { label: 'Crawling pages — desktop + mobile...' },
  { label: 'Capturing screenshots...' },
  { label: 'Sending to AI vision model...' },
  { label: 'Generating fix prompts...' },
];

/* ── Quota Exhaustion Banner ─────────────────────────────────────────────── */

function QuotaBanner({ hasUserKey }) {
  const [expanded, setExpanded] = useState(false);

  if (hasUserKey) {
    return (
      <div style={{
        padding: '14px 20px', marginBottom: 20, borderRadius: 'var(--radius-md)',
        background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)',
        color: '#d97706', fontSize: 13, lineHeight: 1.6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} />
          <span>
            <strong>Your Gemini API key's daily quota is exhausted.</strong>{' '}
            Full analysis will resume when it resets — usually within 24 hours.
            Basic technical audit shown below.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      padding: '14px 20px', marginBottom: 20, borderRadius: 'var(--radius-md)',
      background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)',
      color: '#d97706', fontSize: 13, lineHeight: 1.6,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
        <Zap size={16} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <strong>AI visual analysis is temporarily rate-limited.</strong>{' '}
          Showing basic technical audit only.
          <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Get full analysis instantly: connect your free Gemini API key in Settings — takes 2 minutes.
            </span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              to="/app/settings/workspace"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                background: '#d97706', color: '#fff', fontSize: 12, fontWeight: 600,
                textDecoration: 'none', whiteSpace: 'nowrap',
              }}
            >
              <Key size={14} /> Connect API Key
            </Link>
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                background: 'transparent', border: '1px solid rgba(245, 158, 11, 0.3)',
                color: '#d97706', fontSize: 12, cursor: 'pointer',
              }}
            >
              Learn More {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
          {expanded && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
              background: 'rgba(245, 158, 11, 0.04)', fontSize: 12,
              color: 'var(--text-secondary)', lineHeight: 1.7,
            }}>
              AI Breaker uses Google's Gemini Vision API to analyze screenshots. All free-tier users
              share a limited pool of API keys. When this shared quota runs out, we can only show
              automated technical checks until the quota resets.
              <br /><br />
              By connecting your own free Gemini API key (from{' '}
              <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer"
                style={{ color: '#d97706', textDecoration: 'underline' }}>
                aistudio.google.com
              </a>), you get your own dedicated quota — no more waiting.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────────────────────────── */

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
  const [hasUserKey, setHasUserKey] = useState(false);
  const stepRef = useRef(null);

  const shell = useAppShell();
  const activeAudit = shell?.activeAudit ?? null;
  const auditComplete = shell?.auditComplete ?? null;
  const clearAuditComplete = shell?.clearAuditComplete ?? (() => {});

  // Check if user has their own Gemini key
  useEffect(() => {
    api.getGeminiKeyStatus().then((d) => setHasUserKey(d?.has_key || false)).catch(() => {});
  }, []);

  const { user } = useAuth();
  const isAdmin = user?.is_admin || false;

  const handleTierChange = (newTier) => {
    if (newTier !== 'vibe' && !isAdmin) {
      setShowUpgradeModal(true);
      return;
    }
    setTier(newTier);
  };

  // Resume display if there's an active audit (returned from another page)
  useEffect(() => {
    if (activeAudit && !auditId && !result) {
      setAuditId(activeAudit.auditId);
      setLoading(true);
      setCurrentStep(2); // show mid-progress
    }
  }, [activeAudit]);

  // When global polling finishes, show results
  useEffect(() => {
    if (auditComplete && auditComplete.audit_id === auditId) {
      clearInterval(stepRef.current);
      setCurrentStep(AUDIT_STEPS.length);
      setTimeout(() => {
        setResult(auditComplete);
        setLoading(false);
      }, 600);
    }
  }, [auditComplete, auditId]);

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
      console.log('Starting audit with tier:', tier);
      const data = await api.startAgenticQA({ url, tier });
      setAuditId(data.audit_id);
      // Save to localStorage for global polling (survives tab switches)
      localStorage.setItem('abl_active_audit', JSON.stringify({
        auditId: data.audit_id,
        url,
        tier,
        startedAt: Date.now(),
      }));
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Failed to start audit');
      clearInterval(stepRef.current);
    }
  }

  // Poll for results via global context — but also keep a local fallback
  // in case the user stays on this page
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
          // Clear localStorage since we're handling it here
          localStorage.removeItem('abl_active_audit');
          setTimeout(() => {
            setResult(data);
            setLoading(false);
          }, 600);
        } else if (data.status === 'failed') {
          clearInterval(stepRef.current);
          setLoading(false);
          setError('Audit failed. Please try again.');
          localStorage.removeItem('abl_active_audit');
        } else {
          if (!cancelled) setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 4000);
      }
    }
    poll();
    // Do NOT cancel polling on unmount — let global context handle it
    return () => { cancelled = true; };
  }, [auditId]);

  const findings = result?.findings || [];
  const score = result?.score;
  const confidence = result?.confidence;
  const analysisLimited = result?.analysis_limited || false;

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
          {/* Quota exhaustion banner */}
          {analysisLimited && <QuotaBanner hasUserKey={hasUserKey} />}

          <div className="card" style={{
            padding: 32, marginBottom: 24,
            background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.06), rgba(59, 180, 255, 0.04))',
            borderColor: 'rgba(52, 211, 153, 0.15)',
            display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
          }}>
            {/* Only show ScoreRing when AI analysis was available */}
            {score != null && <ScoreRing score={score} size={140} label="/100" />}
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                {score != null ? `Reliability Score: ${score}` : 'Technical Audit'}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                {score != null && (
                  <span className={`badge ${score >= 80 ? 'badge-green' : score >= 50 ? 'badge-amber' : 'badge-red'}`}>
                    {score >= 80 ? 'Healthy' : score >= 50 ? 'Needs Work' : 'Critical'}
                  </span>
                )}
                {confidence != null && (
                  <span className="badge badge-blue">{confidence}% confident</span>
                )}
                {analysisLimited && (
                  <span className="badge badge-amber">Basic Audit</span>
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
