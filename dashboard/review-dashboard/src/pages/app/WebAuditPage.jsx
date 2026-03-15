import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import CopyButton from '../../components/CopyButton';
import ConfidenceBar from '../../components/ConfidenceBar';

const HEALTH_COLOR = {
  good: 'var(--green)',
  warning: 'var(--amber, #fbbf24)',
  critical: 'var(--red)',
};

const STATUS_MSGS = {
  queued: 'Queued...',
  processing: 'Crawling + analysing...',
  done: 'Done!',
  failed: 'Failed',
};

export default function WebAuditPage() {
  const [url, setUrl] = useState('');
  const [desc, setDesc] = useState('');
  const [auditId, setAuditId] = useState(null);
  const [result, setResult] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [shareUrl, setShareUrl] = useState(null);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  async function submit() {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setStatusMsg('');
    setError('');
    try {
      const data = await api.createWebAudit({ url, description: desc });
      setAuditId(data.audit_id);
      setStatusMsg(STATUS_MSGS.queued);
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Failed to start audit');
    }
  }

  async function shareReport() {
    if (!auditId || sharing) return;
    setSharing(true);
    try {
      const data = await api.shareWebAudit(auditId);
      const nextUrl = data?.share_url;
      if (nextUrl) {
        await navigator.clipboard.writeText(nextUrl);
        setShareUrl(nextUrl);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch (err) {
      setError(err.message || 'Failed to share report');
    } finally {
      setSharing(false);
    }
  }

  useEffect(() => {
    if (!auditId) return undefined;
    const iv = setInterval(async () => {
      try {
        const [data, progressRes] = await Promise.all([
          api.getWebAudit(auditId),
          fetch(`${api.baseUrl}/report/${encodeURIComponent(auditId)}/progress`, {
            headers: { 'X-API-KEY': api.getApiKey() },
          }).then((res) => (res.ok ? res.json() : null)),
        ]);
        setProgress(progressRes);
        setStatusMsg(STATUS_MSGS[data.status] || data.status);
        if (data.status === 'done' || data.status === 'failed') {
          clearInterval(iv);
          setLoading(false);
          setResult(data);
        }
      } catch (err) {
        clearInterval(iv);
        setLoading(false);
        setError(err.message || 'Failed to load audit');
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [auditId]);

  const ThinkingLog = () => {
    if (!loading || !progress) return null;
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <style>{'@keyframes thinkingPulse { 0%{opacity:.35} 50%{opacity:1} 100%{opacity:.35} }'}</style>
        <div className="card-label">Run progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mid)', marginBottom: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', animation: 'thinkingPulse 1.2s ease-in-out infinite' }} />
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
          Step {progress.steps_done || 0} of {progress.steps_total || 0} · {progress.elapsed_seconds || 0}s
        </div>
      </div>
    );
  };

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    async function loadVideo() {
      if (!result?.video_path || !auditId) return;
      try {
        const res = await fetch(api.getWebAuditVideo(auditId), {
          headers: { 'X-API-KEY': api.getApiKey() },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (active) setVideoUrl(objectUrl);
      } catch {}
    }
    loadVideo();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [auditId, result?.video_path]);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app · web audit</div>
        <div className="page-title">Web Audit</div>
        <div className="page-desc">
          Paste any URL — we crawl it, run an AI judge, and tell you exactly what&apos;s broken.
        </div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}

      <div className="card">
        <div className="card-label">Audit target</div>
        <input
          className="input"
          placeholder="https://your-app.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <textarea
          className="input"
          rows={3}
          style={{ marginTop: 8 }}
          placeholder="Optional: what should this site do? (e.g. 'users can sign up, pay, and get a receipt')"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginTop: 12 }}
          onClick={submit}
          disabled={loading || !url}
        >
          {loading ? (statusMsg || 'Running...') : 'Run Audit →'}
        </button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-label">Progress</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading && <div className="spinner" />}
          <div style={{ color: 'var(--mid)' }}>
            {statusMsg || (auditId ? 'Starting...' : 'Idle')}
          </div>
        </div>
      </div>
      <ThinkingLog />

      {result && result.overall_health && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontWeight: 700, fontSize: 20, color: HEALTH_COLOR[result.overall_health] }}>
              {String(result.overall_health || '').toUpperCase()}
            </span>
            <span style={{ color: 'var(--mid)', fontSize: 14 }}>
              {result.confidence}% confidence
            </span>
          </div>
          {result?.overall_health && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <button type="button" className="btn btn-ghost" onClick={shareReport} disabled={sharing}>
                {sharing ? 'Sharing...' : 'Share Report'}
              </button>
              {shareCopied && (
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--green)' }}>
                  Link copied!
                </span>
              )}
            </div>
          )}
          {typeof result.confidence === 'number' && (
            <ConfidenceBar score={result.confidence} subject="this site" />
          )}
          {result?.video_path && videoUrl && (
            <div style={{ margin: '16px 0 18px' }}>
              <div className="card-label">Video Replay</div>
              <div style={{ fontSize: 12, color: 'var(--mid)', marginTop: 4 }}>
                Watch the exact flow the auditor took before it scored the site.
              </div>
              <video
                controls
                width="100%"
                style={{ marginTop: 10, borderRadius: 12, background: 'var(--bg0)' }}
                src={videoUrl}
              />
            </div>
          )}
          {result.inferred_spec && !desc && (
            <div style={{ fontSize: 13, color: 'var(--mid)', fontStyle: 'italic', marginTop: 8 }}>
              Inferred: {result.inferred_spec.inferred_purpose}
            </div>
          )}
          <p style={{ marginBottom: 16 }}>{result.summary}</p>
          {result.inferred_spec && (
            <div className="card" style={{ marginBottom: 16, background: 'var(--bg2)' }}>
              <div className="card-label">Inferred Spec</div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 13, color: 'var(--mid)' }}>
                  <strong style={{ color: 'var(--hi)' }}>Product:</strong> {result.inferred_spec.product_type || '—'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--mid)' }}>
                  <strong style={{ color: 'var(--hi)' }}>Target user:</strong> {result.inferred_spec.target_user || '—'}
                </div>
                {Array.isArray(result.inferred_spec.critical_journeys) && result.inferred_spec.critical_journeys.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 6 }}>Critical journeys</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {result.inferred_spec.critical_journeys.slice(0, 3).map((journey, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)' }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{journey?.name || `Journey ${idx + 1}`}</div>
                          <div style={{ fontSize: 12, color: 'var(--mid)' }}>{journey?.success_criteria || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {Array.isArray(result.inferred_spec.test_scenarios) && result.inferred_spec.test_scenarios.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--mute)', marginBottom: 6 }}>Auto-generated scenarios</div>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {result.inferred_spec.test_scenarios.slice(0, 3).map((sc, idx) => (
                        <div key={idx} style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)' }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>{sc?.name || `Scenario ${idx + 1}`}</div>
                          <div style={{ fontSize: 12, color: 'var(--mid)' }}>{sc?.expected_outcome || sc?.goal || '—'}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {result.issues?.map((issue, i) => (
            <div
              key={i}
              className="card"
              style={{
                marginBottom: 8,
                borderLeft: `4px solid ${
                  issue.severity === 'high'
                    ? 'var(--red)'
                    : issue.severity === 'medium'
                      ? 'var(--amber, #fbbf24)'
                      : 'var(--mid)'
                }`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color:
                      issue.severity === 'high'
                        ? 'var(--red)'
                        : issue.severity === 'medium'
                          ? 'var(--amber, #fbbf24)'
                          : 'var(--mid)',
                  }}
                >
                  {issue.severity}
                </span>
                <div style={{ fontWeight: 600 }}>{issue.title}</div>
              </div>
              <div style={{ fontSize: 13, color: 'var(--mid)', margin: '4px 0 10px' }}>
                {issue.detail}
              </div>
              {typeof (issue.confidence ?? result.confidence) === 'number' && (
                <ConfidenceBar
                  score={issue.confidence ?? result.confidence}
                  subject={issue.title}
                />
              )}
              <CopyButton text={issue.fix} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
