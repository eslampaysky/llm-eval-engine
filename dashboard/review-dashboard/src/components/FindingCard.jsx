import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const SEVERITY_CONFIG = {
  critical: { color: 'var(--coral)', bg: 'var(--coral-dim)', key: 'critical' },
  warning: { color: 'var(--amber)', bg: 'var(--amber-dim)', key: 'warning' },
  info: { color: 'var(--accent)', bg: 'var(--accent-dim)', key: 'info' },
};

export default function FindingCard({ severity = 'info', category, title, description, fixPrompt }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.info;

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (!fixPrompt) return;
    try {
      await navigator.clipboard.writeText(fixPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div
      style={{
        background: 'var(--bg-raised)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
        borderLeftWidth: 3,
        borderLeftColor: config.color,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          padding: '16px 20px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          textAlign: 'left',
          color: 'var(--text-primary)',
        }}
      >
        <div
          className="severity-dot"
          style={{
            background: config.color,
            boxShadow: `0 0 8px ${config.color}60`,
            marginTop: 5,
            width: 8,
            height: 8,
            borderRadius: '50%',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 500,
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
                background: config.bg,
                color: config.color,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              {t(`finding.severity.${config.key}`, config.key)}
            </span>
            {category && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {category}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-primary)',
              lineHeight: 1.4,
            }}
          >
            {title}
          </div>
          {description && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-secondary)',
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {description}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, color: 'var(--text-muted)', marginTop: 2 }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {expanded && fixPrompt && (
        <div
          style={{
            padding: '0 20px 16px',
            borderTop: '1px solid var(--line)',
            marginTop: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0 8px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--accent)',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {t('finding.fixPrompt', 'Fix Prompt')}
            </span>
            <button
              onClick={handleCopy}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: 'none',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                cursor: 'pointer',
                color: copied ? 'var(--green)' : 'var(--text-muted)',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.15s',
              }}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t('common.copied', 'Copied!') : t('common.copy', 'Copy')}
            </button>
          </div>
          <div
            style={{
              background: 'var(--bg-deepest)',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              padding: '12px 14px',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {fixPrompt}
          </div>
        </div>
      )}
    </div>
  );
}
