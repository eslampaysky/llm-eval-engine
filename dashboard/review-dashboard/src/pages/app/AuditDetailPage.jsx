import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCcw, Share2, Download, Monitor, Smartphone, Check, Loader, Shield, ChevronDown, AlertTriangle, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getAuthHeader } from '../../context/AuthContext.jsx';
import { api } from '../../services/api';
import ScoreRing from '../../components/ScoreRing.jsx';
import ConfidenceBar from '../../components/ConfidenceBar.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

const STATUS_STYLES = {
  passed: { label: 'Passed', background: 'rgba(52, 211, 153, 0.12)', color: 'var(--green)', border: '1px solid rgba(52, 211, 153, 0.24)' },
  failed: { label: 'Failed', background: 'rgba(255, 107, 107, 0.12)', color: 'var(--red)', border: '1px solid rgba(255, 107, 107, 0.24)' },
  blocked: { label: 'Blocked', background: 'rgba(251, 191, 36, 0.14)', color: 'var(--amber)', border: '1px solid rgba(251, 191, 36, 0.24)' },
  processing: { label: 'Processing', background: 'rgba(59, 180, 255, 0.12)', color: 'var(--accent)', border: '1px solid rgba(59, 180, 255, 0.24)' },
  canceled: { label: 'Canceled', background: 'rgba(148, 163, 184, 0.14)', color: 'var(--text-muted)', border: '1px solid rgba(148, 163, 184, 0.24)' },
};

const cardStyle = { padding: 20, marginBottom: 24 };
const chip = { padding: '6px 10px', borderRadius: 'var(--radius-full)', fontSize: 12, fontWeight: 700 };
const softPanel = { borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)', padding: 12 };

function normalizeStatus(status) {
  return String(status || 'failed').toLowerCase();
}

function getStatusStyle(status) {
  return STATUS_STYLES[normalizeStatus(status)] || STATUS_STYLES.failed;
}

