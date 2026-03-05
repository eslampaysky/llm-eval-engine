import ModelScoreCard from '../components/ModelScoreCard';
import MetricsChart from '../components/MetricsChart';
import { formatPct } from '../types/formatters';

export default function DashboardPage({ latestEvaluation }) {
  const summary = latestEvaluation?.summary || {};
  const modelComparison = latestEvaluation?.model_comparison || [];
  const costAnalysis = latestEvaluation?.cost_analysis || latestEvaluation?.metrics?.cost_analysis || [];

  return (
    <section className="page">
      <h1 className="page-title">Dashboard Overview</h1>
      <div className="kpi-grid">
        <div className="kpi"><span>Total Evaluations</span><strong>{latestEvaluation ? 1 : 0}</strong></div>
        <div className="kpi"><span>Models Tested</span><strong>{modelComparison.length}</strong></div>
        <div className="kpi"><span>Avg Correctness</span><strong>{formatPct(summary.correctness || 0)}%</strong></div>
        <div className="kpi"><span>Avg Relevance</span><strong>{formatPct(summary.relevance || 0)}%</strong></div>
      </div>

      <MetricsChart modelComparison={modelComparison} />

      <div className="cards-grid">
        {modelComparison.map((row) => (
          <ModelScoreCard key={row.model} {...row} />
        ))}
      </div>

      <div className="panel">
        <h3 className="panel-title">Cost Analysis (per model)</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Avg Tokens</th>
                <th>Avg Cost (USD)</th>
                <th>Cost / 1000 Requests (USD)</th>
              </tr>
            </thead>
            <tbody>
              {costAnalysis.map((row) => (
                <tr key={row.model}>
                  <td>{(row.model || '').toUpperCase()}</td>
                  <td>{row.avg_tokens}</td>
                  <td>${row.avg_cost_usd}</td>
                  <td>${row.cost_per_1000_requests_usd}</td>
                </tr>
              ))}
              {!costAnalysis.length ? (
                <tr><td colSpan={4} className="empty">Run evaluation to see cost breakdown.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
