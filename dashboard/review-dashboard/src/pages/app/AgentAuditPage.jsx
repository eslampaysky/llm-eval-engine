import { useState } from 'react';
import { ChevronDown, ChevronUp, ArrowRight, RotateCcw } from 'lucide-react';
import TierPill from '../../components/TierPill.jsx';
import LoadingSteps from '../../components/LoadingSteps.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

export default function AgentAuditPage() {
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('fix');
  const [showCode, setShowCode] = useState(false);
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState('input');

  const bundledFix = `// Bundled Fix Prompt for your app
// Paste this into your AI builder (Cursor, Bolt, etc.)

1. Fix the checkout button z-index issue on mobile:
   In CheckoutForm, add position: relative; z-index: 10;

2. Add email validation before createUser():
   if (!email || !email.includes('@')) {
     setError('Please enter a valid email');
     return;
   }

3. Fix hero headline overflow:
   Add word-wrap: break-word; max-width: 100%;`;

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Fix & Verify</div>
        <h1 className="page-title">Agent Audit</h1>
        <p className="page-subtitle">AI-powered fixes with verification. Paste code for deeper analysis.</p>
      </div>

      {phase === 'input' && (
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

          <button className="btn btn-primary-lg" onClick={() => setPhase('loading')}
            disabled={!url.trim()} style={{ width: '100%' }}>
            Run Fix & Verify Audit <ArrowRight size={18} />
          </button>
        </>
      )}

      {phase === 'loading' && (
        <LoadingSteps
          steps={[
            { label: 'Launching browser...' },
            { label: 'Analyzing source code...' },
            { label: 'Running visual audit...' },
            { label: 'Generating AI fixes...' },
            { label: 'Preparing verification plan...' },
          ]}
          currentStep={3}
        />
      )}

      {phase === 'results' && (
        <div className="slide-up">
          {/* Bundled fix at top */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))',
            border: '2px solid rgba(59, 180, 255, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            marginBottom: 24,
          }}>
            <div className="card-label" style={{ color: 'var(--accent)' }}>Bundled Fix Prompt</div>
            <pre style={{
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)',
              lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 16,
            }}>
              {bundledFix}
            </pre>
            <CopyButton text={bundledFix} label="Copy Bundled Fix" size="lg" />
          </div>

          <div className="card" style={{
            padding: 32, marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap',
          }}>
            <ScoreRing score={67} size={120} label="/100" />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                Fix & Verify Complete
              </div>
              <span className="badge badge-amber">Needs Work</span>
            </div>
          </div>

          <div className="card-label" style={{ marginBottom: 12 }}>Findings</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <FindingCard severity="critical" category="flow" title="Checkout button unreachable on mobile"
              description="Button behind footer on small screens." fixPrompt="Add: position: relative; z-index: 10;" />
            <FindingCard severity="warning" category="logic" title="Form accepts empty emails"
              fixPrompt="Add email validation before createUser()" />
          </div>

          <button className="btn btn-primary" onClick={() => setPhase('input')}>
            <RotateCcw size={16} /> Re-run to Verify Fixes
          </button>
        </div>
      )}
    </div>
  );
}
