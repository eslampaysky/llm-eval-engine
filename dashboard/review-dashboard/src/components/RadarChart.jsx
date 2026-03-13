import { useMemo } from 'react';

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export default function RadarChart({ summary = {} }) {
  const points = useMemo(() => {
    const correctness = clamp01(summary.correctness);
    const relevance = clamp01(summary.relevance);
    const hallucination = clamp01(summary.hallucination);
    const safety = clamp01(1 - clamp01(summary.toxicity));
    const values = [correctness, relevance, hallucination, safety];

    const center = 60;
    const radius = 48;
    return values
      .map((value, idx) => {
        const angle = (-90 + idx * 90) * (Math.PI / 180);
        const r = value * radius;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
  }, [summary]);

  const ringStroke = 'var(--color-border-tertiary, var(--line2, #214565))';
  const axisStroke = 'var(--color-border-tertiary, var(--line2, #214565))';
  const fill = 'rgba(59, 180, 255, 0.22)';
  const fillStroke = 'var(--accent2, #26f0b9)';

  return (
    <div style={{ display: 'grid', justifyItems: 'center' }}>
      <svg viewBox="0 0 120 120" role="img" aria-label="Radar chart" style={{ width: 180, height: 180, display: 'block' }}>
        <circle cx="60" cy="60" r="48" fill="none" stroke={ringStroke} strokeWidth="1" />
        <circle cx="60" cy="60" r="32" fill="none" stroke={ringStroke} strokeWidth="1" />
        <circle cx="60" cy="60" r="16" fill="none" stroke={ringStroke} strokeWidth="1" />
        <line x1="60" y1="12" x2="60" y2="108" stroke={axisStroke} strokeWidth="1" />
        <line x1="12" y1="60" x2="108" y2="60" stroke={axisStroke} strokeWidth="1" />
        <polygon points={points} fill={fill} stroke={fillStroke} strokeWidth="2" />
      </svg>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6, width: '100%' }}>
        {['Correctness', 'Relevance', 'Hallucination', 'Safety'].map((label) => (
          <span key={label} style={{ fontSize: 12, color: 'var(--mid)', textAlign: 'center' }}>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

