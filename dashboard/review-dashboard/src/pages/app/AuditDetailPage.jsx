import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RotateCcw, Share2, Download, Monitor, Smartphone, Check, Loader, Shield, ChevronDown, AlertTriangle } from 'lucide-react';
import { getAuthHeader } from '../../context/AuthContext.jsx';
import { api } from '../../services/api';
import ScoreRing from '../../components/ScoreRing.jsx';
import FindingCard from '../../components/FindingCard.jsx';
import CopyButton from '../../components/CopyButton.jsx';

const STATUS_STYLES = {
  passed: {
    label: 'Passed',
    background: 'rgba(52, 211, 153, 0.12)',
    color: 'var(--green)',
    border: '1px solid rgba(52, 211, 153, 0.24)',
  },
  failed: {
    label: 'Failed',
    background: 'rgba(255, 107, 107, 0.12)',
    color: 'var(--red)',
    border: '1px solid rgba(255, 107, 107, 0.24)',
  },
  blocked: {
    label: 'Blocked',
    background: 'rgba(251, 191, 36, 0.14)',
    color: 'var(--amber)',
    border: '1px solid rgba(251, 191, 36, 0.24)',
  },
  processing: {
    label: 'Processing',
    background: 'rgba(59, 180, 255, 0.12)',
    color: 'var(--accent)',
    border: '1px solid rgba(59, 180, 255, 0.24)',
  },
};

function normalizeStatus(status) {
  return String(status || 'failed').toLowerCase();
}

function getStatusStyle(status) {
  return STATUS_STYLES[normalizeStatus(status)] || STATUS_STYLES.failed;
}

