<<<<<<< HEAD
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { RotateCcw, Share2, Download, Monitor, Smartphone, Check } from 'lucide-react';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

export default function AuditDetailPage() {
  const { auditId } = useParams();
  const [viewport, setViewport] = useState('desktop');
  const [shareToast, setShareToast] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/report/${auditId}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    } catch {}
  };

  return (
    <div className="page-container fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        <ScoreRing score={83} size={100} label="/100" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="page-eyebrow">Audit Report</div>
          <h1 className="page-title" style={{ fontSize: 24 }}>myapp.vercel.app</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-blue">Vibe Check</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mar 18, 2026</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost"><RotateCcw size={14} /> Re-run</button>
        <button className="btn btn-ghost" onClick={handleShare}><Share2 size={14} /> Share</button>
        <button className="btn btn-ghost"><Download size={14} /> Download PDF</button>
      </div>

      {shareToast && <div className="toast"><Check size={14} style={{ color: 'var(--green)' }} /> Link copied to clipboard</div>}

      {/* Screenshots */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={viewport === 'desktop' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setViewport('desktop')} style={{ padding: '6px 14px', fontSize: 12 }}>
            <Monitor size={14} /> Desktop
          </button>
          <button className={viewport === 'mobile' ? 'btn btn-primary' : 'btn btn-ghost'}
            onClick={() => setViewport('mobile')} style={{ padding: '6px 14px', fontSize: 12 }}>
            <Smartphone size={14} /> Mobile
          </button>
        </div>
        <div style={{
          background: 'var(--bg-deepest)', borderRadius: 'var(--radius-md)', height: 300,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid var(--line)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {viewport === 'desktop' ? '1280×800' : '390×844'} screenshot
          </span>
        </div>
      </div>

      {/* Findings */}
      <div className="card-label" style={{ marginBottom: 12 }}>Findings (3)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <FindingCard severity="critical" category="flow" title="Navigation dropdown not accessible on mobile"
          description="Hamburger menu touch events fail below 390px." fixPrompt="Add touch-action: manipulation to the nav button." />
        <FindingCard severity="warning" category="layout" title="Content overflows horizontally"
          fixPrompt="Add overflow-x: hidden to main wrapper." />
        <FindingCard severity="info" category="accessibility" title="2 form inputs missing labels" />
      </div>

      <CopyButton text="1. Fix nav dropdown\n2. Fix overflow\n3. Add form labels" label="Copy All Fix Prompts" size="lg" />
    </div>
=======
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

export default function AuditDetailPage() {
  const { auditId } = useParams();
  const { persona, report, setReport } = useAppShell();
  const [loading, setLoading] = useState(!report || report.report_id !== auditId);
  const [error, setError] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (report?.report_id === auditId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    api.getReport(auditId)
      .then((nextReport) => {
        setReport(nextReport);
        setError('');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [auditId, report?.report_id, setReport]);

  useEffect(() => {
    if (!report || report.status !== 'processing') {
      setProgress(null);
      return;
    }
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/report/${encodeURIComponent(auditId)}/progress`);
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
  }, [report, auditId]);

  if (loading) return <div className="page"><div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div></div>;
  if (error) return <div className="page"><div className="err-box">⚠ {error}</div></div>;
  if (!report) return <div className="page"><div className="empty">Audit not found.</div></div>;

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
            <div className="card-label">Audit progress</div>
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
              <div className="card-label">Public audit link</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)' }}>{publicUrl}</div>
              {shareError && <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{shareError}</div>}
            </div>
            <button className="btn btn-primary" onClick={shareReport} disabled={shareBusy}>
              {shareCopied ? 'Copied' : shareBusy ? 'Sharing...' : 'Share Audit'}
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
>>>>>>> 952b221998466c82308faa3bf4986c92c664747d
  );
}
