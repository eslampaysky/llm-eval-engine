const STATUS_CONFIG = {
  healthy:   { color: 'var(--green)', bg: 'var(--green-dim)', border: 'rgba(52, 211, 153, 0.2)' },
  degraded:  { color: 'var(--amber)', bg: 'var(--amber-dim)', border: 'rgba(251, 191, 36, 0.2)' },
  critical:  { color: 'var(--coral)', bg: 'var(--coral-dim)', border: 'rgba(232, 89, 60, 0.2)' },
};

export default function AuditStatusBadge({ status = 'healthy', label }) {
  const config = STATUS_CONFIG[status.toLowerCase()] || STATUS_CONFIG.healthy;
  const resolvedLabel = label || (status.charAt(0).toUpperCase() + status.slice(1));

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 12px',
      borderRadius: 'var(--radius-full)',
      background: config.bg,
      color: config.color,
      border: `1px solid ${config.border}`,
      fontFamily: 'var(--font-mono)',
      fontSize: 11,
      fontWeight: 500,
      letterSpacing: '0.03em',
    }}>
      <span style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: config.color,
        boxShadow: `0 0 6px ${config.color}`,
      }} />
      {resolvedLabel}
    </span>
  );
}
