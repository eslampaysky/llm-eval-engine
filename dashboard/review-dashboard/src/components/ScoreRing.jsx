import { useEffect, useRef, useState } from 'react';

const COLORS = {
  green: { stroke: '#34D399', bg: 'rgba(52, 211, 153, 0.08)' },
  amber: { stroke: '#FBBF24', bg: 'rgba(251, 191, 36, 0.08)' },
  red:   { stroke: '#F87171', bg: 'rgba(248, 113, 113, 0.08)' },
};

function getColor(score) {
  if (score >= 80) return COLORS.green;
  if (score >= 50) return COLORS.amber;
  return COLORS.red;
}

export default function ScoreRing({ score = 0, size = 120, strokeWidth = 8, label, showScore = true }) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const ref = useRef(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = getColor(score);

  useEffect(() => {
    let frame;
    const start = performance.now();
    const duration = 1200;
    const from = 0;
    const to = score;

    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimatedScore(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={strokeWidth}
        />
        {/* Score arc */}
        <circle
          ref={ref}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.3s ease',
            filter: `drop-shadow(0 0 6px ${color.stroke}40)`,
          }}
        />
      </svg>
      {showScore && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: size * 0.28,
            fontWeight: 700,
            color: color.stroke,
            lineHeight: 1,
          }}>
            {animatedScore}
          </span>
          {label && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: size * 0.09,
              color: 'var(--text-muted)',
              marginTop: 4,
              letterSpacing: '0.05em',
            }}>
              {label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