function formatStepTitle(value) {
  return String(value || 'Step')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function formatRecoveryLabel(event) {
  if (!event) return 'Recovery event';
  const blocker = String(event.blocker_type || 'unknown_blocker').replace(/_/g, ' ');
  const chokePoint = String(event.choke_point || 'before_action').replace(/_/g, ' ');
  return `${blocker.replace(/^\w/, (c) => c.toUpperCase())} • ${chokePoint}`;
}

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
  const [mediaUrls, setMediaUrls] = useState({ video: '', desktop: '', mobile: '' });

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
      const res = await fetch(`${api.baseUrl}/report/${encodeURIComponent(report.audit_id)}/pdf`, {
        headers: { ...getAuthHeader(), 'X-API-KEY': api.getApiKey() },
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

  useEffect(() => {
    if (!report) return;
    const urlsToRevoke = [];
    let cancelled = false;

    async function loadProtectedAsset(relativePath, key) {
      if (!relativePath) return;
      try {
        const res = await fetch(`${api.baseUrl}${relativePath}`, {
          headers: {
            ...getAuthHeader(),
            'X-API-KEY': api.getApiKey(),
          },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        urlsToRevoke.push(objectUrl);
        if (!cancelled) {
          setMediaUrls((prev) => ({ ...prev, [key]: objectUrl }));
        }
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
  const journeyTimeline = Array.isArray(report.journey_timeline) ? report.journey_timeline : [];
  const stepResults = Array.isArray(report.step_results) ? report.step_results : [];

  // Build screenshot URL from base64 or URL fields
  const screenshotUrl = viewport === 'desktop'
    ? mediaUrls.desktop
    : mediaUrls.mobile;

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
          {mediaUrls.video ? (
            <video
              controls
              src={mediaUrls.video}
              style={{ width: '100%', borderRadius: 'var(--radius-md)', background: '#000' }}
            />
          ) : (
            <div style={{
              width: '100%', minHeight: 180, borderRadius: 'var(--radius-md)', background: '#000',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)',
              fontSize: 13,
            }}>
              Loading video replay…
            </div>
          )}
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
            <img src={screenshotUrl} alt="Screenshot"
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

      {/* Journey timeline */}
      {journeyTimeline.length > 0 && (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <div className="card-label" style={{ marginBottom: 16 }}>Journey Timeline</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {journeyTimeline.map((journey, index) => {
              const journeyStatus = getStatusStyle(journey.status);
              const { label: journeyLabel, ...journeyStyle } = journeyStatus;
              return (
                <div
                  key={`${journey.journey || 'journey'}-${index}`}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'rgba(255,255,255,0.02)',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatStepTitle(journey.journey)}
                        </div>
                        {journey.reason && (
                          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>
                            {journey.reason}
                          </div>
                        )}
                      </div>
                      <span style={{
                        ...journeyStyle,
                        fontSize: 12,
                        fontWeight: 600,
                        borderRadius: 'var(--radius-full)',
                        padding: '6px 10px',
                      }}>
                        {journeyLabel}
                      </span>
                    </div>
                  </div>

                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(journey.steps || []).map((step, stepIndex) => {
                      const stepStatus = getStatusStyle(step.status || step.failure_type);
                      const { label: stepLabel, ...stepStyle } = stepStatus;
                      const relatedStepResult = stepResults.find(
                        (result) =>
                          String(result.step_name || result.goal || '').toLowerCase() ===
                          String(step.step || '').toLowerCase()
                      );
                      const recoveryEvents = Array.isArray(relatedStepResult?.recovery_attempts)
                        ? relatedStepResult.recovery_attempts
                        : Array.isArray(step.recovery_attempts)
                          ? step.recovery_attempts
                          : [];
                      const notes = Array.isArray(relatedStepResult?.notes) ? relatedStepResult.notes : [];

                      return (
                        <details
                          key={`${step.step || 'step'}-${stepIndex}`}
                          style={{
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-elevated)',
                          }}
                        >
                          <summary style={{
                            listStyle: 'none',
                            cursor: 'pointer',
                            padding: 14,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 12,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                              <span style={{
                                ...stepStyle,
                                fontSize: 11,
                                fontWeight: 700,
                                borderRadius: 'var(--radius-full)',
                                padding: '4px 8px',
                              }}>
                                {stepLabel}
                              </span>
                              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                {formatStepTitle(step.step)}
                              </span>
                              {recoveryEvents.length > 0 && (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  padding: '4px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'rgba(59, 180, 255, 0.12)',
                                  color: 'var(--accent)',
                                  fontSize: 11,
                                  fontWeight: 600,
                                }}>
                                  <Shield size={12} />
                                  Resilience
                                </span>
                              )}
                            </div>
                            <ChevronDown size={16} style={{ color: 'var(--text-dim)' }} />
                          </summary>

                          <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {(notes.length > 0 || recoveryEvents.length > 0) && (
                              <div style={{
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(59, 180, 255, 0.06)',
                                border: '1px solid rgba(59, 180, 255, 0.16)',
                                padding: 12,
                              }}>
                                <div className="card-label" style={{ color: 'var(--accent)', marginBottom: 8 }}>
                                  Resilience Story
                                </div>
                                {notes.map((note, noteIndex) => (
                                  <div key={noteIndex} style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                                    {note}
                                  </div>
                                ))}
                                {recoveryEvents.map((event, eventIndex) => (
                                  <details key={eventIndex} style={{ marginTop: 8 }}>
                                    <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)' }}>
                                      {event.notes || formatRecoveryLabel(event)}
                                    </summary>
                                    <div style={{
                                      marginTop: 8,
                                      padding: 10,
                                      borderRadius: 'var(--radius-md)',
                                      background: 'var(--bg-deepest)',
                                      fontSize: 12,
                                      color: 'var(--text-secondary)',
                                      fontFamily: 'var(--font-mono)',
                                      display: 'grid',
                                      gap: 4,
                                    }}>
                                      <div>Type: {event.blocker_type || 'unknown_blocker'}</div>
                                      <div>When: {event.choke_point || 'before_action'}</div>
                                      <div>Action: {event.action_taken || 'unknown'}</div>
                                      <div>Success: {String(event.success)}</div>
                                      <div>Selector: {event.selector_used || '—'}</div>
                                    </div>
                                  </details>
                                ))}
                              </div>
                            )}

                            {(step.evidence_delta?.length > 0 || relatedStepResult?.evidence_delta?.length > 0) && (
                              <div>
                                <div className="card-label" style={{ marginBottom: 8 }}>Evidence</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {(relatedStepResult?.evidence_delta || step.evidence_delta || []).map((delta, deltaIndex) => (
                                    <div
                                      key={deltaIndex}
                                      style={{
                                        padding: '10px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        fontSize: 13,
                                        color: 'var(--text-secondary)',
                                      }}
                                    >
                                      {delta}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(relatedStepResult?.before_snapshot || relatedStepResult?.after_snapshot) && (
                              <div>
                                <div className="card-label" style={{ marginBottom: 8 }}>Snapshot Proof</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                  {relatedStepResult?.before_snapshot && (
                                    <div style={{
                                      borderRadius: 'var(--radius-md)',
                                      border: '1px solid rgba(255,255,255,0.06)',
                                      background: 'var(--bg-deepest)',
                                      padding: 12,
                                    }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Before</div>
                                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                                        {relatedStepResult.before_snapshot.url || '—'}
                                      </div>
                                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {relatedStepResult.before_snapshot.text_snippet || 'No snapshot text'}
                                      </div>
                                    </div>
                                  )}
                                  {relatedStepResult?.after_snapshot && (
                                    <div style={{
                                      borderRadius: 'var(--radius-md)',
                                      border: '1px solid rgba(255,255,255,0.06)',
                                      background: 'var(--bg-deepest)',
                                      padding: 12,
                                    }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>After</div>
                                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                                        {relatedStepResult.after_snapshot.url || '—'}
                                      </div>
                                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {relatedStepResult.after_snapshot.text_snippet || 'No snapshot text'}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {relatedStepResult?.failure_type === 'blocked_by_bot_protection' && (
                              <div style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'flex-start',
                                borderRadius: 'var(--radius-md)',
                                background: 'rgba(251, 191, 36, 0.12)',
                                border: '1px solid rgba(251, 191, 36, 0.22)',
                                padding: 12,
                                color: 'var(--amber)',
                              }}>
                                <AlertTriangle size={16} />
                                <div style={{ fontSize: 13 }}>
                                  Site blocked the agent with bot protection. This is a site configuration issue, not an AiBreaker execution failure.
                                </div>
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
