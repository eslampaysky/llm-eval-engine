import { formatPct } from '../types/formatters';

export default function ModelScoreCard({ model, correctness, relevance, hallucination, overall, samples }) {
  return (
    <article className="score-card">
      <header className="score-card-head">
        <h3>{(model || '').toUpperCase()}</h3>
        <span>{samples || 0} samples</span>
      </header>
      <div className="metric-grid">
        <div><strong>{formatPct(correctness)}%</strong><span>Correctness</span></div>
        <div><strong>{formatPct(relevance)}%</strong><span>Relevance</span></div>
        <div><strong>{formatPct(hallucination)}%</strong><span>Hallucination</span></div>
        <div><strong>{formatPct(overall)}%</strong><span>Overall</span></div>
      </div>
    </article>
  );
}
