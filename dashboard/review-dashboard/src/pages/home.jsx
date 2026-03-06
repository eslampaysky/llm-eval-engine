import { useMemo, useState } from 'react';
import { DEMO_DATASETS } from '../data/demoDatasets';
import { formatPct } from '../types/formatters';
import ResultsTable from '../components/ResultsTable';
import './home.css';

const DOCS_URL = 'https://llm-eval-engine-production.up.railway.app/docs';
const API_URL = 'https://llm-eval-engine-production.up.railway.app';

function Radar({ summary = {} }) {
  const points = useMemo(() => {
    const correctness = Number(summary.correctness || 0);
    const relevance = Number(summary.relevance || 0);
    const hallucination = Number(summary.hallucination || 0);
    const toxicity = 1 - Number(summary.toxicity || 0);
    const values = [correctness, relevance, hallucination, toxicity];
    const center = 60;
    const radius = 48;
    return values.map((v, idx) => {
      const angle = (-90 + idx * 90) * (Math.PI / 180);
      const r = Math.max(0, Math.min(1, v)) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x},${y}`;
    }).join(' ');
  }, [summary]);

  return (
    <div className="panel">
      <h3 className="panel-title">Radar Snapshot</h3>
      <svg viewBox="0 0 120 120" className="radar-svg" role="img" aria-label="Radar chart">
        <circle cx="60" cy="60" r="48" className="radar-ring" />
        <circle cx="60" cy="60" r="32" className="radar-ring" />
        <circle cx="60" cy="60" r="16" className="radar-ring" />
        <line x1="60" y1="12" x2="60" y2="108" className="radar-axis" />
        <line x1="12" y1="60" x2="108" y2="60" className="radar-axis" />
        <polygon points={points} className="radar-fill" />
      </svg>
      <div className="radar-labels">
        <span>Correctness</span>
        <span>Relevance</span>
        <span>Hallucination</span>
        <span>Safety</span>
      </div>
    </div>
  );
}

export default function HomePage({ latestEvaluation, onRunDemo, setPage }) {
  const [selectedDatasetId, setSelectedDatasetId] = useState(DEMO_DATASETS[0].id);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const selectedDataset = useMemo(
    () => DEMO_DATASETS.find((d) => d.id === selectedDatasetId) || DEMO_DATASETS[0],
    [selectedDatasetId],
  );

  const summary = latestEvaluation?.summary || {};
  const rows = latestEvaluation?.results || [];

  const runDemo = async () => {
    try {
      setRunning(true);
      setError('');
      await onRunDemo({
        dataset_id: selectedDataset.fileName,
        model_version: `demo-${new Date().toISOString().slice(0, 10)}`,
        dataset: selectedDataset.samples,
      });
    } catch (err) {
      setError(err?.message || 'Failed to run demo evaluation.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="page">
      <div className="home-hero panel">
        <p className="eyebrow">Home</p>
        <h1 className="hero-title">AI Breaker Lab</h1>
        <p className="hero-subtitle">Stress-testing LLM systems before production.</p>
        <p className="hero-text">
          Evaluate hallucinations, correctness, and reliability of AI responses before deployment.
        </p>
        <div className="hero-actions">
          <button type="button" className="primary-btn" onClick={() => document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth' })}>
            Try Demo
          </button>
          <a className="ghost-btn docs-btn" href={DOCS_URL} target="_blank" rel="noreferrer">
            View API Docs
          </a>
          <button type="button" className="ghost-btn" onClick={() => setPage('dashboard')}>
            Open Full Dashboard
          </button>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">The Problem</h2>
        <p>LLM applications often produce incorrect answers, hallucinated information, and unsafe or irrelevant responses.</p>
        <p>Most teams rely on manual review, which is slow and inconsistent.</p>
        <p><strong>AI Breaker Lab automatically evaluates AI outputs and generates decision-grade quality reports.</strong></p>
      </div>

      <div className="panel">
        <h2 className="panel-title">How It Works</h2>
        <div className="steps-grid">
          <div>
            <h3>1. Upload dataset</h3>
            <ul>
              <li>customer_support.json</li>
              <li>rag_qa.json</li>
              <li>factual_questions.json</li>
            </ul>
          </div>
          <div>
            <h3>2. Run evaluation</h3>
            <ul>
              <li>Correctness</li>
              <li>Relevance</li>
              <li>Hallucinations</li>
              <li>Safety</li>
            </ul>
          </div>
          <div>
            <h3>3. Get report</h3>
            <ul>
              <li>Overall score</li>
              <li>Failure analysis</li>
              <li>Model performance</li>
            </ul>
          </div>
        </div>
      </div>

      <div id="live-demo" className="panel">
        <h2 className="panel-title">Try AI Breaker Lab</h2>
        <p>Select a demo dataset and run a live evaluation via <code>POST /evaluate</code>.</p>
        <div className="field-grid two">
          <label>
            <span>Select Demo Dataset</span>
            <select value={selectedDatasetId} onChange={(e) => setSelectedDatasetId(e.target.value)}>
              {DEMO_DATASETS.map((dataset) => (
                <option key={dataset.id} value={dataset.id}>
                  {dataset.fileName}
                </option>
              ))}
            </select>
          </label>
          <div className="dataset-help">
            <strong>{selectedDataset.title}</strong>
            <span>{selectedDataset.description}</span>
          </div>
        </div>
        <button type="button" className="primary-btn" disabled={running} onClick={runDemo}>
          {running ? 'Running...' : 'Run Evaluation'}
        </button>
        {error ? <p className="error-text">{error}</p> : null}
      </div>

      <div className="panel">
        <h2 className="panel-title">Demo Catalog</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Demo</th>
                <th>Description</th>
                <th>Source File</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_DATASETS.map((dataset) => (
                <tr key={dataset.id}>
                  <td>{dataset.title}</td>
                  <td>{dataset.description}</td>
                  <td>{dataset.fileName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Demo Dashboard</h2>
        <div className="kpi-grid">
          <div className="kpi"><span>Correctness</span><strong>{formatPct(summary.correctness || 0)}%</strong></div>
          <div className="kpi"><span>Relevance</span><strong>{formatPct(summary.relevance || 0)}%</strong></div>
          <div className="kpi"><span>Hallucination</span><strong>{formatPct(summary.hallucination || 0)}%</strong></div>
          <div className="kpi"><span>Overall</span><strong>{formatPct(summary.overall || 0)}%</strong></div>
        </div>

        <div className="home-chart-grid">
          <div className="panel">
            <h3 className="panel-title">Bar Chart</h3>
            <div className="bar-chart">
              {[
                ['Correctness', summary.correctness || 0],
                ['Relevance', summary.relevance || 0],
                ['Hallucination', summary.hallucination || 0],
                ['Overall', summary.overall || 0],
              ].map(([label, value]) => (
                <div key={label} className="bar-row">
                  <div className="bar-label">{label}</div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.round(Number(value) * 100)}%` }} />
                  </div>
                  <div className="bar-value">{formatPct(value)}%</div>
                </div>
              ))}
            </div>
          </div>
          <Radar summary={summary} />
        </div>
      </div>

      <ResultsTable rows={rows} />

      <div className="panel">
        <h2 className="panel-title">API Example</h2>
        <pre className="code-block">
{`curl -X POST ${API_URL}/evaluate \\
-H "Content-Type: application/json" \\
-H "X-API-KEY: client_key" \\
-d '{
  "dataset":[
    {
      "question":"What is the capital of France?",
      "ground_truth":"Paris",
      "model_answer":"Paris is the capital of France"
    }
  ]
}'`}
        </pre>
      </div>

      <p className="powered-by">
        Powered by AI Breaker Lab evaluation engine.{' '}
        <a href={DOCS_URL} target="_blank" rel="noreferrer">API docs</a>
      </p>
    </section>
  );
}
