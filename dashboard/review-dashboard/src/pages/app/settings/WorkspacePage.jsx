import { useState, useEffect } from 'react';
import { Key, ExternalLink, CheckCircle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../services/api';
import TierPill from '../../../components/TierPill.jsx';

export default function WorkspacePage() {
  const { t } = useTranslation();
  const [defaultTier, setDefaultTier] = useState('vibe');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [notifyRegression, setNotifyRegression] = useState(true);
  const [notifyComplete, setNotifyComplete] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState(true);
  const [geminiKey, setGeminiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api.getGeminiKeyStatus().then((data) => setHasKey(data?.has_key || false)).catch(() => {});
  }, []);

  async function handleSaveKey() {
    if (!geminiKey.trim()) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await api.saveGeminiKey(geminiKey.trim());
      setHasKey(true);
      setGeminiKey('');
      setSaveMsg('saved');
    } catch {
      setSaveMsg('error');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveKey() {
    try {
      await api.deleteGeminiKey();
      setHasKey(false);
      setSaveMsg('');
    } catch {}
  }

  const notificationOptions = [
    { key: 'notifyRegression', checked: notifyRegression, onChange: setNotifyRegression },
    { key: 'notifyComplete', checked: notifyComplete, onChange: setNotifyComplete },
    { key: 'weeklySummary', checked: weeklySummary, onChange: setWeeklySummary },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card" style={{ padding: 28 }}>
        <div className="card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={16} /> {t('settings.workspace.visionKey')}
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          {t('settings.workspace.visionHelp')}
        </p>

        {hasKey ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius-sm)', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
            <CheckCircle size={18} color="var(--green)" />
            <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600, flex: 1 }}>
              {t('settings.workspace.connected')}
            </span>
            <button className="btn btn-ghost" onClick={handleRemoveKey} style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Trash2 size={14} /> {t('common.remove')}
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <input className="form-input" type="password" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()} placeholder="AIzaSy..." style={{ marginBottom: 8 }} />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {t('settings.workspace.freeKeyHelp')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={handleSaveKey} disabled={!geminiKey.trim() || saving} style={{ fontSize: 13 }}>
                {saving ? t('settings.workspace.saving') : t('settings.workspace.saveKey')}
              </button>
              <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>
                {t('settings.workspace.freeKey')} <ExternalLink size={12} />
              </a>
              {saveMsg === 'error' && <span style={{ fontSize: 12, color: 'var(--coral)' }}>{t('settings.workspace.saveFailed')}</span>}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.workspace.defaultTier')}</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          {t('settings.workspace.defaultTierHelp')}
        </p>
        <TierPill selected={defaultTier} onChange={setDefaultTier} />
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.workspace.slack')}</div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">{t('settings.workspace.webhook')}</label>
          <input className="form-input" value={slackWebhook} onChange={(e) => setSlackWebhook(e.target.value)} placeholder="https://hooks.slack.com/services/..." />
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }}>{t('settings.workspace.testWebhook')}</button>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.workspace.emailNotifications')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {notificationOptions.map((option) => (
            <label key={option.key} style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)' }}>
              <input type="checkbox" checked={option.checked} onChange={(e) => option.onChange(e.target.checked)} style={{ width: 18, height: 18, borderRadius: 4, accentColor: 'var(--accent)', cursor: 'pointer' }} />
              {t(`settings.workspace.${option.key}`)}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>{t('settings.workspace.saveWorkspace')}</button>
    </div>
  );
}
