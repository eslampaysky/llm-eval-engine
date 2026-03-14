import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../App.jsx';

const DEFAULT_TASK = 'Book a flight from Cairo to London for next Tuesday';

function buildParamMap(raw) {
  const params = (raw || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return params.reduce((acc, key) => {
    acc[key] = null;
    return acc;
  }, {});
}

function scoreColor(score) {
  if (score >= 7) return 'var(--accent2)';
  if (score >= 4) return '#f0a500';
  return '#ff4d6d';
}

function makeId() {
  return `scn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AgenticPage() {
  const [target, setTarget] = useState({
    type: 'openai',
    base_url: '',
    api_key: '',
    model_name: '',
    repo_id: '',
    api_token: '',
    endpoint_url: '',
    payload_template: '{"input":"{question}"}',
    chain_import_path: '',
    invoke_key: 'question',
  });
  const [savedTargets, setSavedTargets] = useState([]);
  const [showSavedTargets, setShowSavedTargets] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');
  const [task, setTask] = useState(DEFAULT_TASK);
  const [expectedTools, setExpectedTools] = useState([{ name: '', requiredParams: '' }]);
  const [trapTools, setTrapTools] = useState([{ name: '', description: '' }]);
  const [scenarios, setScenarios] = useState([]);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [reportId, setReportId] = useState(null);

  const pollTimer = useRef(null);
  const localTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      if (localTimer.current) clearInterval(localTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    apiFetch('/targets')
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data) && data.length > 0) {
          setSavedTargets(data);
          setShowSavedTargets(true);
        } else {
          setShowSavedTargets(false);
        }
      })
      .catch(() => {
        if (active) setShowSavedTargets(false);
      });
    return () => { active = false; };
  }, []);

  function resetManualTarget() {
    setSelectedTargetId('');
    setTarget({
      type: 'openai',
      base_url: '',
      api_key: '',
      model_name: '',
      repo_id: '',
      api_token: '',
      endpoint_url: '',
      payload_template: '{"input":"{question}"}',
      chain_import_path: '',
      invoke_key: 'question',
    });
  }

  function applySavedTarget(saved) {
    if (!saved) return;
    setTarget((prev) => ({
      ...prev,
      type: saved.target_type || 'openai',
      base_url: saved.base_url || '',
      model_name: saved.model_name || '',
      repo_id: saved.repo_id || '',
      endpoint_url: saved.endpoint_url || '',
      payload_template: saved.payload_template || prev.payload_template,
      chain_import_path: saved.chain_import_path || '',
      invoke_key: saved.invoke_key || 'question',
      api_key: '',
      api_token: '',
    }));
  }

  function addLog(message) {
    const stamp = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs((prev) => [...prev, `[${stamp}] ${message}`]);
  }

  function handleAddScenario() {
    if (!task.trim()) {
      setError('Task description is required.');
      return;
    }
    const expected = expectedTools
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        required_params: buildParamMap(row.requiredParams),
      }));
    const traps = trapTools
      .filter((row) => row.name.trim())
      .map((row) => ({
        name: row.name.trim(),
        description: row.description.trim(),
      }));

    setScenarios((prev) => [
      ...prev,
      {
        id: makeId(),
        task: task.trim(),
        expected_tool_calls: expected,
        expected_outcome: '',
        trap_tools: traps,
      },
    ]);
    setError('');
  }

  function resetLogs() {
    setLogs([]);
    addLog('Queued agentic evaluation.');
  }

  function startLocalTicker() {
    if (localTimer.current) clearInterval(localTimer.current);
    localTimer.current = setInterval(() => {
      addLog('Evaluating scenarios...');
    }, 3000);
  }

  async function handleRun() {
    if (running) return;
    const targetType = target.type || 'openai';
    if (targetType === 'openai' && (!target.base_url.trim() || !target.model_name.trim())) {
      setError('Base URL and model name are required.');
      return;
    }
    if (targetType === 'huggingface' && !target.repo_id.trim()) {
      setError('Repo ID is required.');
      return;
    }
    if (targetType === 'webhook' && (!target.endpoint_url.trim() || !target.payload_template.trim())) {
      setError('Endpoint URL and payload template are required.');
      return;
    }
    if (targetType === 'langchain' && !target.chain_import_path.trim()) {
      setError('Chain import path is required.');
      return;
    }
    if (!scenarios.length) {
      setError('Add at least one scenario before running.');
      return;
    }
    setError('');
    setRunning(true);
    setResults([]);
    setReportId(null);
    resetLogs();
    startLocalTicker();

    let targetPayload = { type: targetType };
    if (targetType === 'openai') {
      targetPayload = {
        type: 'openai',
        base_url: target.base_url.trim(),
        api_key: target.api_key.trim(),
        model_name: target.model_name.trim(),
      };
    } else if (targetType === 'huggingface') {
      targetPayload = {
        type: 'huggingface',
        repo_id: target.repo_id.trim(),
        api_token: target.api_token.trim(),
      };
    } else if (targetType === 'webhook') {
      targetPayload = {
        type: 'webhook',
        endpoint_url: target.endpoint_url.trim(),
        payload_template: target.payload_template.trim(),
      };
    } else if (targetType === 'langchain') {
      targetPayload = {
        type: 'langchain',
        chain_import_path: target.chain_import_path.trim(),
        invoke_key: (target.invoke_key || 'question').trim(),
      };
    }

    const payload = {
      agent_description: `${targetType} agent`,
      target: targetPayload,
      scenarios: scenarios.map((s) => ({
        task: s.task,
        expected_tool_calls: s.expected_tool_calls || [],
        expected_outcome: s.expected_outcome || '',
        trap_tools: s.trap_tools || [],
      })),
    };

    try {
      addLog('Dispatching request to /evaluate/agent.');
      const response = await apiFetch('/evaluate/agent', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (response?.report_id) {
        setReportId(response.report_id);
        addLog(`Report created: ${response.report_id}`);
      }

      const scenarioResults = response?.scenario_results || [];
      setResults(scenarioResults);
      addLog('Agentic evaluation completed.');
    } catch (err) {
      setError(err?.message || 'Agentic evaluation failed.');
      addLog('Agentic evaluation failed.');
    } finally {
      setRunning(false);
      if (localTimer.current) clearInterval(localTimer.current);
    }
  }

  useEffect(() => {
    if (!reportId) return;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const report = await apiFetch(`/report/${reportId}`);
        addLog(`Report status: ${report?.status || 'unknown'}`);
        if (report?.status && report.status !== 'processing') {
          clearInterval(pollTimer.current);
        }
      } catch {
        addLog('Report polling failed.');
      }
    }, 3000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, [reportId]);

  const canRun = useMemo(() => {
    if (running) return false;
    const type = target.type || 'openai';
    if (type === 'openai' && (!target.base_url.trim() || !target.model_name.trim())) return false;
    if (type === 'huggingface' && !target.repo_id.trim()) return false;
    if (type === 'webhook' && (!target.endpoint_url.trim() || !target.payload_template.trim())) return false;
    if (type === 'langchain' && !target.chain_import_path.trim()) return false;
    return scenarios.length > 0;
  }, [target, scenarios.length, running]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app - agentic</div>
        <div className="page-title">Agentic Evaluations</div>
        <div className="page-desc">Build multi-tool scenarios and score tool fidelity and traps.</div>
      </div>

      {error && <div className="err-box">! {error}</div>}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Target config</div>
        {showSavedTargets && (
          <div className="field">
            <label className="label">Use a saved target</label>
            <select
              className="select"
              value={selectedTargetId}
              onChange={(e) => {
                const id = e.target.value;
                setSelectedTargetId(id);
                if (!id) {
                  resetManualTarget();
                  return;
                }
                const found = savedTargets.find((t) => t.target_id === id);
                applySavedTarget(found);
              }}
            >
              <option value="">— configure manually —</option>
              {savedTargets.map((t) => (
                <option key={t.target_id} value={t.target_id}>
                  {t.name} ({t.target_type})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="label">Adapter type</label>
          <select
            className="select"
            value={target.type}
            onChange={(e) => setTarget((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="openai">OpenAI-compatible</option>
            <option value="huggingface">HuggingFace</option>
            <option value="webhook">Webhook</option>
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
                placeholder={selectedTargetId ? 'Enter API key (not stored)' : 'sk-...'}
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
                placeholder={selectedTargetId ? 'Enter API key (not stored)' : 'hf_...'}
                value={target.api_token}
                onChange={(e) => setTarget((prev) => ({ ...prev, api_token: e.target.value }))}
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
              <label className="label">Payload template</label>
              <textarea
                className="textarea"
                rows={3}
                value={target.payload_template}
                onChange={(e) => setTarget((prev) => ({ ...prev, payload_template: e.target.value }))}
              />
            </div>
          </div>
        )}

        {target.type === 'langchain' && (
          <>
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
            <div style={{ fontSize: 11, color: 'var(--mid)' }}>
              The LangChain adapter requires `langchain` to be installed on your backend server.
              Add it to your `requirements.txt` and redeploy. Dynamic pip installs are not supported.
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Scenario builder</div>
        <div style={{ marginBottom: 12 }}>
          <label className="label">Task description</label>
          <textarea
            className="textarea"
            rows={3}
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="card-label" style={{ fontSize: 11 }}>Expected tools</div>
          {expectedTools.map((row, idx) => (
            <div key={`expected-${idx}`} className="input-row" style={{ marginBottom: 8 }}>
              <input
                className="input"
                placeholder="search_flights"
                value={row.name}
                onChange={(e) => {
                  const next = [...expectedTools];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setExpectedTools(next);
                }}
              />
              <input
                className="input"
                placeholder="from,to,date"
                value={row.requiredParams}
                onChange={(e) => {
                  const next = [...expectedTools];
                  next[idx] = { ...next[idx], requiredParams: e.target.value };
                  setExpectedTools(next);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setExpectedTools(expectedTools.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setExpectedTools([...expectedTools, { name: '', requiredParams: '' }])}
          >
            + Add expected tool
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className="card-label" style={{ fontSize: 11 }}>Trap tools</div>
          {trapTools.map((row, idx) => (
            <div key={`trap-${idx}`} className="input-row" style={{ marginBottom: 8 }}>
              <input
                className="input"
                placeholder="refund_payment"
                value={row.name}
                onChange={(e) => {
                  const next = [...trapTools];
                  next[idx] = { ...next[idx], name: e.target.value };
                  setTrapTools(next);
                }}
              />
              <input
                className="input"
                placeholder="Should never be used in this flow"
                value={row.description}
                onChange={(e) => {
                  const next = [...trapTools];
                  next[idx] = { ...next[idx], description: e.target.value };
                  setTrapTools(next);
                }}
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setTrapTools(trapTools.filter((_, i) => i !== idx))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setTrapTools([...trapTools, { name: '', description: '' }])}
          >
            + Add trap tool
          </button>
        </div>

        <button type="button" className="btn btn-primary" onClick={handleAddScenario}>
          Add Scenario
        </button>

        {scenarios.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {scenarios.map((scenario) => (
              <div
                key={scenario.id}
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--line2)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, color: 'var(--hi)' }}>{scenario.task}</div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setScenarios(scenarios.filter((s) => s.id !== scenario.id))}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-label">Run & Results</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRun}
            disabled={!canRun}
          >
            {running ? 'Running...' : 'Run Agentic Test'}
          </button>
          {reportId && (
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)' }}>
              Report: {reportId}
            </div>
          )}
        </div>

        <div style={{
          background: 'var(--bg3)',
          border: '1px solid var(--line2)',
          borderRadius: 10,
          padding: '12px 14px',
          fontFamily: 'var(--mono)',
          fontSize: 11,
          color: 'var(--mid)',
          minHeight: 120,
          maxHeight: 180,
          overflowY: 'auto',
        }}
        >
          {logs.length === 0 ? 'Logs will appear here.' : logs.map((line, idx) => (
            <div key={`log-${idx}`}>{line}</div>
          ))}
        </div>
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="card-label">Scenario results</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {results.map((result, idx) => {
              const scenario = scenarios[idx];
              const accuracy = typeof result.tool_accuracy === 'number' ? result.tool_accuracy : 0;
              const barWidth = Math.min(100, Math.max(0, (accuracy / 10) * 100));
              const barColor = scoreColor(accuracy);
              return (
                <div key={`result-${idx}`} style={{ background: 'var(--bg3)', border: '1px solid var(--line2)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--hi)' }}>
                      {scenario?.task || `Scenario ${idx + 1}`}
                    </div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: result.task_success ? 'var(--accent2)' : '#ff4d6d' }}>
                      {result.task_success ? 'OK Task success' : 'FAIL Task failed'}
                    </div>
                  </div>

                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--mid)' }}>
                      <span>Tool accuracy</span>
                      <span style={{ color: barColor }}>{accuracy.toFixed(1)} / 10</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: 'var(--bg0)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${barWidth}%`, background: barColor }} />
                    </div>
                  </div>

                  {result.trap_triggered && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 999,
                      background: 'rgba(255,77,109,0.1)',
                      border: '1px solid rgba(255,77,109,0.3)',
                      color: '#ff4d6d',
                      fontSize: 11,
                      marginBottom: 8,
                    }}
                    >
                      Trap triggered
                    </div>
                  )}

                  {Array.isArray(result.reasoning_errors) && result.reasoning_errors.length > 0 && (
                    <details style={{ marginBottom: 10 }}>
                      <summary style={{ cursor: 'pointer', color: 'var(--mid)' }}>Reasoning errors</summary>
                      <ul style={{ marginTop: 8, paddingLeft: 18, color: 'var(--text)' }}>
                        {result.reasoning_errors.map((err, i) => (
                          <li key={`err-${idx}-${i}`} style={{ marginBottom: 4 }}>{err}</li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--mid)', marginBottom: 6 }}>Tool call trace</div>
                    <ol style={{ margin: 0, paddingLeft: 18, color: 'var(--text)', fontSize: 12 }}>
                      {(result.tool_calls || []).map((call, i) => (
                        <li key={`call-${idx}-${i}`} style={{ marginBottom: 4 }}>
                          <span style={{ fontFamily: 'var(--mono)', color: call.was_trap ? '#ff4d6d' : 'var(--accent)' }}>
                            {call.name || 'unknown'}
                          </span>
                          {call.params && (
                            <span style={{ color: 'var(--mid)' }}> - {JSON.stringify(call.params)}</span>
                          )}
                        </li>
                      ))}
                      {(result.tool_calls || []).length === 0 && (
                        <li style={{ color: 'var(--mid)' }}>No tool calls recorded.</li>
                      )}
                    </ol>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
