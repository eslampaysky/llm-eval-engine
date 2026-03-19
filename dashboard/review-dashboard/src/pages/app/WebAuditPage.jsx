import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, GripVertical, Trash2, ArrowRight, Loader } from 'lucide-react';
import TierPill from '../../components/TierPill.jsx';
import { api } from '../../services/api';

const ACTIONS = ['Click', 'Fill', 'Expect text', 'Wait'];

export default function WebAuditPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('deep');
  const [steps, setSteps] = useState([{ action: 'Click', selector: '', value: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addStep = () => setSteps(prev => [...prev, { action: 'Click', selector: '', value: '' }]);
  const removeStep = (i) => setSteps(prev => prev.filter((_, idx) => idx !== i));
  const updateStep = (i, field, val) => setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));

  async function startAudit() {
    if (!url.trim()) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.startAgenticQA({ url, tier, journeys: steps });
      navigate(`/app/audits/${data.audit_id}`);
    } catch (err) {
      setError(err.message || 'Failed to start audit');
      setLoading(false);
    }
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Deep Dive</div>
        <h1 className="page-title">Web Audit</h1>
        <p className="page-subtitle">Full audit with user journey testing and video replay.</p>
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

          <button className="btn btn-primary-lg" onClick={startAudit}
            disabled={!url.trim() || loading} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
            Run Deep Dive Audit <ArrowRight size={18} />
          </button>
        </>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 }}>
          <Loader size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
          <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Starting Deep Dive Audit...</div>
        </div>
      )}
    </div>
  );
}
