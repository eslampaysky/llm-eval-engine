import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { API_BASE, ReportPage, SHARE_BASE, api, getApiKey } from '../../App.jsx';
import { getAuthHeader } from '../../context/AuthContext.jsx';
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
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [progress, setProgress] = useState(null);

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

  useEffect(() => {
    if (!report || report.status !== 'processing') {
      setProgress(null);
      return;
    }
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/report/${encodeURIComponent(runId)}/progress`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setProgress(data);
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [report, runId]);

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>;
  if (error) return <div className="page"><div className="err-box">⚠ {error}</div></div>;
  if (!report) return <div className="page"><div className="empty">Run not found.</div></div>;

  const publicUrl = `${typeof window !== 'undefined' ? window.location.origin : SHARE_BASE}/report/${report.report_id}`;
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

  const shareReport = async () => {
    if (!report?.report_id || shareBusy) return;
    setShareBusy(true);
    setShareError('');
    try {
      await api.shareReport(report.report_id);
      const url = publicUrl;
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        window.prompt('Copy report URL', url);
      }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch (err) {
      setShareError(err?.message || 'Failed to share report.');
    } finally {
      setShareBusy(false);
    }
  };

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
      {report.status === 'processing' && progress && (
        <div className="page fade-in" style={{ paddingBottom: 0 }}>
          <div className="card">
            <div className="card-label">Run progress</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>
              {progress.current_step || 'Processing'} 
            </div>
            <div style={{ height: 6, borderRadius: 999, background: 'var(--bg0)', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progress.progress_pct || 0}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--mid)', marginTop: 8 }}>
              Step {progress.steps_done || 0} of {progress.steps_total || 0} · {progress.elapsed_seconds || 0}s elapsed
            </div>
          </div>
        </div>
      )}
      {report.status === 'done' && (
        <div className="page fade-in" style={{ paddingBottom: 0 }}>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div className="card-label">Public report link</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)' }}>{publicUrl}</div>
              {shareError && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{shareError}</div>}
            </div>
            <button className="btn btn-primary" onClick={shareReport} disabled={shareBusy}>
              {shareCopied ? 'Copied' : shareBusy ? 'Sharing...' : 'Share Report'}
            </button>
          </div>
        </div>
      )}
      <ReportPage report={report} persona={persona} overviewExtra={<RadarChart summary={summary} />} />
      {report.status === 'done' && (
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
