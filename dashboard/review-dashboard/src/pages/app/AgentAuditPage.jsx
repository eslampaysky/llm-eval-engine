import { useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import CopyButton from '../../components/CopyButton';
import ConfidenceBar from '../../components/ConfidenceBar';

const STATUS_MSGS = {
  queued: 'Queued...',
  processing: 'Running scenarios...',
  done: 'Done!',
  failed: 'Failed',
};

const SEVERITY_COLOR = {
  critical: 'var(--red)',
  high: 'var(--red)',
  medium: 'var(--amber, #fbbf24)',
  low: 'var(--mid)',
};

const CATEGORY_OPTIONS = [
  { value: 'edge_case', label: 'Edge case' },
  { value: 'logic', label: 'Logic' },
  { value: 'hallucination', label: 'Hallucination' },
  { value: 'security', label: 'Security' },
  { value: 'reliability', label: 'Reliability' },
];

export default function AgentAuditPage() {
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
  const [description, setDescription] = useState('');
  const [numScenarios, setNumScenarios] = useState(10);
  const [categories, setCategories] = useState([]);
  const [auditId, setAuditId] = useState(null);
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    if (!description.trim()) return;
    setLoading(true);
    setResult(null);
    setStatusMsg('');
    setError('');

    let headers = null;
    if (target.headers.trim()) {
      try {
        headers = JSON.parse(target.headers);
      } catch {
        setLoading(false);
        setError('Headers must be valid JSON.');
        return;
      }
    }

    const payload = {
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
      description: description.trim(),
      num_scenarios: Number(numScenarios) || 10,
      categories: categories.length ? categories : undefined,
    };

    try {
      const data = await api.createAgentAudit(payload);
      setAuditId(data.audit_id);
      setStatusMsg(STATUS_MSGS.queued);
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Failed to start agent audit');
    }
  }

  useEffect(() => {
    if (!auditId) return undefined;
    const iv = setInterval(async () => {
      try {
        const [data, progressRes] = await Promise.all([
          api.getReport(auditId),
          fetch(`${api.baseUrl}/report/${encodeURIComponent(auditId)}/progress`, {
            headers: { 'X-API-KEY': api.getApiKey() },
          }).then((res) => (res.ok ? res.json() : null)),
        ]);
        setProgress(progressRes);
        setStatusMsg(STATUS_MSGS[data.status] || data.status || 'Processing...');
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(iv);
          setLoading(false);
          setResult(data);
        }
      } catch (err) {
        clearInterval(iv);
        setLoading(false);
        setError(err.message || 'Failed to load audit');
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [auditId]);

  const ThinkingLog = () => {
    if (!loading || !progress) return null;
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <style>{'@keyframes thinkingPulse { 0%{opacity:.35} 50%{opacity:1} 100%{opacity:.35} }'}</style>
        <div className="card-label">Run progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', animation: 'thinkingPulse 1.2s ease-in-out infinite' }} />
          {progress.current_step || 'Processing'}
        </div>
        <div style={{ height: 6, borderRadius: 999, background: 'var(--bg0)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progress.progress_pct || 0}%`,
              background: 'var(--accent)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 8 }}>
          Step {progress.steps_done || 0} of {progress.steps_total || 0} · {progress.elapsed_seconds || 0}s
        </div>
      </div>
    );
  };

  const metrics = result?.metrics || {};
  const results = Array.isArray(result?.results) ? result.results : [];

  const canSubmit = useMemo(() => {
    if (!description.trim()) return false;
    if (loading) return false;
    if (target.type === 'openai') return !!target.base_url.trim() && !!target.model_name.trim();
    if (target.type === 'huggingface') return !!target.repo_id.trim();
    if (target.type === 'langchain') return !!target.chain_import_path.trim();
    if (target.type === 'webhook') return !!target.endpoint_url.trim();
    return false;
  }, [description, loading, target]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app - agent audit</div>
        <div className="page-title">Agent & API Testing</div>
        <div className="page-desc">
          Generate adversarial scenarios and judge your agent or API before users find the bugs.
        </div>
      </div>

      {error && <div className="err-box">! {error}</div>}

      <div className="card">
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
            <div>
              <label className="label">Base URL</label>
              <input
                className="input"
                placeholder="https://api.openai.com/v1"
                value={target.base_url}
                onChange={(e) => setTarget((prev) => ({ ...prev, base_url: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">API key</label>
              <input
                className="input"
                placeholder="sk-..."
                value={target.api_key}
                onChange={(e) => setTarget((prev) => ({ ...prev, api_key: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Model name</label>
              <input
                className="input"
                placeholder="gpt-4o-mini"
                value={target.model_name}
                onChange={(e) => setTarget((prev) => ({ ...prev, model_name: e.target.value }))}
              />
            </div>
          </div>
        )}

        {target.type === 'huggingface' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="label">Repo ID</label>
              <input
                className="input"
                placeholder="meta-llama/Llama-3-8B-Instruct"
                value={target.repo_id}
                onChange={(e) => setTarget((prev) => ({ ...prev, repo_id: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">API token</label>
              <input
                className="input"
                placeholder="hf_..."
                value={target.api_token}
                onChange={(e) => setTarget((prev) => ({ ...prev, api_token: e.target.value }))}
              />
            </div>
          </div>
        )}

        {target.type === 'langchain' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="label">Chain import path</label>
              <input
                className="input"
                placeholder="my_module.my_chain"
                value={target.chain_import_path}
                onChange={(e) => setTarget((prev) => ({ ...prev, chain_import_path: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Invoke key</label>
              <input
                className="input"
                placeholder="question"
                value={target.invoke_key}
                onChange={(e) => setTarget((prev) => ({ ...prev, invoke_key: e.target.value }))}
              />
            </div>
          </div>
        )}

        {target.type === 'webhook' && (
          <div className="input-row" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div>
              <label className="label">Endpoint URL</label>
              <input
                className="input"
                placeholder="https://your-api.com/agent"
                value={target.endpoint_url}
                onChange={(e) => setTarget((prev) => ({ ...prev, endpoint_url: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Headers (JSON)</label>
              <textarea
                className="textarea"
                rows={3}
                placeholder='{"Authorization": "Bearer ..."}'
                value={target.headers}
                onChange={(e) => setTarget((prev) => ({ ...prev, headers: e.target.value }))}
              />
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-label">Audit details</div>
        <div className="field">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="What should this agent or API do?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="input-row" style={{ marginTop: 10, gridTemplateColumns: '1fr 1fr' }}>
          <div>
            <label className="label">Number of scenarios</label>
            <input
              className="input"
              type="number"
              min={3}
              max={30}
              value={numScenarios}
              onChange={(e) => setNumScenarios(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Categories</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {CATEGORY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className="btn btn-ghost"
                  style={{
                    fontSize: 11,
                    borderColor: categories.includes(opt.value) ? 'var(--accent)' : 'var(--line2)',
                    color: categories.includes(opt.value) ? 'var(--accent)' : 'var(--mid)',
                  }}
                  onClick={() => {
                    setCategories((prev) => (
                      prev.includes(opt.value)
                        ? prev.filter((v) => v !== opt.value)
                        : [...prev, opt.value]
                    ));
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={submit}
          disabled={!canSubmit}
        >
          {loading ? (statusMsg || 'Running...') : 'Run Agent Audit ->'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-label">Progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading && <div className="spinner" />}
          <div style={{ color: 'var(--mid)' }}>
            {statusMsg || (auditId ? 'Starting...' : 'Idle')}
          </div>
        </div>
      </div>
      <ThinkingLog />

      {result && result.status === 'done' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-label">Summary</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--mid)' }}>Pass rate</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.pass_rate ?? 0}%</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--mid)' }}>Total</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.total ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--mid)' }}>Failures</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.failed ?? 0}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--mid)' }}>Critical</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{metrics.critical_failures ?? 0}</div>
            </div>
          </div>
        </div>
      )}

      {result && result.status === 'done' && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-label">Scenario results</div>
          {results.length === 0 && <div style={{ color: 'var(--mid)' }}>No scenarios returned.</div>}
          {results.map((row, i) => {
            const verdict = row.verdict || {};
            const severity = verdict.severity || 'low';
            return (
              <div
                key={i}
                className="card"
                style={{
                  marginBottom: 8,
                  borderLeft: `4px solid ${SEVERITY_COLOR[severity] || 'var(--mid)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 10,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: SEVERITY_COLOR[severity] || 'var(--mid)',
                    }}
                  >
                    {severity}
                  </span>
                  <div style={{ fontWeight: 600 }}>{row.name || `Scenario ${i + 1}`}</div>
                  <div style={{ color: 'var(--mid)', fontSize: 11 }}>{row.category}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--mid)', margin: '4px 0 10px' }}>
                  {verdict.finding || verdict.detail || 'No verdict detail returned.'}
                </div>
                {typeof verdict.confidence === 'number' && (
                  <ConfidenceBar score={verdict.confidence} subject={row.name || `Scenario ${i + 1}`} />
                )}
                <CopyButton text={verdict.fix} label="Copy Fix Prompt" />
                {verdict.fix && (
                  <div style={{ fontSize: 12, color: 'var(--mid)', whiteSpace: 'pre-wrap' }}>
                    Fix: {verdict.fix}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
