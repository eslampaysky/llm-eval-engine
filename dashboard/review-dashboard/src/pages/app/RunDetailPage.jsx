import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReportPage, api } from '../../App.jsx';
import { useAppShell } from '../../context/AppShellContext.jsx';

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

  return <ReportPage report={report} persona={persona} />;
}
