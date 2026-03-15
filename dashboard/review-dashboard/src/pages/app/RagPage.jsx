import { useMemo, useState } from 'react';
import { apiFetch } from '../../App.jsx';

const VECTOR_STORES = [
  { value: 'pinecone', label: 'Pinecone serverless' },
  { value: 'milvus', label: 'Milvus' },
  { value: 'pgvector', label: 'pgvector / PostgreSQL' },
  { value: 'custom', label: 'Custom endpoint' },
];

function parseContextInput(raw) {
  const text = (raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v ?? '')).filter((v) => v.trim());
    }
  } catch {
    // fall through to line-based parsing
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseDatasetJson(raw) {
  const text = (raw || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed
        .map((row) => ({
          question: String(row.question ?? ''),
          context_docs: Array.isArray(row.context_docs)
            ? row.context_docs.map((d) => String(d ?? '')).filter((d) => d.trim())
            : [],
          ground_truth: String(row.ground_truth ?? ''),
        }))
        .filter((row) => row.question && row.ground_truth);
    }
  } catch {
    return [];
  }
  return [];
}

function truncate(text, max = 80) {
  const t = String(text || '');
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export default function RagPage() {
  const [vectorStore, setVectorStore] = useState('pinecone');
  const [indexName, setIndexName] = useState('');
  const [retrievalK, setRetrievalK] = useState(5);

  const [question, setQuestion] = useState('');
  const [contextInput, setContextInput] = useState('');
  const [groundTruth, setGroundTruth] = useState('');
  const [datasetJson, setDatasetJson] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [reportId, setReportId] = useState(null);

  const kpis = useMemo(() => {
    if (!metrics) {
      return [
        { label: 'Faithfulness', value: '—' },
        { label: 'Hit Rate', value: '—' },
        { label: 'MRR', value: '—' },
        { label: 'Hallucinations', value: '—' },
      ];
    }
    return [
      { label: 'Faithfulness', value: (metrics.avg_faithfulness ?? 0).toFixed(2) },
      { label: 'Hit Rate', value: (metrics.avg_hit_rate ?? 0).toFixed(3) },
      { label: 'MRR', value: (metrics.avg_mrr ?? 0).toFixed(3) },
      { label: 'Hallucinations', value: metrics.hallucinations_detected ?? 0 },
    ];
  }, [metrics]);

  const chartMetrics = useMemo(() => {
    if (!metrics) {
      return [
        { key: 'faithfulness', label: 'Faithfulness', value: 0, max: 10 },
        { key: 'hit_rate', label: 'Hit Rate', value: 0, max: 1 },
        { key: 'mrr', label: 'MRR', value: 0, max: 1 },
        { key: 'hallucinations', label: 'Hallucinations', value: 0, max: Math.max(1, results.length || 1) },
      ];
    }
    return [
      { key: 'faithfulness', label: 'Faithfulness', value: metrics.avg_faithfulness ?? 0, max: 10 },
      { key: 'hit_rate', label: 'Hit Rate', value: metrics.avg_hit_rate ?? 0, max: 1 },
      { key: 'mrr', label: 'MRR', value: metrics.avg_mrr ?? 0, max: 1 },
      {
        key: 'hallucinations',
        label: 'Hallucinations',
        value: metrics.hallucinations_detected ?? 0,
        max: Math.max(1, results.length || 1),
      },
    ];
  }, [metrics, results.length]);

  async function handleRun(e) {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);
    setResults([]);
    setMetrics(null);
    setReportId(null);

    const manualContexts = parseContextInput(contextInput);
    const manualSample =
      question.trim() && groundTruth.trim()
        ? [
            {
              question: question.trim(),
              context_docs: manualContexts,
              ground_truth: groundTruth.trim(),
            },
          ]
        : [];

    const batchSamples = parseDatasetJson(datasetJson);
    const samples = [...manualSample, ...batchSamples];

    if (!samples.length) {
      setError('Provide at least one sample via the form or dataset JSON.');
      setLoading(false);
      return;
    }

    const target = {
      type: 'webhook',
      endpoint_url: '', // RAG target models are configured on the backend or via saved targets.
    };

    const body = {
      target,
      samples,
      groq_api_key: '', // Server-side or via env; dashboard does not store secrets.
    };

    try {
      const resp = await apiFetch('/evaluate/rag', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setResults(resp.results || []);
      setMetrics(resp.metrics || null);
      setReportId(resp.report_id || null);
    } catch (err) {
      setError(err?.message || 'RAG evaluation failed.');
    } finally {
      setLoading(false);
    }
  }

  const chartWidth = 100;
  const rowHeight = 10;
  const chartHeight = rowHeight * chartMetrics.length + 4;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// testing · rag</div>
        <div className="page-title">RAG Evaluation</div>
        <div className="page-desc">
          Test retrieval-augmented generation pipelines against your vector stores and inspect grounding quality.
        </div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}

      <div className="page-grid-2">
        {/* Left column — config */}
        <form onSubmit={handleRun} className="card" style={{ alignSelf: 'flex-start' }}>
          <div className="card-label">RAG pipeline config</div>

          <div className="field">
            <label className="label">Vector store</label>
            <select
              className="select"
              value={vectorStore}
              onChange={(e) => setVectorStore(e.target.value)}
            >
              {VECTOR_STORES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="input-row" style={{ gridTemplateColumns: '1.4fr 0.6fr' }}>
            <div>
              <label className="label">Index / collection name</label>
              <input
                className="input"
                placeholder="e.g. my-knowledge-base"
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Chunks to retrieve (k)</label>
              <input
                type="number"
                min="1"
                className="input"
                value={retrievalK}
                onChange={(e) => setRetrievalK(Number(e.target.value) || 1)}
              />
            </div>
          </div>

          <div className="card" style={{ marginTop: 10, marginBottom: 10 }}>
            <div className="card-label" style={{ fontSize: 11 }}>Single sample</div>
            <div className="field">
              <label className="label">Question</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Ask something your RAG pipeline should answer..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Context docs — paste one per line or JSON array</label>
              <textarea
                className="textarea"
                rows={4}
                placeholder="Chunk 1&#10;Chunk 2&#10;…"
                value={contextInput}
                onChange={(e) => setContextInput(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="label">Expected ground truth</label>
              <textarea
                className="textarea"
                rows={2}
                placeholder="Ideal answer for this question..."
                value={groundTruth}
                onChange={(e) => setGroundTruth(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label className="label">Or upload dataset JSON</label>
            <textarea
              className="textarea"
              rows={6}
              placeholder='[{"question":"...", "context_docs":["..."], "ground_truth":"..."}]'
              value={datasetJson}
              onChange={(e) => setDatasetJson(e.target.value)}
            />
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 4 }}>
              When provided, JSON rows are evaluated in addition to the single sample above.
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Running…' : 'Run RAG eval'}
          </button>

          {reportId && (
            <div style={{ marginTop: 8, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mid)' }}>
              Report ID: {reportId}
            </div>
          )}
        </form>

        {/* Right column — metrics + results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="kpi-row">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="kpi">
                <div className="kpi-label">{kpi.label}</div>
                <div className="kpi-value">{kpi.value}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-label">Metric breakdown</div>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              preserveAspectRatio="none"
              style={{ width: '100%', height: 130, background: 'var(--bg2)', borderRadius: 8 }}
            >
              {chartMetrics.map((m, idx) => {
                const norm = m.max ? Math.max(0, Math.min(1, m.value / m.max)) : 0;
                const barWidth = norm * (chartWidth - 30);
                const y = idx * rowHeight + 2;
                let color = 'var(--accent2)';
                if (m.key === 'faithfulness' && m.value < 7) color = '#F0A500';
                if (m.key === 'faithfulness' && m.value < 5) color = '#FF5C72';
                if (m.key === 'hallucinations' && m.value > 0) color = '#FF5C72';
                return (
                  <g key={m.key}>
                    <text
                      x="2"
                      y={y + 5.5}
                      fontSize="3"
                      fill="var(--mid)"
                    >
                      {m.label}
                    </text>
                    <rect
                      x="28"
                      y={y}
                      width={barWidth}
                      height={rowHeight - 3}
                      rx="1.5"
                      fill={color}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="card">
            <div className="card-label">Sample results</div>
            {results.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--mid)' }}>
                Run a RAG evaluation to see per-sample breakdowns here.
              </div>
            ) : (
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: '40%' }}>Question</th>
                      <th>Faithfulness</th>
                      <th>Hit rate</th>
                      <th>MRR</th>
                      <th>Hallucination</th>
                      <th style={{ width: '30%' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, idx) => (
                      <tr key={idx}>
                        <td>
                          <span title={row.question}>{truncate(row.question, 80)}</span>
                        </td>
                        <td>{typeof row.faithfulness === 'number' ? row.faithfulness.toFixed(1) : '—'}</td>
                        <td>{typeof row.hit_rate === 'number' ? row.hit_rate.toFixed(3) : '—'}</td>
                        <td>{typeof row.mrr === 'number' ? row.mrr.toFixed(3) : '—'}</td>
                        <td style={{ color: row.hallucination ? '#FF5C72' : 'var(--accent2)' }}>
                          {row.hallucination ? 'Yes' : 'No'}
                        </td>
                        <td>
                          <span title={row.reason}>{truncate(row.reason, 80)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

