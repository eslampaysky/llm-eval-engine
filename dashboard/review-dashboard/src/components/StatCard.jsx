import { useEffect, useRef, useState } from 'react';

export default function StatCard({ label, value = 0, prefix = '', suffix = '', icon, color }) {
  const [displayed, setDisplayed] = useState(0);
  const ref = useRef(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;

    const start = performance.now();
    const duration = 1400;
    const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
    let frame;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayed(Math.round(numValue * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return (
    <div style={{
      background: 'var(--bg-raised)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-lg)',
      padding: '20px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      transition: 'border-color 0.2s, box-shadow 0.2s',
      cursor: 'default',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = 'var(--line-light)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = 'var(--line)';
    }}
    ref={ref}
    >
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          {label}
        </span>
        {icon && (
          <span style={{ color: color || 'var(--text-dim)', opacity: 0.6 }}>
            {icon}
          </span>
        )}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 32,
        fontWeight: 700,
        color: color || 'var(--text-primary)',
        lineHeight: 1,
        letterSpacing: '-0.02em',
      }}>
        {prefix}{displayed.toLocaleString()}{suffix}
      </div>
    </div>
  );
}
