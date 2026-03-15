import { useState, useMemo } from 'react';

function buildYaml(config) {
  const {
    agentFramework,
    infraTarget,
    retrievalSystem,
    toolConnector,
    multimodalTarget,
    agenticEvaluator,
  } = config;

  const lines = [];

  lines.push('agent_framework:');
  lines.push(`  provider: ${agentFramework.provider || 'crewai'}`);
  lines.push('  agent_settings:');
  lines.push(`    role: "${agentFramework.role || ''}"`);
  lines.push(`    goal: "${agentFramework.goal || ''}"`);
  lines.push(`    backstory: "${agentFramework.backstory || ''}"`);
  lines.push('  eval_metrics:');
  (agentFramework.evalMetrics || []).forEach((m) => {
    if (m) lines.push(`    - ${m}`);
  });

  lines.push('');
  lines.push('infra_target:');
  lines.push(`  provider: ${infraTarget.provider || 'vllm'}`);
  lines.push(`  api_base: "${infraTarget.apiBase || ''}"`);
  lines.push('  engine_params:');
  lines.push(`    gpu_memory_utilization: ${infraTarget.gpuMemoryUtilization || 0.9}`);
  lines.push(`    max_model_len: ${infraTarget.maxModelLen || 32768}`);
  lines.push(`    quantization: "${infraTarget.quantization || ''}"`);
  lines.push(`    enable_prefix_caching: ${infraTarget.enablePrefixCaching ? 'true' : 'false'}`);

  lines.push('');
  lines.push('retrieval_system:');
  lines.push(`  vector_db: ${retrievalSystem.vectorDb || 'pinecone'}`);
  lines.push(`  index_name: "${retrievalSystem.indexName || ''}"`);
  lines.push('  eval_params:');
  lines.push(`    retrieval_k: ${retrievalSystem.retrievalK || 5}`);
  lines.push('    metrics:');
  (retrievalSystem.metrics || []).forEach((m) => {
    if (m) lines.push(`      - ${m}`);
  });

  lines.push('');
  lines.push('tool_connector:');
  lines.push(`  connector: ${toolConnector.connector || 'zapier'}`);
  lines.push(`  action_id: "${toolConnector.actionId || ''}"`);
  lines.push(`  validation_mode: ${toolConnector.validationMode || 'agentic_trace'}`);
  lines.push('  requirements:');
  lines.push(`    auth_type: "${toolConnector.authType || ''}"`);
  lines.push('    params:');
  (toolConnector.params || []).forEach((p) => {
    if (p) lines.push(`      - "${p}"`);
  });

  lines.push('');
  lines.push('multimodal_target:');
  lines.push(`  model: "${multimodalTarget.model || ''}"`);
  lines.push('  input_types:');
  (multimodalTarget.inputTypes || []).forEach((t) => {
    if (t) lines.push(`    - "${t}"`);
  });
  lines.push('  validation_criteria:');
  (multimodalTarget.validationCriteria || []).forEach((c) => {
    if (c) lines.push(`    - ${c}`);
  });

  lines.push('');
  lines.push('agentic_evaluator:');
  lines.push(`  mode: ${agenticEvaluator.mode || 'single'}`);
  lines.push(`  consensus_threshold: ${agenticEvaluator.consensusThreshold || 0.8}`);
  lines.push('  agents:');
  (agenticEvaluator.agents || []).forEach((a) => {
    if (a && a.role) lines.push(`    - role: ${a.role}`);
  });

  return lines.join('\n');
}

