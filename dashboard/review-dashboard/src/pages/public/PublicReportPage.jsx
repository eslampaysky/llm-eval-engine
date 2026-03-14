import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE, ReportPage, apiFetch, getApiKey } from '../../App.jsx';
import { getAuthHeader } from '../../context/AuthContext.jsx';

export default function PublicReportPage() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');

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

  const downloadPdf = async () => {
    if (!report?.report_id || pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      const res = await fetch(`${API_BASE}/report/${encodeURIComponent(report.report_id)}/pdf`, {
        headers: {
          ...getAuthHeader(),
          'X-API-KEY': getApiKey(),
        },
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename=([^;]+)/i);
      const filename = match ? match[1].replace(/\"/g, '') : `aibreaker-audit-${report.report_id}.pdf`;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(err?.message || 'Failed to download PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <ReportPage report={report} persona="dev" />
      {report?.status === 'done' && (
        <div className="page fade-in" style={{ paddingTop: 0 }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div className="card-label">Audit export</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)' }}>
                Download a PDF version for enterprise audits.
              </div>
              {pdfError && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{pdfError}</div>}
            </div>
            <button className="btn btn-primary" onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? 'Downloading...' : 'Download PDF Audit Report'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
