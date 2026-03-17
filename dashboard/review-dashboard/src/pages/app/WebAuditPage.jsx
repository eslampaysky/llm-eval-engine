import { useState } from 'react';
import { Plus, GripVertical, Trash2, ArrowRight } from 'lucide-react';
import TierPill from '../../components/TierPill.jsx';
import LoadingSteps from '../../components/LoadingSteps.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';

const ACTIONS = ['Click', 'Fill', 'Expect text', 'Wait'];

export default function WebAuditPage() {
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('deep');
  const [steps, setSteps] = useState([{ action: 'Click', selector: '', value: '' }]);
  const [phase, setPhase] = useState('input');

  const addStep = () => setSteps(prev => [...prev, { action: 'Click', selector: '', value: '' }]);
  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));
  const updateStep = (i, field, val) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Deep Dive</div>
        <h1 className="page-title">Web Audit</h1>
        <p className="page-subtitle">Full audit with user journey testing and video replay.</p>
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

          {/* Journey builder */}
          <div className="card" style={{ padding: 28, marginBottom: 20 }}>
            <div className="card-label">User Journey Builder</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              Define the steps AiBreaker should walk through on your app.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {steps.map((step, i) => (
                <div key={i} style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 140px 1fr 1fr 32px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--line)',
                }}>
                  <GripVertical size={14} style={{ color: 'var(--text-dim)', cursor: 'grab' }} />
                  <select className="form-select" value={step.action}
                    onChange={(e) => updateStep(i, 'action', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: 12 }}>
                    {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                  <input className="form-input" placeholder="CSS selector"
                    value={step.selector} onChange={(e) => updateStep(i, 'selector', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: 12 }} />
                  <input className="form-input" placeholder="Value"
                    value={step.value} onChange={(e) => updateStep(i, 'value', e.target.value)}
                    style={{ padding: '8px 10px', fontSize: 12 }} />
                  <button onClick={() => removeStep(i)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button className="btn btn-ghost" onClick={addStep} style={{ fontSize: 12 }}>
              <Plus size={14} /> Add Step
            </button>
          </div>

          <button className="btn btn-primary-lg" onClick={() => setPhase('loading')}
            disabled={!url.trim()} style={{ width: '100%' }}>
            Run Deep Dive Audit <ArrowRight size={18} />
          </button>
        </>
      )}

      {phase === 'loading' && (
        <LoadingSteps
          steps={[
            { label: 'Launching browser...' },
            { label: 'Running user journey...' },
            { label: 'Crawling pages — desktop + mobile...' },
            { label: 'Recording video session...' },
            { label: 'AI analysis in progress...' },
          ]}
          currentStep={2}
        />
      )}

      {phase === 'results' && (
        <div className="slide-up">
          <div className="card" style={{ padding: 32, display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <ScoreRing score={74} size={120} label="/100" />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                Deep Dive Complete
              </div>
              <span className="badge badge-amber">Needs Work</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
