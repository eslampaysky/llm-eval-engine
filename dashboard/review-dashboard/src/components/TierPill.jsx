const TIERS = [
  { id: 'vibe', label: 'Vibe Check', desc: 'Quick scan' },
  { id: 'deep', label: 'Deep Dive', desc: 'Full audit' },
  { id: 'fix',  label: 'Fix & Verify', desc: 'AI fixes' },
];

export default function TierPill({ selected = 'vibe', onChange, disabled = false }) {
  return (
    <div style={{
      display: 'inline-flex',
      gap: 4,
      padding: 4,
      background: 'var(--bg-surface)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--line)',
    }}>
      {TIERS.map((tier) => {
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
            <span style={{
              fontSize: 10,
              opacity: 0.7,
              fontFamily: 'var(--font-mono)',
            }}>
              {tier.desc}
            </span>
          </button>
        );
      })}
    </div>
  );
}
