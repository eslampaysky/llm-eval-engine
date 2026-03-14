import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ReportPage, apiFetch } from '../../App.jsx';

export default function PublicReportPage() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setStatus('loading');
    setError('');

    apiFetch(`/report/${encodeURIComponent(reportId)}`, {}, false)
      .then((data) => {
        if (!active) return;
        if (data?.status && data.status !== 'done' && !data.report_id) {
          setStatus(data.status || 'processing');
          setReport(null);
          return;
        }
        setReport(data);
        setStatus('done');
      })
      .catch((err) => {
        if (!active) return;
        setError(err?.message || 'Report not found.');
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reportId]);

  if (status === 'loading') {
    return (
      <div className="page">
        <div className="empty">
          <div className="spinner" style={{ margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (status !== 'done') {
    const statusMessage = status && status !== 'processing'
      ? `Report status: ${status}.`
      : 'Report is still processing. Please refresh in a moment.';
    return (
      <div className="page">
        <div className="empty">
          {error ? `Warning: ${error}` : statusMessage}
        </div>
      </div>
    );
  }

  return <ReportPage report={report} persona="dev" />;
}
