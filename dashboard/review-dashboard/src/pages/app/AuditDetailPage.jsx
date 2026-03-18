import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCcw, Share2, Download, Monitor, Smartphone, Check, Loader } from 'lucide-react';
import { API_BASE, SHARE_BASE, getApiKey } from '../../App.jsx';
import { getAuthHeader } from '../../context/AuthContext.jsx';
import { api } from '../../services/api';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

export default function AuditDetailPage() {
  const { auditId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState('desktop');
  const [shareToast, setShareToast] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [progress, setProgress] = useState(null);

  // Fetch report — use agentic QA status endpoint (the correct one)
  useEffect(() => {
    setLoading(true);
    api.getAgenticQAStatus(auditId)
      .then((r) => { setReport(r); setError(''); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [auditId]);

  // Poll for results while processing
  useEffect(() => {
    if (!report || (report.status !== 'processing' && report.status !== 'queued')) {
      setProgress(null);
      return;
    }
    let active = true;
    async function poll() {
      try {
        const data = await api.getAgenticQAStatus(auditId);
        if (!active) return;
        if (data.status === 'done' || data.status === 'failed') {
          setReport(data);
          setProgress(null);
        } else {
          setProgress({ current_step: `Status: ${data.status}`, progress_pct: 50 });
        }
      } catch {}
    }
    poll();
    const timer = setInterval(poll, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [report?.status, auditId]);

  const handleShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const url = `${window.location.origin}/app/audits/${auditId}`;
      await navigator.clipboard.writeText(url);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    } catch {} finally { setShareBusy(false); }
  };

  const downloadPdf = async () => {
    if (!report?.audit_id || pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      const res = await fetch(`${API_BASE}/report/${encodeURIComponent(report.audit_id)}/pdf`, {
        headers: { ...getAuthHeader(), 'X-API-KEY': getApiKey() },
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename=([^;]+)/i);
      const filename = match ? match[1].replace(/"/g, '') : `aibreaker-audit-${report.audit_id}.pdf`;
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
    } finally { setPdfBusy(false); }
  };

  if (loading) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />
      </div>
    );
  }
  if (error) return <div className="page-container fade-in"><div className="error-box">⚠ {error}</div></div>;
  if (!report) return <div className="page-container fade-in"><div className="error-box">Audit not found.</div></div>;

  const score = report.score ?? 0;
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const tier = (report.tier || 'vibe').replace(/^\w/, (c) => c.toUpperCase());

  // Build screenshot URL from base64 or URL fields
  const screenshotUrl = viewport === 'desktop'
    ? report.desktop_screenshot_url
    : report.mobile_screenshot_url;

  return (
    <div className="page-container fade-in">
      {/* Progress bar for processing */}
      {(report.status === 'processing' || report.status === 'queued') && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="card-label">Audit Progress</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {progress?.current_step || 'Processing…'}
          </div>
          <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${progress?.progress_pct || 0}%`,
              background: 'var(--accent)', transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 28 }}>
        <ScoreRing score={score} size={100} label="/100" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="page-eyebrow">Audit Report</div>
          <h1 className="page-title" style={{ fontSize: 24 }}>{report.url || 'Unknown URL'}</h1>
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            <span className="badge badge-blue">{tier}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {report.created_at ? new Date(report.created_at).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost"><RotateCcw size={14} /> Re-run</button>
        <button className="btn btn-ghost" onClick={handleShare} disabled={shareBusy}>
          <Share2 size={14} /> {shareBusy ? 'Sharing…' : 'Share'}
        </button>
        <button className="btn btn-ghost" onClick={downloadPdf} disabled={pdfBusy}>
          <Download size={14} /> {pdfBusy ? 'Downloading…' : 'Download PDF'}
        </button>
      </div>

      {shareToast && <div className="toast"><Check size={14} style={{ color: 'var(--green)' }} /> Link copied to clipboard</div>}
      {pdfError && <div className="error-box">{pdfError}</div>}

      {/* Video (deep/fix tiers) */}
      {report.video_url && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="card-label">Video Replay</div>
          <video
            controls
            src={`${API_BASE}${report.video_url}`}
            style={{ width: '100%', borderRadius: 'var(--radius-md)', background: '#000' }}
          />
        </div>
      )}

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
          {screenshotUrl ? (
            <img src={`${API_BASE}${screenshotUrl}`} alt="Screenshot"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {viewport === 'desktop' ? '1280×800' : '390×844'} screenshot
            </span>
          )}
        </div>
      </div>

      {/* Summary */}
      {report.summary && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="card-label">Summary</div>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{report.summary}</p>
        </div>
      )}

      {/* Bundled fix prompt */}
      {report.bundled_fix_prompt && findings.length === 0 ? (
        <div className="slide-up" style={{ marginBottom: 32 }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))',
            border: '2px solid rgba(59, 180, 255, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            marginBottom: 16,
          }}>
            <div className="card-label" style={{ color: 'var(--accent)', marginBottom: 16 }}>AI-Generated Fix Plan</div>
            <pre style={{
              fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)',
              lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 20,
              background: 'var(--bg-deepest)', padding: 16, borderRadius: 'var(--radius-md)'
            }}>
              {report.bundled_fix_prompt}
            </pre>
            <CopyButton text={report.bundled_fix_prompt} label="Copy AI Fix Plan" size="lg" />
          </div>
          
          <div style={{
            background: 'rgba(52, 211, 153, 0.1)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            color: 'var(--green)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontWeight: 500
          }}>
            <Check size={20} />
            No critical bugs detected — but here are AI-recommended improvements to make your app more robust
          </div>
        </div>
      ) : report.bundled_fix_prompt ? (
        <div style={{ marginBottom: 24 }}>
          <CopyButton text={report.bundled_fix_prompt} label="Copy All Fix Prompts" size="lg" />
        </div>
      ) : null}

      {/* Findings */}
      {findings.length > 0 && (
        <>
          <div className="card-label" style={{ marginBottom: 12 }}>Findings ({findings.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {findings.map((f, i) => (
              <FindingCard
                key={i}
                severity={f.severity || 'info'}
                category={f.category}
                title={f.title || f.summary || 'Finding'}
                description={f.description}
                fixPrompt={f.fix_prompt || f.fixPrompt}
              />
            ))}
          </div>
          <CopyButton
            text={findings.filter(f => f.fix_prompt || f.fixPrompt).map((f, i) => `${i+1}. ${f.title || f.summary}\n${f.fix_prompt || f.fixPrompt}`).join('\n\n')}
            label="Copy All Fix Prompts"
            size="lg"
          />
        </>
      )}
    </div>
  );
}
