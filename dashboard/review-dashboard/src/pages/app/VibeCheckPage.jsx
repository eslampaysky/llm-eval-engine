import { useEffect, useState, useRef } from 'react';
import { api } from '../../services/api';

/* ── Severity styling ────────────────────────────────────────────────── */
const SEV_COLORS = {
  critical: { bg: 'rgba(255,77,109,.14)', border: 'rgba(255,77,109,.42)', text: '#ff4d6d' },
  high:     { bg: 'rgba(255,145,77,.12)', border: 'rgba(255,145,77,.42)', text: '#ff914d' },
  medium:   { bg: 'rgba(255,210,77,.12)', border: 'rgba(255,210,77,.38)', text: '#ffd24d' },
  low:      { bg: 'rgba(38,240,185,.10)', border: 'rgba(38,240,185,.38)', text: '#26f0b9' },
};

const TIER_INFO = {
  vibe: { label: 'Vibe Check', desc: '~30s · Visual scan, top 3 bugs', icon: '⚡' },
  deep: { label: 'Deep Dive', desc: '~60s · Full crawl + video replay', icon: '🔍' },
  fix:  { label: 'Fix & Verify', desc: '~90s · Deep + code analysis', icon: '🔧' },
};

/* ── Score Ring (SVG) ─────────────────────────────────────────────────── */
function ScoreRing({ score, size = 180 }) {
  const r = (size - 20) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#26f0b9' : score >= 50 ? '#ffd24d' : '#ff4d6d';

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(30,61,92,.5)" strokeWidth="10" />
      <circle cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 1.2s ease, stroke .6s', transform: 'rotate(-90deg)', transformOrigin: 'center' }}
        filter={`drop-shadow(0 0 8px ${color}60)`}
      />
      <text x="50%" y="48%" textAnchor="middle" dominantBaseline="central"
        fill={color} fontSize="2.6rem" fontWeight="700"
        fontFamily="'JetBrains Mono',monospace"
        filter={`drop-shadow(0 0 6px ${color}40)`}>
        {score}
      </text>
      <text x="50%" y="68%" textAnchor="middle" fill="#8ea8c7" fontSize=".78rem"
        fontFamily="'JetBrains Mono',monospace">
        / 100
      </text>
    </svg>
  );
}

