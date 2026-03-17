import { useState } from 'react';
import { Plus, Copy, Check, X, Eye, EyeOff, Trash2 } from 'lucide-react';

const MOCK_KEYS = [
  { id: '1', name: 'Production', key: 'ak_live_xxxxxxxxxxxx7f3d', created: 'Mar 10, 2026', lastUsed: 'Mar 18, 2026' },
  { id: '2', name: 'Staging', key: 'ak_test_xxxxxxxxxxxxb92a', created: 'Mar 5, 2026', lastUsed: 'Mar 15, 2026' },
];

const CODE_SNIPPET = `const response = await fetch(
  'https://api.aibreaker.ai/agentic-qa/start',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': 'ak_live_xxxxxxxxxxxx7f3d',
    },
    body: JSON.stringify({
      url: 'https://your-app.vercel.app',
      tier: 'vibe',
    }),
  }
);

const data = await response.json();
console.log(data.report_id);`;

export default function ApiKeysPage() {
  const [showModal, setShowModal] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const handleCopy = async (key) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedId(key);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  return (
    <div className="page-container fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <div className="page-eyebrow">Developer</div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-subtitle">Manage API keys for programmatic access.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Generate New Key
        </button>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 28, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_KEYS.map((k) => (
              <tr key={k.id}>
                <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{k.name}</td>
                <td>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}>
                    ••••••••{k.key.slice(-4)}
                  </span>
                </td>
                <td>{k.created}</td>
                <td>{k.lastUsed}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-icon" onClick={() => handleCopy(k.key)} title="Copy key">
                      {copiedId === k.key ? <Check size={14} style={{ color: 'var(--green)' }} /> : <Copy size={14} />}
                    </button>
                    <button className="btn-icon" style={{ color: 'var(--coral)' }} title="Revoke">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Usage snippet */}
      <div className="card" style={{ padding: 24 }}>
        <div className="card-label">Usage Example</div>
        <div className="code-block">{CODE_SNIPPET}</div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                Generate API Key
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Key Name</label>
              <input className="form-input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. Production, CI Pipeline" />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowModal(false)}>
              Generate Key
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
