import { formatPct } from '../types/formatters';

export default function MetricsChart({ modelComparison = [] }) {
  if (!modelComparison.length) {
    return <div className="panel empty">Run an evaluation to see model comparison.</div>;
  }

  return (
    <div className="panel">
      <h3 className="panel-title">Model Score Comparison</h3>
      <div className="bar-chart">
        {modelComparison.map((row) => (
          <div key={row.model} className="bar-row">
            <div className="bar-label">{(row.model || '').toUpperCase()}</div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${Math.round((row.overall || 0) * 100)}%` }} />
            </div>
            <div className="bar-value">{formatPct(row.overall)}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