function formatStepTitle(value) {
  return String(value || 'Step').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStepWeight(step) {
  const key = `${step?.goal || ''} ${step?.step_name || ''}`.toLowerCase();
  if (/(checkout|login|add_to_cart|create_record|register)/.test(key)) return 4;
  if (/(open_product|dashboard|remove_element|add_element)/.test(key)) return 2.5;
  return 1.5;
}

function getConfidenceMeta(score) {
  if (score >= 80) return { label: 'High', tone: 'var(--green)' };
  if (score >= 55) return { label: 'Medium', tone: 'var(--amber)' };
  return { label: 'Low', tone: 'var(--red)' };
}

function deriveAppType(report) {
  const name = String(report?.journey_timeline?.[0]?.journey || '').toLowerCase();
  if (/(cart|checkout)/.test(name)) return 'Ecommerce';
  if (/(login|auth)/.test(name)) return 'SaaS Auth';
  if (/crud/.test(name)) return 'CRUD';
  if (/mutation/.test(name)) return 'DOM Mutation';
  if (/(pricing|features|contact)/.test(name)) return 'Marketing';
  return 'Generic';
}

function buildFailureMessage(step) {
  const failureType = String(step?.failure_type || step?.verification?.failure_type || '').toLowerCase();
  const label = formatStepTitle(step?.goal || step?.step_name || 'step');
  if (failureType === 'blocked_by_bot_protection') return `The site blocked the user during ${label.toLowerCase()}.`;
  if (failureType === 'action_resolution_failed') return `AiBreaker could not find a reliable target for ${label.toLowerCase()}.`;
  if (failureType === 'validation_failed') return `${label} ran, but the expected state change never appeared.`;
  if (failureType === 'navigation_failed') return `${label} did not move the user to the expected page or state.`;
  if (failureType === 'timeout') return `${label} timed out before completion.`;
  return `${label} failed.`;
}

function computeOverview(report) {
  const steps = Array.isArray(report?.step_results) ? report.step_results : [];
  const findings = Array.isArray(report?.findings) ? report.findings : [];
  const reportStatus = normalizeStatus(report?.status);
  const passed = steps.filter((s) => normalizeStatus(s?.status) === 'passed');
  const failed = steps.filter((s) => normalizeStatus(s?.status) === 'failed');
  const blocked = steps.filter((s) => normalizeStatus(s?.status) === 'blocked');
  const resilient = steps.filter((s) => Array.isArray(s?.recovery_attempts) && s.recovery_attempts.length > 0);
  const truth = steps.filter((s) => Array.isArray(s?.notes) && s.notes.some((n) => /overruled by success signals|state verification/i.test(String(n || ''))));
  const totalWeight = steps.reduce((sum, step) => sum + getStepWeight(step), 0);
  const earnedWeight = steps.reduce((sum, step) => {
    const weight = getStepWeight(step);
    const status = normalizeStatus(step?.status);
    if (status === 'passed') return sum + weight;
    if (status === 'blocked') return sum + (weight * 0.25);
    return sum;
  }, 0);
  const weightedScore = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : Math.round(Number(report?.score || 0));
  const confidenceScore = typeof report?.confidence === 'number'
    ? report.confidence
    : clamp(92 - (resilient.length * 5) - (truth.length * 4) - (blocked.length * 14) - (failed.length * 8) + Math.min(passed.length * 2, 8), 18, 96);
  const keyFailures = [...blocked, ...failed].sort((a, b) => getStepWeight(b) - getStepWeight(a)).slice(0, 3);

  return {
    appType: deriveAppType(report),
    weightedScore,
    confidenceScore,
    confidenceMeta: getConfidenceMeta(confidenceScore),
    statusLabel: reportStatus === 'canceled'
      ? 'Canceled'
      : blocked.length > 0 ? 'Blocked by Site' : failed.length > 0 || findings.length > 0 ? 'Issues Found' : 'Working',
    headline: reportStatus === 'canceled'
      ? 'This audit was stopped before it finished.'
      : blocked.length > 0
      ? 'The audit hit live blockers or bot protection on the critical path.'
      : failed.length > 0 || findings.length > 0
        ? 'AiBreaker found user-visible friction in this audit.'
        : 'The planned user journeys completed cleanly.',
    findingsCount: findings.length,
    passedCount: passed.length,
    failedCount: failed.length,
    blockedCount: blocked.length,
    resilienceCount: resilient.length,
    truthCount: truth.length,
    keyFailures,
  };
}

function Metric({ label, value, tone = 'var(--text-primary)' }) {
  return (
    <div style={softPanel}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone }}>{value}</div>
    </div>
  );
}

function ResilienceBadge({ label, value }) {
  if (!value) return null;
  return (
    <span style={{ ...chip, background: 'rgba(59, 180, 255, 0.12)', color: 'var(--accent)', border: '1px solid rgba(59, 180, 255, 0.18)', fontWeight: 600 }}>
      <Shield size={12} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
      {label}: {value}
    </span>
  );
}

