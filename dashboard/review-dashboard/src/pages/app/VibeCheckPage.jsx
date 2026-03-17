import { useState, useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
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

const MOCK_FINDINGS = [
  { severity: 'critical', category: 'flow', title: 'Navigation dropdown not accessible on mobile', description: 'The hamburger menu toggle does not respond to touch events below 390px width.', fixPrompt: 'In your MobileNav component, replace onClick with onTouchStart or add touch-action: manipulation to the button CSS.' },
  { severity: 'warning', category: 'layout', title: 'Content overflows horizontally on small screens', fixPrompt: 'Add overflow-x: hidden to your main content wrapper and ensure all images have max-width: 100%.' },
  { severity: 'info', category: 'accessibility', title: '2 form inputs missing labels' },
];

export default function VibeCheckPage() {
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('vibe');
  const [phase, setPhase] = useState('input'); // input | loading | results
  const [currentStep, setCurrentStep] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const handleTierChange = (newTier) => {
    if (newTier !== 'vibe') {
      setShowUpgradeModal(true);
      return;
    }
    setTier(newTier);
  };

  const handleAudit = useCallback(() => {
    if (!url.trim()) return;
    setPhase('loading');
    setCurrentStep(0);

    for (let i = 1; i <= AUDIT_STEPS.length; i++) {
      setTimeout(() => {
        setCurrentStep(i);
        if (i === AUDIT_STEPS.length) {
          setTimeout(() => setPhase('results'), 600);
        }
      }, 1500 * i);
    }
  }, [url]);

  const allFixPrompts = MOCK_FINDINGS.filter(f => f.fixPrompt).map((f, i) => `${i + 1}. ${f.title}\n${f.fixPrompt}`).join('\n\n');

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Audit</div>
        <h1 className="page-title">Vibe Check</h1>
        <p className="page-subtitle">Paste a URL, get a reliability score in 60 seconds.</p>
      </div>

      {phase === 'input' && (
        <div className="card" style={{ padding: 32 }}>
          <label className="form-label" style={{ marginBottom: 8 }}>URL to Audit</label>
          <input
            className="form-input form-input-lg"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-app.vercel.app"
            style={{ marginBottom: 20 }}
          />

          <div style={{ marginBottom: 24 }}>
            <label className="form-label" style={{ marginBottom: 8 }}>Audit Tier</label>
            <TierPill selected={tier} onChange={handleTierChange} />
          </div>

          <button
            className="btn btn-primary-lg"
            onClick={handleAudit}
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
            <ScoreRing score={82} size={140} label="/100" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                Reliability Score: 82
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <span className="badge badge-green">Healthy</span>
                <span className="badge badge-blue">91% confident</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                1 critical issue, 1 warning, and 1 informational finding detected.
              </p>
            </div>
          </div>

          <div className="card-label" style={{ marginBottom: 12 }}>Findings ({MOCK_FINDINGS.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {MOCK_FINDINGS.map((f, i) => <FindingCard key={i} {...f} />)}
          </div>

          <CopyButton text={allFixPrompts} label="Copy All Fix Prompts" size="lg" />

          <div style={{ marginTop: 24 }}>
            <button className="btn btn-ghost" onClick={() => { setPhase('input'); setUrl(''); }}>
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
