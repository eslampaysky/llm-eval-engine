import { useEffect, useMemo, useState } from 'react';
import { api, apiFetch, scoreColor } from '../../App.jsx';

function truncate(text, max = 120) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export default function HitlPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [expanded, setExpanded] = useState(() => new Set());
  const [details, setDetails] = useState(() => ({})); // reportId -> full report with results
  const [reviewState, setReviewState] = useState(() => ({})); // `${reportId}:${idx}` -> 'confirmed' | 'overruled'
  const [reasonDrafts, setReasonDrafts] = useState(() => ({})); // `${reportId}:${idx}` -> string
  const [submitting, setSubmitting] = useState(() => ({})); // `${reportId}:${idx}` -> bool
  const [retrainLoading, setRetrainLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getReports();
        if (cancelled) return;
        const sorted = [...data].sort(
          (a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0),
        );
        setReports(sorted.slice(0, 20));
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load reports');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleReport = async (reportId) => {
    const next = new Set(expanded);
    if (next.has(reportId)) {
      next.delete(reportId);
      setExpanded(next);
      return;
    }

    // Expand; fetch details if not yet loaded.
    if (!details[reportId]) {
      try {
        const full = await api.getReport(reportId);
        setDetails((prev) => ({ ...prev, [reportId]: full }));
      } catch (e) {
        // Surface as basic alert; page-level error remains for list.
        // eslint-disable-next-line no-alert
        alert(`Failed to load report ${reportId}: ${e.message || e}`);
        return;
      }
    }

    next.add(reportId);
    setExpanded(next);
  };

  const handleReasonChange = (reportId, index, value) => {
    const key = `${reportId}:${index}`;
    setReasonDrafts((prev) => ({ ...prev, [key]: value }));
  };

  async function submitReview(reportId, index, verdict) {
    const key = `${reportId}:${index}`;
    const isCorrect = verdict === 'correct';
    const result = (details[reportId]?.results || [])[index] || {};
    const baseScore = typeof result.correctness === 'number' ? result.correctness : isCorrect ? 10.0 : 0.0;
    const reason =
      verdict === 'wrong'
        ? (reasonDrafts[key] || '').trim()
        : `User confirmed evaluator verdict at ${new Date().toISOString()}`;

    if (verdict === 'wrong' && !reason) {
      // eslint-disable-next-line no-alert
      alert('Please provide a reason before overruling.');
      return;
    }

    setSubmitting((prev) => ({ ...prev, [key]: true }));
    try {
      await apiFetch(`/report/${reportId}/human-review`, {
        method: 'POST',
        body: JSON.stringify({
          reviews: [
            {
              index,
              score: baseScore,
              comment: reason,
              approved: isCorrect,
            },
          ],
        }),
      });
      setReviewState((prev) => ({ ...prev, [key]: isCorrect ? 'confirmed' : 'overruled' }));
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(`Failed to submit review: ${e.message || e}`);
    } finally {
      setSubmitting((prev) => ({ ...prev, [key]: false }));
    }
  }

  const kpis = useMemo(() => {
    let total = 0;
    let confirmed = 0;
    let overruled = 0;
    Object.entries(details).forEach(([rid, rpt]) => {
      const res = rpt?.results || [];
      total += res.length;
      res.forEach((_, idx) => {
        const key = `${rid}:${idx}`;
        if (reviewState[key] === 'confirmed') confirmed += 1;
        if (reviewState[key] === 'overruled') overruled += 1;
      });
    });
    const reviewed = confirmed + overruled;
    const pending = total - reviewed;
    const accuracy = reviewed > 0 ? Math.round((confirmed / reviewed) * 100) : 0;
    return { pending, confirmed, overruled, accuracy };
  }, [details, reviewState]);

  const handleRetrain = async () => {
    setRetrainLoading(true);
    try {
      await apiFetch('/review/retrain', { method: 'POST' });
      // eslint-disable-next-line no-alert
      alert('Retrain job started.');
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Retrain endpoint not available yet — coming soon.');
    } finally {
      setRetrainLoading(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 22, marginBottom: 4 }}>HITL Review</h1>
          <div style={{ fontSize: 13, color: 'var(--mute)' }}>
            Human-in-the-loop review of judge decisions from past reports.
          </div>
        </div>
        <button
          className="btn btn-p"
          type="button"
          onClick={handleRetrain}
          disabled={retrainLoading}
        >
          {retrainLoading ? 'Retraining…' : 'Retrain evaluator'}
        </button>
      </div>

      <div className="kpi-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card kpi">
          <div className="kpi-label">Pending reviews</div>
          <div className="kpi-val">{kpis.pending}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Confirmed</div>
          <div className="kpi-val" style={{ color: '#4ade80' }}>{kpis.confirmed}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Overruled</div>
          <div className="kpi-val" style={{ color: '#f97373' }}>{kpis.overruled}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Evaluator accuracy</div>
          <div className="kpi-val">
            {kpis.accuracy}
            <span style={{ fontSize: 12, marginLeft: 4 }}>%</span>
          </div>
        </div>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--mute)' }}>Loading recent reports…</div>}
      {error && !loading && (
        <div style={{ fontSize: 13, color: '#f97373', marginBottom: 12 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.map((r) => {
          const reportId = r.report_id || r.reportId || r.id;
          const score = typeof r.average_score === 'number'
            ? r.average_score
            : typeof r.metrics?.average_score === 'number'
              ? r.metrics.average_score
              : 0;
          const created = r.created_at || r.createdAt;
          const isOpen = expanded.has(reportId);
          const full = details[reportId];
          const results = full?.results || [];

          return (
            <div key={reportId} className="card">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => toggleReport(reportId)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 0',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
                    {isOpen ? '▾' : '▸'}
                  </span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>
                    {String(reportId).slice(0, 8)}
                  </span>
                  <span style={{ fontSize: 13 }}>
                    {r.model_version || r.modelVersion || 'unknown model'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--mute)' }}>
                    {created ? new Date(created).toLocaleString() : ''}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 13,
                      color: scoreColor(score),
                    }}
                  >
                    {Number.isFinite(score) ? score.toFixed(2) : '–'}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--border-soft)', paddingTop: 8 }}>
                  {!full && (
                    <div style={{ fontSize: 12, color: 'var(--mute)' }}>
                      Loading results…
                    </div>
                  )}
                  {full && results.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--mute)' }}>
                      No results available for this report.
                    </div>
                  )}
                  {full && results.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {results.map((row, idx) => {
                        const rowKey = `${reportId}:${idx}`;
                        const verdict = reviewState[rowKey];
                        const hallucinated = !!row.hallucination;
                        const judgeScore = typeof row.correctness === 'number'
                          ? row.correctness
                          : typeof row.relevance === 'number'
                            ? row.relevance
                            : 0;
                        const disabled = submitting[rowKey];
                        const reasonValue = reasonDrafts[rowKey] || '';
                        return (
                          <div
                            key={rowKey}
                            className="card"
                            style={{
                              padding: 8,
                              borderRadius: 8,
                              background: 'var(--bg-soft)',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    fontSize: 13,
                                    marginBottom: 4,
                                  }}
                                >
                                  {truncate(row.question || '')}
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--mute)' }}>
                                  Judge reason: {row.reason || '—'}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', minWidth: 120 }}>
                                <div
                                  style={{
                                    fontFamily: 'var(--mono)',
                                    fontSize: 12,
                                    color: scoreColor(judgeScore),
                                  }}
                                >
                                  Score: {Number.isFinite(judgeScore) ? judgeScore.toFixed(2) : '–'}
                                </div>
                                <div
                                  style={{
                                    fontSize: 11,
                                    marginTop: 2,
                                    color: hallucinated ? '#f97373' : '#4ade80',
                                  }}
                                >
                                  {hallucinated ? 'Hallucination: yes' : 'Hallucination: no'}
                                </div>
                                {verdict && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      marginTop: 4,
                                      color: verdict === 'confirmed' ? '#4ade80' : '#f97373',
                                    }}
                                  >
                                    {verdict === 'confirmed' ? 'Confirmed' : 'Overruled'}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                marginTop: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              <button
                                type="button"
                                className="btn btn-g"
                                onClick={() => submitReview(reportId, idx, 'correct')}
                                disabled={disabled}
                              >
                                ✓ Confirm correct
                              </button>

                              <input
                                type="text"
                                placeholder="Reason for overrule…"
                                value={reasonValue}
                                onChange={(e) => handleReasonChange(reportId, idx, e.target.value)}
                                style={{
                                  flex: 1,
                                  minWidth: 180,
                                  fontSize: 12,
                                  padding: '6px 8px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border-soft)',
                                  background: 'var(--bg-elevated)',
                                  color: 'var(--fg)',
                                }}
                              />

                              <button
                                type="button"
                                className="btn btn-p"
                                onClick={() => submitReview(reportId, idx, 'wrong')}
                                disabled={disabled || !reasonValue.trim()}
                              >
                                ✗ Overrule — mark wrong
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

