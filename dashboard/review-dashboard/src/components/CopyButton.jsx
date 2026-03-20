import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function CopyButton({ text, label = 'Copy', size = 'sm' }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const isSmall = size === 'sm';

  return (
    <button
      onClick={handleCopy}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSmall ? 4 : 6,
        background: copied ? 'rgba(52, 211, 153, 0.1)' : 'var(--bg-surface)',
        border: `1px solid ${copied ? 'rgba(52, 211, 153, 0.3)' : 'var(--line)'}`,
        borderRadius: 'var(--radius-sm)',
        padding: isSmall ? '4px 8px' : '8px 14px',
        cursor: 'pointer',
        color: copied ? 'var(--green)' : 'var(--text-muted)',
        fontSize: isSmall ? 11 : 13,
        fontFamily: 'var(--font-mono)',
        fontWeight: 500,
        transition: 'all 0.15s',
      }}
    >
      {copied ? <Check size={isSmall ? 12 : 14} /> : <Copy size={isSmall ? 12 : 14} />}
      {copied ? t('common.copied', 'Copied!') : label}
    </button>
  );
}
