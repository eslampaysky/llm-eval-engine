import { useState } from 'react';
import EvaluationForm from '../components/EvaluationForm';
import ResultsTable from '../components/ResultsTable';
import ModelScoreCard from '../components/ModelScoreCard';

export default function EvaluatePage({ providers = [], onEvaluate, latestEvaluation, setLatestEvaluation }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRun = async (payload) => {
    try {
      setLoading(true);
      setError('');
      const response = await onEvaluate(payload);
      setLatestEvaluation(response);
    } catch (err) {
      setError(err.message || 'Failed to run evaluation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page">
      <h1 className="page-title">Run Evaluation</h1>
      {error ? <div className="error-banner">{error}</div> : null}

      <EvaluationForm providers={providers} onRun={handleRun} loading={loading} />

      {latestEvaluation?.model_comparison?.length ? (
        <div className="cards-grid">
          {latestEvaluation.model_comparison.map((row) => (
            <ModelScoreCard key={row.model} {...row} />
          ))}
        </div>
      ) : null}

      <ResultsTable rows={latestEvaluation?.results || []} />
    </section>
  );
}
