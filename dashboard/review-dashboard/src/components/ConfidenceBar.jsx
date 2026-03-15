export default function ConfidenceBar({ score, label, subject }) {
  if (typeof score !== 'number') return null;

  let color = 'var(--red)';
  if (score >= 90) color = 'var(--green)';
  else if (score >= 70) color = '#F59E0B';
  else if (score >= 50) color = '#EA580C';

  const verdict = score >= 70 ? 'working correctly' : 'broken or unreliable';
  const text = label || `I am ${score}% confident ${subject} is ${verdict}.`;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 6, borderRadius: 999, background: 'var(--bg0)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: color }} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--mid)', marginTop: 6 }}>{text}</div>
    </div>
  );
}