/* ── Finding Card ─────────────────────────────────────────────────────── */
function FindingCard({ finding, index }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const sev = SEV_COLORS[finding.severity] || SEV_COLORS.medium;

  const copyFix = () => {
    navigator.clipboard.writeText(finding.fix_prompt || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: 'linear-gradient(165deg, var(--panel), var(--panel-2))',
      border: `1px solid ${sev.border}`,
      borderRadius: 14, padding: '16px 18px', marginBottom: 12,
      transition: 'box-shadow .3s',
      boxShadow: expanded ? `inset 0 0 2rem ${sev.bg}` : 'none',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}>
        <span style={{
          background: sev.bg, border: `1px solid ${sev.border}`, color: sev.text,
          borderRadius: 999, padding: '2px 10px', fontSize: '.7rem', fontWeight: 600,
          fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase',
        }}>
          {finding.severity}
        </span>
        <span style={{
          background: 'rgba(59,180,255,.08)', border: '1px solid rgba(59,180,255,.28)',
          color: '#9fd5ff', borderRadius: 999, padding: '2px 8px', fontSize: '.68rem',
          fontFamily: "'JetBrains Mono',monospace", textTransform: 'uppercase',
        }}>
          {finding.category}
        </span>
        <strong style={{ flex: 1, fontSize: '.92rem' }}>{finding.title}</strong>
        <span style={{ color: 'var(--muted)', fontSize: '.82rem', transition: 'transform .2s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>▼</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(33,57,90,.5)' }}>
          <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: '.88rem', lineHeight: 1.5 }}>
            {finding.description}
          </p>
          {finding.fix_prompt && (
            <div style={{
              background: 'rgba(3,10,19,.85)', border: '1px solid #25537a', borderRadius: 10,
              padding: 12, position: 'relative',
            }}>
              <div style={{
                color: '#9fd5ff', fontSize: '.7rem', fontFamily: "'JetBrains Mono',monospace",
                textTransform: 'uppercase', marginBottom: 8, letterSpacing: '.04em',
              }}>Fix Prompt</div>
              <pre style={{
                margin: 0, whiteSpace: 'pre-wrap', fontSize: '.84rem', lineHeight: 1.5,
                color: 'var(--text)', fontFamily: "'JetBrains Mono',monospace",
              }}>
                {finding.fix_prompt}
              </pre>
              <button onClick={copyFix} style={{
                position: 'absolute', top: 10, right: 10,
                background: copied ? 'rgba(38,240,185,.15)' : 'rgba(59,180,255,.12)',
                border: `1px solid ${copied ? 'rgba(38,240,185,.45)' : 'rgba(59,180,255,.35)'}`,
                color: copied ? '#26f0b9' : '#9fd5ff',
                borderRadius: 8, padding: '4px 10px', cursor: 'pointer',
                fontSize: '.72rem', fontFamily: "'JetBrains Mono',monospace",
                transition: 'all .2s',
              }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function VibeCheckPage() {
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState('vibe');
  const [auditId, setAuditId] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [allCopied, setAllCopied] = useState(false);
  const [viewMode, setViewMode] = useState('desktop');
  const pollRef = useRef(null);

  async function startAudit() {
    if (!url) return;
    setLoading(true);
    setResult(null);
    setError('');
    setProgress('Submitting...');
    try {
      const data = await api.startAgenticQA({ url, tier });
      setAuditId(data.audit_id);
      setProgress('Queued — waiting for browser...');
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Failed to start audit');
    }
  }

  useEffect(() => {
    if (!auditId) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await api.getAgenticQAStatus(auditId);
        if (cancelled) return;
        if (data.status === 'done') {
          setResult(data);
          setLoading(false);
          setProgress('');
        } else if (data.status === 'failed') {
          setLoading(false);
          setError('Audit failed. Please try again.');
          setProgress('');
        } else {
          setProgress(data.status === 'processing' ? 'Analysing your app...' : 'Queued...');
          pollRef.current = setTimeout(poll, 2500);
        }
      } catch {
        if (!cancelled) {
          pollRef.current = setTimeout(poll, 4000);
        }
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [auditId]);

  function copyAllFixes() {
    if (result?.bundled_fix_prompt) {
      navigator.clipboard.writeText(result.bundled_fix_prompt);
      setAllCopied(true);
      setTimeout(() => setAllCopied(false), 2500);
    }
  }

  const findings = result?.findings || [];
  const critCount = findings.filter(f => f.severity === 'critical').length;
  const highCount = findings.filter(f => f.severity === 'high').length;

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      {!result && (
        <div style={{ textAlign: 'center', paddingTop: 30 }}>
          <h1 id="vibe-check-title" style={{
            fontSize: '2rem', margin: '0 0 10px', fontWeight: 700,
            background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Does your AI-built app actually work?
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.95rem', margin: '0 0 28px' }}>
            Paste a URL. Get a reliability score, a list of bugs, and fix prompts you can paste right back.
          </p>

          {/* Tier selector */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
            {Object.entries(TIER_INFO).map(([key, info]) => (
              <button key={key} id={`tier-${key}`} onClick={() => setTier(key)} style={{
                background: tier === key
                  ? 'linear-gradient(120deg, var(--accent), var(--accent2))'
                  : 'rgba(12,18,32,.8)',
                color: tier === key ? '#020810' : 'var(--muted)',
                border: `1px solid ${tier === key ? 'rgba(38,240,185,.55)' : '#25537a'}`,
                borderRadius: 999, padding: '8px 18px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono',monospace", fontSize: '.82rem', fontWeight: 600,
                transition: 'all .25s',
                boxShadow: tier === key ? 'var(--glow-blue)' : 'none',
              }}>
                {info.icon} {info.label}
              </button>
            ))}
          </div>
          <p style={{ color: 'var(--muted)', fontSize: '.78rem', margin: '0 0 18px',
            fontFamily: "'JetBrains Mono',monospace" }}>
            {TIER_INFO[tier].desc}
          </p>

          {/* URL input */}
          <div style={{ display: 'flex', gap: 10, maxWidth: 600, margin: '0 auto 10px' }}>
            <input id="vibe-check-url" type="url" value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && startAudit()}
              placeholder="https://your-app.com"
              style={{
                flex: 1, padding: '12px 14px', fontSize: '.95rem',
                borderRadius: 12,
              }}
            />
            <button id="vibe-check-submit" className="primary-btn" onClick={startAudit}
              disabled={loading || !url}
              style={{ borderRadius: 12, padding: '12px 22px', fontSize: '.88rem' }}>
              {loading ? '⏳ Running...' : '🚀 Break it'}
            </button>
          </div>

          {error && <div className="error-banner" style={{ maxWidth: 600, margin: '10px auto' }}>{error}</div>}
          {progress && (
            <div style={{
              color: 'var(--accent)', fontSize: '.84rem', marginTop: 12,
              fontFamily: "'JetBrains Mono',monospace",
              animation: 'pulse 1.5s ease-in-out infinite',
            }}>
              {progress}
            </div>
          )}
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────────── */}
      {result && (
        <div style={{ paddingTop: 16 }}>
          {/* Score + Summary header */}
          <div className="panel" style={{ textAlign: 'center', paddingTop: 24, paddingBottom: 24 }}>
            <ScoreRing score={result.score ?? 0} />
            <div style={{
              marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 8,
              background: 'rgba(59,180,255,.08)', border: '1px solid rgba(59,180,255,.28)',
              borderRadius: 999, padding: '4px 12px',
            }}>
              <span style={{ color: '#9fd5ff', fontSize: '.76rem',
                fontFamily: "'JetBrains Mono',monospace" }}>
                {result.confidence ?? 0}% confident
              </span>
            </div>
            <p style={{ color: 'var(--muted)', margin: '14px auto 0', maxWidth: 560,
              fontSize: '.92rem', lineHeight: 1.5 }}>
              {result.summary}
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '.78rem', fontFamily: "'JetBrains Mono',monospace", color: 'var(--muted)' }}>
                🌐 {result.url}
              </span>
              <span style={{
                background: 'rgba(59,180,255,.08)', border: '1px solid rgba(59,180,255,.22)',
                borderRadius: 999, padding: '1px 8px', fontSize: '.7rem',
                fontFamily: "'JetBrains Mono',monospace", color: '#9fd5ff', textTransform: 'uppercase',
              }}>
                {result.tier}
              </span>
            </div>
          </div>

          {/* KPI strip */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}>
            <div className="kpi">
              <span>Issues Found</span>
              <strong>{findings.length}</strong>
            </div>
            <div className="kpi">
              <span>Critical</span>
              <strong style={{ color: critCount > 0 ? '#ff4d6d' : '#26f0b9' }}>{critCount}</strong>
            </div>
            <div className="kpi">
              <span>High</span>
              <strong style={{ color: highCount > 0 ? '#ff914d' : '#26f0b9' }}>{highCount}</strong>
            </div>
          </div>

          {/* Fix All button */}
          {result.bundled_fix_prompt && (
            <button id="copy-all-fixes" onClick={copyAllFixes} style={{
              width: '100%', marginTop: 10, marginBottom: 16, padding: '14px 20px',
              fontSize: '.88rem', fontWeight: 700, cursor: 'pointer',
              fontFamily: "'JetBrains Mono',monospace",
              background: allCopied
                ? 'linear-gradient(120deg, #26f0b9, #3bb4ff)'
                : 'linear-gradient(120deg, var(--accent), var(--accent2))',
              color: '#020810', border: 'none', borderRadius: 12,
              boxShadow: 'var(--glow-blue), var(--glow-green)',
              transition: 'all .3s',
            }}>
              {allCopied ? '✓ All Fix Prompts Copied!' : '📋 Copy All Fix Prompts'}
            </button>
          )}

          {/* Findings list */}
          <h2 className="panel-title" style={{ marginTop: 8 }}>Findings</h2>
          {findings.length === 0 && (
            <div className="panel" style={{ textAlign: 'center', color: 'var(--muted)' }}>
              ✅ No issues found — your app looks great!
            </div>
          )}
          {findings.map((f, i) => (
            <FindingCard key={i} finding={f} index={i} />
          ))}

          {/* New audit button */}
          <div style={{ textAlign: 'center', marginTop: 24 }}>
            <button className="ghost-btn" onClick={() => {
              setResult(null); setAuditId(null); setUrl(''); setError('');
            }} style={{ fontSize: '.84rem' }}>
              ← Run another audit
            </button>
          </div>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}</style>
    </div>
  );
}