function EvidenceDiff({ stepResult }) {
  if (!stepResult?.before_snapshot && !stepResult?.after_snapshot) return null;
  const beforeSnapshot = stepResult.before_snapshot || {};
  const afterSnapshot = stepResult.after_snapshot || {};
  const deltas = Array.isArray(stepResult.evidence_delta) ? stepResult.evidence_delta : [];
  const urlChanged = beforeSnapshot.url && afterSnapshot.url && beforeSnapshot.url !== afterSnapshot.url;
  const titleChanged = beforeSnapshot.title && afterSnapshot.title && beforeSnapshot.title !== afterSnapshot.title;

  return (
    <div>
      <div className="card-label" style={{ marginBottom: 8 }}>Evidence Diff</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div style={{ ...softPanel, background: 'var(--bg-deepest)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Before</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{beforeSnapshot.url || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{beforeSnapshot.title || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{beforeSnapshot.text_snippet || 'No snapshot text'}</div>
        </div>
        <div style={{ ...softPanel, background: urlChanged || titleChanged ? 'rgba(52, 211, 153, 0.05)' : 'var(--bg-deepest)', border: `1px solid ${urlChanged || titleChanged ? 'rgba(52, 211, 153, 0.26)' : 'rgba(255,255,255,0.06)'}` }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', marginBottom: 8 }}>After</div>
          <div style={{ fontSize: 11, color: urlChanged ? 'var(--green)' : 'var(--text-dim)', marginBottom: 6 }}>{afterSnapshot.url || '-'}</div>
          <div style={{ fontSize: 12, color: titleChanged ? 'var(--green)' : 'var(--text-muted)', marginBottom: 8 }}>{afterSnapshot.title || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{afterSnapshot.text_snippet || 'No snapshot text'}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        {deltas.length > 0 ? deltas.map((delta, index) => (
          <span key={`${delta}-${index}`} style={{ ...chip, background: 'rgba(59, 180, 255, 0.12)', color: 'var(--accent)', border: '1px solid rgba(59, 180, 255, 0.18)', fontWeight: 600 }}>{delta}</span>
        )) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No explicit delta recorded.</span>}
      </div>
    </div>
  );
}

export default function AuditDetailPage() {
  const { t } = useTranslation();
  const { auditId } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewport, setViewport] = useState('desktop');
  const [shareToast, setShareToast] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [mediaUrls, setMediaUrls] = useState({ video: '', desktop: '', mobile: '' });

  useEffect(() => {
    setLoading(true);
    api.getAgenticQAStatus(auditId).then((r) => { setReport(r); setError(''); }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [auditId]);

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
        if (data.status === 'done' || data.status === 'failed' || data.status === 'canceled') {
          setReport(data);
          setProgress(null);
          active = false;
        } else {
          setProgress({ current_step: `Status: ${data.status}`, progress_pct: 50 });
        }
      } catch {}
    }
    poll();
    const timer = setInterval(() => { if (active) poll(); else clearInterval(timer); }, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [report?.status, auditId]);

  useEffect(() => {
    if (!report) return;
    const urlsToRevoke = [];
    let cancelled = false;
    async function loadProtectedAsset(relativePath, key) {
      if (!relativePath) return;
      try {
        const res = await fetch(`${api.baseUrl}${relativePath}`, { headers: { ...getAuthHeader(), 'X-API-KEY': api.getApiKey() } });
        if (!res.ok) return;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        urlsToRevoke.push(objectUrl);
        if (!cancelled) setMediaUrls((prev) => ({ ...prev, [key]: objectUrl }));
      } catch {}
    }
    setMediaUrls({ video: '', desktop: '', mobile: '' });
    loadProtectedAsset(report.video_url, 'video');
    loadProtectedAsset(report.desktop_screenshot_url, 'desktop');
    loadProtectedAsset(report.mobile_screenshot_url, 'mobile');
    return () => {
      cancelled = true;
      urlsToRevoke.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [report]);

  const overview = useMemo(() => computeOverview(report), [report]);

  async function handleShare() {
    if (shareBusy) return;
    setShareBusy(true);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/audits/${auditId}`);
      setShareToast(true);
      setTimeout(() => setShareToast(false), 2500);
    } catch {} finally {
      setShareBusy(false);
    }
  }

  async function downloadPdf() {
    if (!report?.audit_id || pdfBusy) return;
    setPdfBusy(true);
    setPdfError('');
    try {
      const res = await fetch(`${api.baseUrl}/report/${encodeURIComponent(report.audit_id)}/pdf`, { headers: { ...getAuthHeader(), 'X-API-KEY': api.getApiKey() } });
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
      setPdfError(err?.message || t('audit.detail.pdfFailed', 'Failed to download PDF.'));
    } finally {
      setPdfBusy(false);
    }
  }

  async function handleCancel() {
    if (!report?.audit_id || cancelBusy) return;
    setCancelBusy(true);
    try {
      const response = await api.cancelAgenticQA(report.audit_id);
      setReport((prev) => prev ? { ...prev, status: response?.status || 'canceled', summary: prev.summary || 'Canceled by user' } : prev);
      setProgress(null);
      setError('');
    } catch (err) {
      setError(err?.message || t('audit.detail.stopAudit', 'Stop Audit'));
    } finally {
      setCancelBusy(false);
    }
  }

  if (loading) return <div className="page-container fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><Loader size={28} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} /></div>;
  if (error) return <div className="page-container fade-in"><div className="error-box">{t('audit.detail.errorPrefix', 'Error:')} {error}</div></div>;
  if (!report) return <div className="page-container fade-in"><div className="error-box">{t('audit.detail.notFound', 'Audit not found.')}</div></div>;

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const journeyTimeline = Array.isArray(report.journey_timeline) ? report.journey_timeline : [];
  const stepResults = Array.isArray(report.step_results) ? report.step_results : [];
  const tier = (report.tier || 'vibe').replace(/^\w/, (c) => c.toUpperCase());
  const screenshotUrl = viewport === 'desktop' ? mediaUrls.desktop : mediaUrls.mobile;
  const canCancel = report.status === 'processing' || report.status === 'queued';

  return (
    <div className="page-container fade-in">
      {(report.status === 'processing' || report.status === 'queued') && (
        <div className="card" style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <div className="card-label" style={{ marginBottom: 0 }}>{t('audit.detail.progressTitle', 'Audit Progress')}</div>
            <button className="btn btn-ghost" onClick={handleCancel} disabled={cancelBusy} style={{ color: 'var(--red)', borderColor: 'rgba(255,107,107,0.2)' }}>
              <Square size={14} />
              {cancelBusy ? t('audit.detail.stopping', 'Stopping...') : t('audit.detail.stopAudit', 'Stop Audit')}
            </button>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{progress?.current_step || t('audit.loadingSteps.processing', 'Processing...')}</div>
          <div style={{ height: 6, borderRadius: 'var(--radius-full)', background: 'var(--bg-surface)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progress?.progress_pct || 0}%`, background: 'var(--accent)', transition: 'width 0.4s ease' }} />
          </div>
        </div>
      )}

      <div className="card" style={{ ...cardStyle, background: 'linear-gradient(145deg, rgba(59,180,255,0.08), rgba(52,211,153,0.05))', border: '1px solid rgba(59,180,255,0.14)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24, flexWrap: 'wrap' }}>
          <ScoreRing score={overview.weightedScore} size={108} label="/100" />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="page-eyebrow">{t('audit.detail.labels.auditReport', 'Audit Report')}</div>
            <h1 className="page-title" style={{ fontSize: 24, marginBottom: 8 }}>{report.url || 'Unknown URL'}</h1>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
              <span className="badge badge-blue">{tier}</span>
              <span className="badge badge-green">{overview.appType}</span>
              <span style={{ ...chip, ...getStatusStyle(report.status) }}>{overview.statusLabel}</span>
              {report.created_at && <span style={{ fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>{new Date(report.created_at).toLocaleString()}</span>}
            </div>
            <div style={{ fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 14 }}>{overview.headline}</div>
            <ConfidenceBar score={overview.confidenceScore} label={`Confidence: ${overview.confidenceMeta.label}`} subject="this audit" />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <ResilienceBadge label="Self-healed steps" value={overview.resilienceCount} />
              <ResilienceBadge label="Truth over exception" value={overview.truthCount} />
              <ResilienceBadge label="Blocked steps" value={overview.blockedCount} />
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 20 }}>
          <Metric label="Weighted score" value={`${overview.weightedScore}/100`} tone="var(--accent)" />
          <Metric label="Confidence" value={overview.confidenceMeta.label} tone={overview.confidenceMeta.tone} />
          <Metric label="Passed steps" value={overview.passedCount} tone="var(--green)" />
          <Metric label="Failed steps" value={overview.failedCount} tone={overview.failedCount ? 'var(--red)' : 'var(--text-primary)'} />
          <Metric label="Findings" value={overview.findingsCount} tone={overview.findingsCount ? 'var(--amber)' : 'var(--text-primary)'} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost"><RotateCcw size={14} /> {t('audit.detail.reRun', 'Re-run')}</button>
        {canCancel && <button className="btn btn-ghost" onClick={handleCancel} disabled={cancelBusy} style={{ color: 'var(--red)', borderColor: 'rgba(255,107,107,0.2)' }}><Square size={14} /> {cancelBusy ? t('audit.detail.stopping', 'Stopping...') : t('audit.detail.stop', 'Stop')}</button>}
        <button className="btn btn-ghost" onClick={handleShare} disabled={shareBusy}><Share2 size={14} /> {shareBusy ? t('audit.detail.sharing', 'Sharing...') : t('audit.detail.share', 'Share')}</button>
        <button className="btn btn-ghost" onClick={downloadPdf} disabled={pdfBusy}><Download size={14} /> {pdfBusy ? t('audit.detail.downloading', 'Downloading...') : t('audit.detail.downloadPdf', 'Download PDF')}</button>
      </div>

      {shareToast && <div className="toast"><Check size={14} style={{ color: 'var(--green)' }} /> {t('audit.detail.linkCopied', 'Link copied to clipboard')}</div>}
      {pdfError && <div className="error-box">{pdfError}</div>}

      {overview.keyFailures.length > 0 && (
        <div className="card" style={cardStyle}>
          <div className="card-label" style={{ marginBottom: 14 }}>{t('audit.detail.keyFailures', 'Key Failures')}</div>
          <div style={{ display: 'grid', gap: 12 }}>
            {overview.keyFailures.map((step, index) => (
              <div key={`${step.goal || step.step_name}-${index}`} style={{ ...softPanel, border: '1px solid rgba(255,107,107,0.16)', background: 'rgba(255,107,107,0.06)' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>{formatStepTitle(step.goal || step.step_name || 'Step')}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{buildFailureMessage(step)}</div>
                <span className="badge badge-amber">{String(step.failure_type || step.verification?.failure_type || 'unknown_failure').replace(/_/g, ' ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.video_url && (
        <div className="card" style={cardStyle}>
          <div className="card-label">{t('audit.detail.videoReplay', 'Video Replay')}</div>
          {mediaUrls.video ? <video controls src={mediaUrls.video} style={{ width: '100%', borderRadius: 'var(--radius-md)', background: '#000' }} /> : <div style={{ width: '100%', minHeight: 180, borderRadius: 'var(--radius-md)', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: 13 }}>{t('audit.detail.loadingVideo', 'Loading video replay...')}</div>}
        </div>
      )}

      <div className="card" style={cardStyle}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button className={viewport === 'desktop' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setViewport('desktop')} style={{ padding: '6px 14px', fontSize: 12 }}><Monitor size={14} /> {t('common.desktop', 'Desktop')}</button>
          <button className={viewport === 'mobile' ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setViewport('mobile')} style={{ padding: '6px 14px', fontSize: 12 }}><Smartphone size={14} /> {t('common.mobile', 'Mobile')}</button>
        </div>
        <div style={{ background: 'var(--bg-deepest)', borderRadius: 'var(--radius-md)', height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--line)' }}>
          {screenshotUrl ? <img src={screenshotUrl} alt={t('audit.detail.screenshotAlt', 'Screenshot')} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 'var(--radius-md)' }} /> : <span style={{ fontSize: 13, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{viewport === 'desktop' ? '1280x800' : '390x844'} screenshot</span>}
        </div>
      </div>

      {report.summary && <div className="card" style={cardStyle}><div className="card-label">{t('common.summary', 'Summary')}</div><p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{report.summary}</p></div>}

      {journeyTimeline.length > 0 && (
        <div className="card" style={cardStyle}>
          <div className="card-label" style={{ marginBottom: 16 }}>{t('audit.detail.journeyTimeline', 'Journey Timeline')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {journeyTimeline.map((journey, index) => {
              const journeyStatus = getStatusStyle(journey.status);
              const { label, ...style } = journeyStatus;
              return (
                <div key={`${journey.journey || 'journey'}-${index}`} style={{ border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
                  <div style={{ padding: 16, borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>{formatStepTitle(journey.journey)}</div>
                      {journey.reason && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{journey.reason}</div>}
                    </div>
                    <span style={{ ...style, ...chip }}>{label}</span>
                  </div>
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(journey.steps || []).map((step, stepIndex) => {
                      const relatedStepResult = stepResults.find((result) => String(result.step_name || result.goal || '').toLowerCase() === String(step.step || '').toLowerCase());
                      const recoveryEvents = Array.isArray(relatedStepResult?.recovery_attempts) ? relatedStepResult.recovery_attempts : [];
                      const notes = Array.isArray(relatedStepResult?.notes) ? relatedStepResult.notes : [];
                      const stepStyle = getStatusStyle(step.status || relatedStepResult?.status || relatedStepResult?.failure_type || step.failure_type);
                      const { label: stepLabel, ...statusStyle } = stepStyle;
                      return (
                        <details key={`${step.step || 'step'}-${stepIndex}`} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 'var(--radius-md)', background: 'var(--bg-elevated)' }}>
                          <summary style={{ listStyle: 'none', cursor: 'pointer', padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{ ...statusStyle, ...chip, fontSize: 11 }}>{stepLabel}</span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{formatStepTitle(step.step)}</span>
                              {recoveryEvents.length > 0 && <ResilienceBadge label="Self-healed" value={recoveryEvents.length} />}
                            </div>
                            <ChevronDown size={16} style={{ color: 'var(--text-dim)' }} />
                          </summary>
                          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {(notes.length > 0 || recoveryEvents.length > 0) && (
                              <div style={{ ...softPanel, background: 'rgba(59, 180, 255, 0.06)', border: '1px solid rgba(59, 180, 255, 0.16)' }}>
                                <div className="card-label" style={{ color: 'var(--accent)', marginBottom: 8 }}>Resilience Story</div>
                                {notes.map((note, noteIndex) => <div key={noteIndex} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{note}</div>)}
                                {recoveryEvents.map((event, eventIndex) => (
                                  <div key={eventIndex} style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {event.notes || `${formatStepTitle(event.blocker_type || 'blocker')} at ${String(event.choke_point || 'before_action').replace(/_/g, ' ')}`}
                                  </div>
                                ))}
                              </div>
                            )}
                            <EvidenceDiff stepResult={relatedStepResult} />
                            {relatedStepResult?.failure_type === 'blocked_by_bot_protection' && (
                              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 'var(--radius-md)', background: 'rgba(251, 191, 36, 0.12)', border: '1px solid rgba(251, 191, 36, 0.22)', padding: 12, color: 'var(--amber)' }}>
                                <AlertTriangle size={16} />
                                <div style={{ fontSize: 13 }}>Site blocked the agent with bot protection. This is a site configuration issue, not an AiBreaker execution failure.</div>
                              </div>
                            )}
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {report.bundled_fix_prompt && findings.length === 0 ? (
        <div className="slide-up" style={{ marginBottom: 32 }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(59, 180, 255, 0.08), rgba(52, 211, 153, 0.05))', border: '2px solid rgba(59, 180, 255, 0.2)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16 }}>
            <div className="card-label" style={{ color: 'var(--accent)', marginBottom: 16 }}>{t('audit.detail.fixPlan', 'AI-Generated Fix Plan')}</div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 20, background: 'var(--bg-deepest)', padding: 16, borderRadius: 'var(--radius-md)' }}>{report.bundled_fix_prompt}</pre>
            <CopyButton text={report.bundled_fix_prompt} label={t('audit.detail.copyFixPlan', 'Copy AI Fix Plan')} size="lg" />
          </div>
        </div>
      ) : report.bundled_fix_prompt ? <div style={{ marginBottom: 24 }}><CopyButton text={report.bundled_fix_prompt} label={t('audit.detail.copyAllFixPrompts', 'Copy All Fix Prompts')} size="lg" /></div> : null}

      {findings.length > 0 && (
        <>
          <div className="card-label" style={{ marginBottom: 12 }}>{t('audit.detail.findingsTitle', 'Findings ({{count}})', { count: findings.length })}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {findings.map((f, i) => <FindingCard key={i} severity={f.severity || 'info'} category={f.category} title={f.title || f.summary || 'Finding'} description={f.description} fixPrompt={f.fix_prompt || f.fixPrompt} />)}
          </div>
          <CopyButton text={findings.filter((f) => f.fix_prompt || f.fixPrompt).map((f, i) => `${i + 1}. ${f.title || f.summary}\n${f.fix_prompt || f.fixPrompt}`).join('\n\n')} label={t('audit.detail.copyAllFixPrompts', 'Copy All Fix Prompts')} size="lg" />
        </>
      )}
    </div>
  );
}
