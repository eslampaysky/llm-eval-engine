import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import CopyButton from '../../components/CopyButton';
import ConfidenceBar from '../../components/ConfidenceBar';

const STATUS_MSGS = {
  pending: 'Pending',
  ready: 'Ready',
  regression: 'Regression detected',
  ok: 'OK',
  failed: 'Failed',
};

export default function MonitoringPage() {
  const [target, setTarget] = useState({
    type: 'webhook',
    base_url: '',
    api_key: '',
    model_name: '',
    repo_id: '',
    api_token: '',
    endpoint_url: '',
    headers: '',
    payload_template: '',
    chain_import_path: '',
    invoke_key: '',
  });
  const [featureName, setFeatureName] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState('daily');
  const [alertWebhook, setAlertWebhook] = useState('');
  const [testInputs, setTestInputs] = useState('');
  const [monitors, setMonitors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');

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

  useEffect(() => {
    loadMonitors();
  }, []);

  async function createMonitor() {
    if (!featureName.trim() || !description.trim()) return;

    const inputs = testInputs
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (inputs.length < 3) {
      setError('Provide at least 3 test inputs.');
      return;
    }

    let headers = null;
    if (target.headers.trim()) {
      try {
        headers = JSON.parse(target.headers);
      } catch {
        setError('Headers must be valid JSON.');
        return;
      }
    }

    const payload = {
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
        payload_template: target.payload_template || undefined,
        chain_import_path: target.chain_import_path || undefined,
        invoke_key: target.invoke_key || undefined,
      },
      test_inputs: inputs,
      schedule,
      alert_webhook: alertWebhook.trim() || null,
    };

    setCreating(true);
    setActionMsg('');
    setError('');
    try {
      await api.createMonitor(payload);
      setActionMsg('Monitor created. Capturing baseline...');
      await loadMonitors();
    } catch (err) {
      setError(err.message || 'Failed to create monitor');
    } finally {
      setCreating(false);
      setTimeout(() => setActionMsg(''), 2000);
    }
  }

  async function runCheck(monitorId) {
    setActionMsg('');
    setError('');
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
    if (!featureName.trim() || !description.trim()) return false;
    if (creating) return false;
    if (target.type === 'openai') return !!target.base_url.trim() && !!target.model_name.trim();
    if (target.type === 'huggingface') return !!target.repo_id.trim();
    if (target.type === 'langchain') return !!target.chain_import_path.trim();
    if (target.type === 'webhook') return !!target.endpoint_url.trim();
    return false;
  }, [featureName, description, creating, target]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app — monitoring</div>
        <div className="page-title">Continuous Monitoring</div>
        <div className="page-desc">
          Automatically re-tests your app every time you deploy.
        </div>
      </div>

      {error && <div className="err-box">! {error}</div>}
      {actionMsg && <div className="card" style={{ marginBottom: 16 }}>{actionMsg}</div>}

      <div className="card">
        <div className="card-label">Create monitor</div>
        <div className="field">
          <label className="label">Feature name</label>
          <input
            className="input"
            placeholder="Checkout assistant"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="What this feature should do and how success looks."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label className="label">Schedule</label>
            <select className="select" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
              <option value="on_deploy">On deploy</option>
            </select>
          </div>
          <div>
            <label className="label">Alert webhook (optional)</label>
            <input
              className="input"
              placeholder="https://hooks.slack.com/services/..."
              value={alertWebhook}
              onChange={(e) => setAlertWebhook(e.target.value)}
            />
          </div>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label className="label">Test inputs (one per line)</label>
          <textarea
            className="textarea"
            rows={4}
            placeholder="What is your refund policy?"
            value={testInputs}
            onChange={(e) => setTestInputs(e.target.value)}
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-label">Target config</div>
        <div className="field">
          <label className="label">Target type</label>
          <select
            className="select"
            value={target.type}
            onChange={(e) => setTarget((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="webhook">Webhook / REST API</option>
            <option value="openai">OpenAI-compatible</option>
            <option value="huggingface">HuggingFace</option>
            <option value="langchain">LangChain</option>
          </select>
        </div>

        {target.type === 'openai' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div><label className="label">Base URL</label><input className="input" placeholder="https://api.openai.com/v1" value={target.base_url} onChange={(e) => setTarget((prev) => ({ ...prev, base_url: e.target.value }))} /></div>
            <div><label className="label">API key</label><input className="input" placeholder="sk-..." value={target.api_key} onChange={(e) => setTarget((prev) => ({ ...prev, api_key: e.target.value }))} /></div>
            <div><label className="label">Model name</label><input className="input" placeholder="gpt-4o-mini" value={target.model_name} onChange={(e) => setTarget((prev) => ({ ...prev, model_name: e.target.value }))} /></div>
          </div>
        )}

        {target.type === 'huggingface' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><label className="label">Repo ID</label><input className="input" placeholder="meta-llama/Llama-3-8B-Instruct" value={target.repo_id} onChange={(e) => setTarget((prev) => ({ ...prev, repo_id: e.target.value }))} /></div>
            <div><label className="label">API token</label><input className="input" placeholder="hf_..." value={target.api_token} onChange={(e) => setTarget((prev) => ({ ...prev, api_token: e.target.value }))} /></div>
          </div>
        )}

        {target.type === 'langchain' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><label className="label">Chain import path</label><input className="input" placeholder="my_module.my_chain" value={target.chain_import_path} onChange={(e) => setTarget((prev) => ({ ...prev, chain_import_path: e.target.value }))} /></div>
            <div><label className="label">Invoke key</label><input className="input" placeholder="question" value={target.invoke_key} onChange={(e) => setTarget((prev) => ({ ...prev, invoke_key: e.target.value }))} /></div>
          </div>
        )}

        {target.type === 'webhook' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div><label className="label">Endpoint URL</label><input className="input" placeholder="https://your-api.com/feature" value={target.endpoint_url} onChange={(e) => setTarget((prev) => ({ ...prev, endpoint_url: e.target.value }))} /></div>
            <div><label className="label">Headers (JSON)</label><textarea className="textarea" rows={3} placeholder='{"Authorization": "Bearer ..."}' value={target.headers} onChange={(e) => setTarget((prev) => ({ ...prev, headers: e.target.value }))} /></div>
          </div>
        )}
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={createMonitor} disabled={!canCreate}>
          {creating ? 'Creating...' : 'Create Monitor ->'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-label">Existing monitors</div>
        {loading && <div style={{ color: 'var(--mid)' }}>Loading...</div>}
        {!loading && monitors.length === 0 && (
          <div style={{ color: 'var(--mid)' }}>No monitors yet.</div>
        )}
        {monitors.map((m) => {
          let baseline = null;
          if (m.baseline_json) {
            try { baseline = JSON.parse(m.baseline_json); } catch { baseline = null; }
          }
          const changedSamples = Array.isArray(m.changed_samples) ? m.changed_samples : [];
          return (
            <div key={m.monitor_id} className="card" style={{ marginTop: 10, border: '1px solid var(--line2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                <div style={{ fontWeight: 600 }}>{m.feature_name}</div>
                <div style={{ fontSize: 11, color: 'var(--mid)' }}>
                  {STATUS_MSGS[m.last_status] || m.last_status || 'pending'}
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>{m.description}</div>
              {baseline && (
                <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 8 }}>
                  Baseline: {baseline.captured_at || 'unknown'} - Samples: {baseline.samples?.length || 0}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={() => runCheck(m.monitor_id)}>
                  Run Regression Check
                </button>
                <div style={{ fontSize: 11, color: 'var(--mid)' }}>Monitor ID: {m.monitor_id}</div>
              </div>
              {changedSamples.map((sample, idx) => (
                <div key={idx} style={{ marginTop: 8, fontSize: 12, color: 'var(--mid)' }}>
                  <div style={{ marginBottom: 6 }}>{sample.change}</div>
                  {typeof sample.confidence === 'number' && (
                    <ConfidenceBar score={sample.confidence} subject="this feature" />
                  )}
                  <CopyButton text={sample.fix} label="Copy Regression Fix" />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
