import { useState } from 'react';
import { Plus, Copy, Check, X, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
          <div className="page-eyebrow">{t('developer.apiKeys.eyebrow')}</div>
          <h1 className="page-title">{t('developer.apiKeys.title')}</h1>
          <p className="page-subtitle">{t('developer.apiKeys.subtitle')}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> {t('developer.apiKeys.generate')}
        </button>
      </div>

      <div className="card" style={{ padding: 0, marginBottom: 28, overflow: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('developer.apiKeys.table.name')}</th>
              <th>{t('developer.apiKeys.table.key')}</th>
              <th>{t('developer.apiKeys.table.created')}</th>
              <th>{t('developer.apiKeys.table.lastUsed')}</th>
              <th>{t('developer.apiKeys.table.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {MOCK_KEYS.map((keyItem) => (
              <tr key={keyItem.id}>
                <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{keyItem.name}</td>
                <td>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    ********{keyItem.key.slice(-4)}
                  </span>
                </td>
                <td>{keyItem.created}</td>
                <td>{keyItem.lastUsed}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-icon" onClick={() => handleCopy(keyItem.key)} title={t('developer.apiKeys.copyKey')}>
                      {copiedId === keyItem.key ? <Check size={14} style={{ color: 'var(--green)' }} /> : <Copy size={14} />}
                    </button>
                    <button className="btn-icon" style={{ color: 'var(--coral)' }} title={t('developer.apiKeys.revoke')}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <div className="card-label">{t('developer.apiKeys.usageExample')}</div>
        <div className="code-block">{CODE_SNIPPET}</div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('developer.apiKeys.modalTitle')}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">{t('developer.apiKeys.keyName')}</label>
              <input className="form-input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder={t('developer.apiKeys.keyNamePlaceholder')} />
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setShowModal(false)}>
              {t('developer.apiKeys.generateKey')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
