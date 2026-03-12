import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../App.jsx';

function slugify(value) {
  return (value || 'unknown-target').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function inferModelType(name) {
  const lower = (name || '').toLowerCase();
  if (lower.includes('gemini')) return 'Gemini';
  if (lower.includes('gpt') || lower.includes('openai')) return 'OpenAI';
  if (lower.includes('llama') || lower.includes('groq')) return 'Llama';
  return 'Custom';
}

export function buildTargets(rows) {
  const groups = new Map();
  (rows || []).forEach((row) => {
    const name = row.model_version || row.target_name || 'Untitled target';
    const id = slugify(name);
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        name,
        description: row.description || `Imported from existing runs for ${name}.`,
        modelType: inferModelType(name),
        runs: [],
      });
    }
    groups.get(id).runs.push(row);
  });
  return Array.from(groups.values()).sort((a, b) => b.runs.length - a.runs.length);
}

export default function TargetsPage() {
  const [targets, setTargets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getReports()
      .then((rows) => setTargets(buildTargets(rows)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-eyebrow">// app · targets</div>
        <div className="page-title">Targets</div>
        <div className="page-desc">Targets replace projects in the new SaaS IA. For now, they are grouped from existing runs without changing backend APIs.</div>
      </div>

      {error && <div className="err-box">⚠ {error}</div>}
      {loading ? <div className="empty"><div className="spinner" style={{ margin: '0 auto' }} /></div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {targets.map((target) => (
            <Link key={target.id} to={`/app/targets/${target.id}`} className="card" style={{ textDecoration: 'none' }}>
              <div className="card-label">{target.modelType}</div>
              <div style={{ fontSize: 18, color: 'var(--hi)', fontWeight: 600, marginBottom: 6 }}>{target.name}</div>
              <div style={{ color: 'var(--mid)', marginBottom: 10 }}>{target.description}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--mute)' }}>{target.runs.length} runs</div>
            </Link>
          ))}
          {targets.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>No targets yet. Run the playground to populate this view.</div>}
        </div>
      )}
    </div>
  );
}
