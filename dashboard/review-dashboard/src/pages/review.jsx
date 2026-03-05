import { useMemo, useState } from 'react';

export default function ReviewPage({ latestEvaluation, onSubmitReview, reviewRules, onReviewCompleted }) {
  const [rows, setRows] = useState(() =>
    (latestEvaluation?.results || []).map((r, idx) => ({
      id: idx,
      question: r.question,
      ground_truth: r.ground_truth || '',
      model_answer: r.model_answer || '',
      human_score: Math.round(((Number(r.correctness || 0) + Number(r.relevance || 0)) / 2) || 0),
      verdict: 'correct',
      hallucinated: Boolean(r.hallucination),
      feedback: '',
    }))
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [isLocked, setIsLocked] = useState(false);

  const canSubmit = useMemo(() => Boolean(latestEvaluation?.report_id) && rows.length > 0, [latestEvaluation, rows]);

  const updateRow = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const submit = async () => {
    if (!canSubmit || isLocked) return;
    setSaving(true);
    setMessage('');
    try {
      const reviewed_items = rows.map((r) => ({
        id: r.id,
        question: r.question,
        human_score: Number(r.human_score),
        verdict: r.verdict,
        decision: r.verdict === 'correct' ? 'approve' : 'reject',
        hallucinated: Boolean(r.hallucinated),
        feedback: r.feedback || '',
      }));

      const res = await onSubmitReview(latestEvaluation.report_id, {
        report_id: latestEvaluation.report_id,
        reviewed_items,
        exported_at: new Date().toISOString(),
      });
      setMessage(`Saved ${res.reviewed_items} reviews. Rules updated.`);
      setIsLocked(true);
    } catch (err) {
      setMessage(`Failed: ${err.message || 'review submit error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <h1 className="page-title">Review Dashboard (Human-in-the-Loop)</h1>
      {!latestEvaluation?.report_id ? <div className="panel empty">Run an evaluation first, then review results here.</div> : null}

      {reviewRules ? (
        <div className="panel">
          <h3 className="panel-title">Current Retrained Rules</h3>
          <div className="usage-grid">
            <div><span>Min Correctness Gate</span><strong>{reviewRules.min_correctness_gate}</strong></div>
            <div><span>Hallucination Sensitivity</span><strong>{reviewRules.hallucination_sensitivity}</strong></div>
            <div><span>Total Reviews</span><strong>{reviewRules.total_reviews}</strong></div>
            <div><span>Avg Human Score</span><strong>{reviewRules.avg_human_score}</strong></div>
          </div>
        </div>
      ) : null}

      {latestEvaluation?.report_id ? (
        <div className="panel">
          {!isLocked ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Expected</th>
                    <th>Actual</th>
                    <th>Correct</th>
                    <th>Incorrect</th>
                    <th>Hallucinated</th>
                    <th>Human Score</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.question}</td>
                      <td>{r.ground_truth}</td>
                      <td>{r.model_answer}</td>
                      <td>
                        <input type="radio" name={`verdict-${r.id}`} checked={r.verdict === 'correct'} onChange={() => updateRow(r.id, { verdict: 'correct' })} />
                      </td>
                      <td>
                        <input type="radio" name={`verdict-${r.id}`} checked={r.verdict === 'incorrect'} onChange={() => updateRow(r.id, { verdict: 'incorrect' })} />
                      </td>
                      <td>
                        <input type="checkbox" checked={Boolean(r.hallucinated)} onChange={(e) => updateRow(r.id, { hallucinated: e.target.checked })} />
                      </td>
                      <td>
                        <input type="number" min="0" max="10" value={r.human_score} onChange={(e) => updateRow(r.id, { human_score: e.target.value })} />
                      </td>
                      <td>
                        <input value={r.feedback} onChange={(e) => updateRow(r.id, { feedback: e.target.value })} placeholder="Reviewer feedback" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel" style={{ margin: 0 }}>
              Review submitted and locked. This run is now read-only.
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="primary-btn" type="button" disabled={!canSubmit || saving} onClick={submit}>
              {saving ? 'Saving...' : isLocked ? 'Review Locked' : 'Submit Review + Retrain Rules'}
            </button>
            {isLocked ? (
              <button className="ghost-btn" type="button" onClick={onReviewCompleted}>
                Ready for Next Review
              </button>
            ) : null}
            {message ? <div className="panel" style={{ margin: 0, padding: '8px 12px' }}>{message}</div> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
