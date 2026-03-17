import { useEffect, useMemo, useState } from 'react';
import { Plus, X, Loader } from 'lucide-react';
import { api } from '../../services/api';
import CopyButton from '../../components/CopyButton.jsx';
import ScoreRing from '../../components/ScoreRing.jsx';
import AuditStatusBadge from '../../components/AuditStatusBadge.jsx';

const STATUS_MAP = {
  pending: 'degraded',
  ready: 'healthy',
  regression: 'critical',
  ok: 'healthy',
  failed: 'critical',
};

const STATUS_LABELS = {
  pending: 'Pending',
  ready: 'Ready',
  regression: 'Regression',
  ok: 'OK',
  failed: 'Failed',
};

export default function MonitoringPage() {
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

  // Form state
  const [featureName, setFeatureName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('daily');
  const [alertWebhook, setAlertWebhook] = useState('');
  const [testInputs, setTestInputs] = useState('');
  const [target, setTarget] = useState({
    type: 'webhook', endpoint_url: '', headers: '',
    base_url: '', api_key: '', model_name: '',
    repo_id: '', api_token: '',
    chain_import_path: '', invoke_key: '',
  });

  async function loadMonitors() {
    setLoading(true);
    setError('');
    try {
      const data = await api.getMonitors();
      setMonitors(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load monitors');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadMonitors(); }, []);

  async function createMonitor() {
    if (!featureName.trim() || !description.trim()) return;
    const inputs = testInputs.split('\n').map(l => l.trim()).filter(Boolean);
    if (inputs.length < 3) { setError('Provide at least 3 test inputs.'); return; }

    let headers = null;
    if (target.headers.trim()) {
      try { headers = JSON.parse(target.headers); }
      catch { setError('Headers must be valid JSON.'); return; }
    }

    setCreating(true); setActionMsg(''); setError('');
    try {
      await api.createMonitor({
        feature_name: featureName.trim(),
        description: description.trim(),
        target: {
          type: target.type,
          base_url: target.base_url || undefined,
          api_key: target.api_key || undefined,
          model_name: target.model_name || undefined,
          repo_id: target.repo_id || undefined,
          api_token: target.api_token || undefined,
          endpoint_url: target.endpoint_url || undefined,
          headers: headers || undefined,
          chain_import_path: target.chain_import_path || undefined,
          invoke_key: target.invoke_key || undefined,
        },
        test_inputs: inputs,
        schedule,
        alert_webhook: alertWebhook.trim() || null,
      });
      setActionMsg('Monitor created. Capturing baseline...');
      setShowModal(false);
      await loadMonitors();
    } catch (err) {
      setError(err.message || 'Failed to create monitor');
    } finally {
      setCreating(false);
      setTimeout(() => setActionMsg(''), 2000);
    }
  }

  async function runCheck(monitorId) {
    setActionMsg(''); setError('');
    try {
      await api.runMonitorCheck(monitorId);
      setActionMsg('Regression check started.');
    } catch (err) {
      setError(err.message || 'Failed to start regression check');
    } finally {
      setTimeout(() => setActionMsg(''), 2000);
    }
  }

  const canCreate = useMemo(() => {
    if (!featureName.trim() || !description.trim() || creating) return false;
    if (target.type === 'openai') return !!target.base_url.trim() && !!target.model_name.trim();
    if (target.type === 'huggingface') return !!target.repo_id.trim();
    if (target.type === 'langchain') return !!target.chain_import_path.trim();
    if (target.type === 'webhook') return !!target.endpoint_url.trim();
    return false;
  }, [featureName, description, creating, target]);

  if (loading) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-eyebrow">Monitoring</div>
          <h1 className="page-title">Continuous Monitoring</h1>
          <p className="page-subtitle">Automatically re-tests your app on every deploy or schedule.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Create Monitor
        </button>
      </div>

      {error && (
        <div className="card" style={{
          padding: '12px 16px', marginBottom: 16,
          background: 'rgba(232, 89, 60, 0.08)', border: '1px solid rgba(232, 89, 60, 0.3)',
          color: 'var(--coral)', fontSize: 13, borderRadius: 'var(--radius-md)',
        }}>
          ⚠ {error}
        </div>
      )}
      {actionMsg && (
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--green)' }}>
          ✓ {actionMsg}
        </div>
      )}

      {/* Monitors list */}
      {monitors.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📡</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
            No monitors yet
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Create your first monitor to get continuous regression checks.
          </p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> Create Monitor
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {monitors.map((m) => {
            let baseline = null;
            if (m.baseline_json) try { baseline = JSON.parse(m.baseline_json); } catch {}
            const changedSamples = Array.isArray(m.changed_samples) ? m.changed_samples : [];
            const statusKey = m.last_status || 'pending';

            return (
              <div key={m.monitor_id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--text-primary)' }}>
                    {m.feature_name}
                  </div>
                  <AuditStatusBadge status={STATUS_MAP[statusKey] || 'degraded'} label={STATUS_LABELS[statusKey] || statusKey} />
                </div>

                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{m.description}</p>

                {baseline && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
                    Baseline: {baseline.captured_at || 'unknown'} · {baseline.samples?.length || 0} samples
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn btn-ghost" onClick={() => runCheck(m.monitor_id)} style={{ fontSize: 12 }}>
                    Run Regression Check
                  </button>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    ID: {m.monitor_id}
                  </span>
                </div>

                {changedSamples.length > 0 && (
                  <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                    {changedSamples.map((sample, idx) => (
                      <div key={idx} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{sample.change}</div>
                        {sample.fix && <CopyButton text={sample.fix} label="Copy Regression Fix" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                Create Monitor
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="form-label">Feature Name</label>
                <input className="form-input" placeholder="Checkout assistant" value={featureName} onChange={(e) => setFeatureName(e.target.value)} />
              </div>
              <div>
                <label className="form-label">Description</label>
                <textarea className="form-textarea" rows={3} placeholder="What this feature should do..." value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="form-label">Schedule</label>
                  <select className="form-select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
                    <option value="daily">Daily</option>
                    <option value="hourly">Hourly</option>
                    <option value="on_deploy">On deploy</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Alert Webhook</label>
                  <input className="form-input" placeholder="https://hooks.slack.com/..." value={alertWebhook} onChange={(e) => setAlertWebhook(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="form-label">Target Type</label>
                <select className="form-select" value={target.type} onChange={(e) => setTarget(p => ({ ...p, type: e.target.value }))}>
                  <option value="webhook">Webhook / REST API</option>
                  <option value="openai">OpenAI-compatible</option>
                  <option value="huggingface">HuggingFace</option>
                  <option value="langchain">LangChain</option>
                </select>
              </div>
              {target.type === 'webhook' && (
                <>
                  <div><label className="form-label">Endpoint URL</label><input className="form-input" placeholder="https://your-api.com/feature" value={target.endpoint_url} onChange={(e) => setTarget(p => ({ ...p, endpoint_url: e.target.value }))} /></div>
                  <div><label className="form-label">Headers (JSON)</label><textarea className="form-textarea" rows={2} placeholder='{"Authorization": "Bearer ..."}' value={target.headers} onChange={(e) => setTarget(p => ({ ...p, headers: e.target.value }))} /></div>
                </>
              )}
              {target.type === 'openai' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label className="form-label">Base URL</label><input className="form-input" placeholder="https://api.openai.com/v1" value={target.base_url} onChange={(e) => setTarget(p => ({ ...p, base_url: e.target.value }))} /></div>
                  <div><label className="form-label">Model</label><input className="form-input" placeholder="gpt-4o-mini" value={target.model_name} onChange={(e) => setTarget(p => ({ ...p, model_name: e.target.value }))} /></div>
                </div>
              )}
              <div>
                <label className="form-label">Test Inputs (one per line, min 3)</label>
                <textarea className="form-textarea" rows={4} placeholder="What is your refund policy?" value={testInputs} onChange={(e) => setTestInputs(e.target.value)} />
              </div>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={createMonitor} disabled={!canCreate}>
              {creating ? 'Creating...' : 'Create Monitor'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
