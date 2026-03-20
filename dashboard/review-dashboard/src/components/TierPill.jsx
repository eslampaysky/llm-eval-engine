import { useTranslation } from 'react-i18next';

export default function TierPill({ selected = 'vibe', onChange, disabled = false }) {
  const { t } = useTranslation();
  const tiers = [
    { id: 'vibe', label: t('audit.tiers.vibe.label', 'Vibe Check'), desc: t('audit.tiers.vibe.desc', 'Quick scan') },
    { id: 'deep', label: t('audit.tiers.deep.label', 'Deep Dive'), desc: t('audit.tiers.deep.desc', 'Full audit') },
    { id: 'fix', label: t('audit.tiers.fix.label', 'Fix & Verify'), desc: t('audit.tiers.fix.desc', 'AI fixes') },
  ];

  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        background: 'var(--bg-surface)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--line)',
      }}
    >
      {tiers.map((tier) => {
        const isActive = selected === tier.id;
        return (
          <button
            key={tier.id}
            onClick={() => !disabled && onChange?.(tier.id)}
            disabled={disabled}
            style={{
              padding: '10px 20px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              background: isActive ? 'var(--accent)' : 'transparent',
              color: isActive ? '#020810' : 'var(--text-secondary)',
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            <span>{tier.label}</span>
            <span
              style={{
                fontSize: 10,
                opacity: 0.7,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {tier.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
