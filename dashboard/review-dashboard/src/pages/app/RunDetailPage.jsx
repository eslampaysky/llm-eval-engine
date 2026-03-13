import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReportPage, api } from '../../App.jsx';
import { useAppShell } from '../../context/AppShellContext.jsx';
import RadarChart from '../../components/RadarChart.jsx';

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function RunDetailPage() {
  const { runId } = useParams();
  const { persona, report, setReport } = useAppShell();
  const [loading, setLoading] = useState(!report || report.report_id !== runId);
  const [error, setError] = useState('');

  useEffect(() => {
    if (report?.report_id === runId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getReport(runId)
      .then((nextReport) => {
        setReport(nextReport);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [runId, report?.report_id, setReport]);

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>;
  if (error) return <div className="page"><div className="err-box">⚠ {error}</div></div>;
  if (!report) return <div className="page"><div className="empty">Run not found.</div></div>;

  const results = Array.isArray(report.results) ? report.results : [];

  const avg = (key) => {
    if (!results.length) return 0;
    const nums = results.map((r) => Number(r?.[key] ?? 0)).filter((x) => Number.isFinite(x));
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };

  const hallucRateFromRows =
    results.length ? results.filter((r) => !!r?.hallucination).length / results.length : null;
  const hallucRateFromMetrics =
    report.metrics?.total_samples
      ? Number(report.metrics.hallucinations_detected || 0) / Number(report.metrics.total_samples || 1)
      : null;
  const hallucRate = hallucRateFromRows ?? hallucRateFromMetrics ?? 0;

  const summary = {
    correctness: clamp01(avg('correctness') / 10),
    relevance: clamp01(avg('relevance') / 10),
    hallucination: clamp01(1 - hallucRate),
    toxicity: clamp01(report.metrics?.toxicity ?? 0),
  };

  return <ReportPage report={report} persona={persona} overviewExtra={<RadarChart summary={summary} />} />;
}