export default function ConfigBuilderPage() {
  const [activeTab, setActiveTab] = useState('framework');
  const [agentFramework, setAgentFramework] = useState({
    provider: 'crewai',
    role: '',
    goal: '',
    backstory: '',
    evalMetrics: ['trajectory_accuracy', 'tool_call_precision'],
  });
  const [infraTarget, setInfraTarget] = useState({
    provider: 'vllm',
    apiBase: '',
    gpuMemoryUtilization: 0.9,
    maxModelLen: 32768,
    quantization: '',
    enablePrefixCaching: true,
  });
  const [retrievalSystem, setRetrievalSystem] = useState({
    vectorDb: 'pinecone',
    indexName: '',
    retrievalK: 5,
    metrics: ['faithfulness', 'hit_rate', 'mrr'],
  });
  const [toolConnector, setToolConnector] = useState({
    connector: 'zapier',
    actionId: '',
    validationMode: 'agentic_trace',
    authType: '',
    params: ['to_address', 'subject', 'body'],
  });
  const [multimodalTarget, setMultimodalTarget] = useState({
    model: '',
    inputTypes: ['image/jpeg', 'application/pdf'],
    validationCriteria: ['ocr_accuracy', 'spatial_reasoning'],
  });
  const [agenticEvaluator, setAgenticEvaluator] = useState({
    mode: 'single',
    consensusThreshold: 0.8,
    agents: [{ role: 'critic' }, { role: 'fact_checker' }],
  });

  const yaml = useMemo(
    () =>
      buildYaml({
        agentFramework,
        infraTarget,
        retrievalSystem,
        toolConnector,
        multimodalTarget,
        agenticEvaluator,
      }),
    [agentFramework, infraTarget, retrievalSystem, toolConnector, multimodalTarget, agenticEvaluator],
  );

  function copyYaml() {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(yaml);
    }
  }

  function downloadYaml() {
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'config.yaml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// workspace · config</div>
        <div className="page-title">Config Builder</div>
        <div className="page-desc">Interactively compose a universal YAML config for your targets, tools, and evaluators.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div className="card">
          <div style={{ display: 'flex', borderBottom: '1px solid var(--line2)', marginBottom: 12 }}>
            {[
              { id: 'framework', label: 'Framework' },
              { id: 'infra', label: 'Infrastructure' },
              { id: 'rag', label: 'RAG' },
              { id: 'tools', label: 'Tools' },
              { id: 'multimodal', label: 'Multimodal' },
              { id: 'evaluator', label: 'Evaluator' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="btn-tab"
                style={{
                  flex: 1,
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  fontSize: 12,
                  padding: '8px 6px',
                }}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'framework' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label className="label">Framework provider</label>
                <select
                  className="select"
                  value={agentFramework.provider}
                  onChange={(e) => setAgentFramework((p) => ({ ...p, provider: e.target.value }))}
                >
                  <option value="crewai">crewai</option>
                  <option value="langgraph">langgraph</option>
                  <option value="autogen">autogen</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Agent role</label>
                <input
                  className="input"
                  value={agentFramework.role}
                  onChange={(e) => setAgentFramework((p) => ({ ...p, role: e.target.value }))}
                  placeholder="Senior evaluation agent"
                />
              </div>
              <div className="field">
                <label className="label">Agent goal</label>
                <input
                  className="input"
                  value={agentFramework.goal}
                  onChange={(e) => setAgentFramework((p) => ({ ...p, goal: e.target.value }))}
                  placeholder="Stress-test the target model and surface failure modes"
                />
              </div>
              <div className="field">
                <label className="label">Agent backstory</label>
                <textarea
                  className="textarea"
                  rows={3}
                  value={agentFramework.backstory}
                  onChange={(e) => setAgentFramework((p) => ({ ...p, backstory: e.target.value }))}
                  placeholder="You are an independent auditor..."
                />
              </div>
            </div>
          )}

          {activeTab === 'infra' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label className="label">Provider</label>
                <select
                  className="select"
                  value={infraTarget.provider}
                  onChange={(e) => setInfraTarget((p) => ({ ...p, provider: e.target.value }))}
                >
                  <option value="vllm">vllm</option>
                  <option value="ollama">ollama</option>
                  <option value="siliconflow">siliconflow</option>
                  <option value="openai">openai</option>
                  <option value="huggingface">huggingface</option>
                </select>
              </div>
              <div className="field">
                <label className="label">API base</label>
                <input
                  className="input"
                  value={infraTarget.apiBase}
                  onChange={(e) => setInfraTarget((p) => ({ ...p, apiBase: e.target.value }))}
                  placeholder="http://localhost:8001/v1"
                />
              </div>
              <div className="field">
                <label className="label">GPU memory utilization</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  className="input"
                  value={infraTarget.gpuMemoryUtilization}
                  onChange={(e) =>
                    setInfraTarget((p) => ({ ...p, gpuMemoryUtilization: parseFloat(e.target.value || '0.9') }))
                  }
                />
              </div>
              <div className="field">
                <label className="label">Max model length (tokens)</label>
                <input
                  type="number"
                  className="input"
                  value={infraTarget.maxModelLen}
                  onChange={(e) =>
                    setInfraTarget((p) => ({ ...p, maxModelLen: parseInt(e.target.value || '32768', 10) }))
                  }
                />
              </div>
              <div className="field">
                <label className="label">Quantization</label>
                <input
                  className="input"
                  value={infraTarget.quantization}
                  onChange={(e) => setInfraTarget((p) => ({ ...p, quantization: e.target.value }))}
                  placeholder="gptq, awq, 8bit..."
                />
              </div>
              <div className="field">
                <label className="label">Enable prefix caching</label>
                <select
                  className="select"
                  value={infraTarget.enablePrefixCaching ? 'true' : 'false'}
                  onChange={(e) =>
                    setInfraTarget((p) => ({ ...p, enablePrefixCaching: e.target.value === 'true' }))
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'rag' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label className="label">Vector DB</label>
                <select
                  className="select"
                  value={retrievalSystem.vectorDb}
                  onChange={(e) => setRetrievalSystem((p) => ({ ...p, vectorDb: e.target.value }))}
                >
                  <option value="pinecone">pinecone</option>
                  <option value="milvus">milvus</option>
                  <option value="pgvector">pgvector</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Index name</label>
                <input
                  className="input"
                  value={retrievalSystem.indexName}
                  onChange={(e) => setRetrievalSystem((p) => ({ ...p, indexName: e.target.value }))}
                  placeholder="abl-eval-index"
                />
              </div>
              <div className="field">
                <label className="label">Retrieval k</label>
                <input
                  type="number"
                  className="input"
                  value={retrievalSystem.retrievalK}
                  onChange={(e) =>
                    setRetrievalSystem((p) => ({ ...p, retrievalK: parseInt(e.target.value || '5', 10) }))
                  }
                />
              </div>
            </div>
          )}

          {activeTab === 'tools' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label className="label">Connector</label>
                <select
                  className="select"
                  value={toolConnector.connector}
                  onChange={(e) => setToolConnector((p) => ({ ...p, connector: e.target.value }))}
                >
                  <option value="zapier">zapier</option>
                  <option value="make">make</option>
                  <option value="mcp">mcp</option>
                  <option value="custom">custom</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Action ID</label>
                <input
                  className="input"
                  value={toolConnector.actionId}
                  onChange={(e) => setToolConnector((p) => ({ ...p, actionId: e.target.value }))}
                  placeholder="e.g. send_email_notification"
                />
              </div>
              <div className="field">
                <label className="label">Validation mode</label>
                <input
                  className="input"
                  value={toolConnector.validationMode}
                  onChange={(e) => setToolConnector((p) => ({ ...p, validationMode: e.target.value }))}
                  placeholder="agentic_trace"
                />
              </div>
              <div className="field">
                <label className="label">Auth type</label>
                <input
                  className="input"
                  value={toolConnector.authType}
                  onChange={(e) => setToolConnector((p) => ({ ...p, authType: e.target.value }))}
                  placeholder="api_key, oauth2, custom..."
                />
              </div>
            </div>
          )}

          {activeTab === 'multimodal' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label className="label">Model</label>
                <input
                  className="input"
                  value={multimodalTarget.model}
                  onChange={(e) => setMultimodalTarget((p) => ({ ...p, model: e.target.value }))}
                  placeholder="gpt-4.1-vision-preview"
                />
              </div>
            </div>
          )}

          {activeTab === 'evaluator' && (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field">
                <label className="label">Mode</label>
                <select
                  className="select"
                  value={agenticEvaluator.mode}
                  onChange={(e) => setAgenticEvaluator((p) => ({ ...p, mode: e.target.value }))}
                >
                  <option value="single">single</option>
                  <option value="debate">debate</option>
                </select>
              </div>
              <div className="field">
                <label className="label">Consensus threshold</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  className="input"
                  value={agenticEvaluator.consensusThreshold}
                  onChange={(e) =>
                    setAgenticEvaluator((p) => ({
                      ...p,
                      consensusThreshold: parseFloat(e.target.value || '0.8'),
                    }))
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="card-label">YAML preview</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={copyYaml}>
                Copy YAML
              </button>
              <button type="button" className="btn btn-ghost" style={{ fontSize: 11 }} onClick={downloadYaml}>
                Download config.yaml
              </button>
            </div>
          </div>
          <pre
            style={{
              flex: 1,
              overflow: 'auto',
              fontFamily: 'var(--mono)',
              fontSize: 11.5,
              background: 'rgba(0,0,0,.4)',
              padding: 12,
              borderRadius: 'var(--r)',
              border: '1px solid var(--line2)',
              whiteSpace: 'pre',
            }}
          >
            {yaml}
          </pre>
        </div>
      </div>
    </div>
  );
}

