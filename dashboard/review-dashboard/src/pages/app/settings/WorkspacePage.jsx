import { useState, useEffect } from 'react';
import { Key, ExternalLink, CheckCircle, Trash2 } from 'lucide-react';
import { api } from '../../../services/api';
import TierPill from '../../../components/TierPill.jsx';

export default function WorkspacePage() {
  const [defaultTier, setDefaultTier] = useState('vibe');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [notifyRegression, setNotifyRegression] = useState(true);
  const [notifyComplete, setNotifyComplete] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState(true);

  // Gemini key state
  const [geminiKey, setGeminiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => {
    api.getGeminiKeyStatus().then((d) => setHasKey(d?.has_key || false)).catch(() => {});
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
    } catch (err) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* AI Vision API Key */}
      <div className="card" style={{ padding: 28 }}>
        <div className="card-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Key size={16} /> AI Vision API Key
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          Connect your own Gemini API key for dedicated quota.
          This gives you unlimited AI visual analysis without sharing the free pool.
        </p>

        {hasKey ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            padding: '12px 16px', borderRadius: 'var(--radius-sm)',
            background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.2)',
          }}>
            <CheckCircle size={18} color="var(--green)" />
            <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 600, flex: 1 }}>
              ✅ Your Gemini key is connected — you have your own dedicated quota
            </span>
            <button
              className="btn btn-ghost"
              onClick={handleRemoveKey}
              style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Trash2 size={14} /> Remove
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <input
                className="form-input"
                type="password"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
                placeholder="AIzaSy..."
                style={{ marginBottom: 8 }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Get a free API key from Google AI Studio — it only takes 2 minutes.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveKey}
                disabled={!geminiKey.trim() || saving}
                style={{ fontSize: 13 }}
              >
                {saving ? 'Saving...' : 'Save Key'}
              </button>
              <a
                href="https://aistudio.google.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                }}
              >
                Get a free key <ExternalLink size={12} />
              </a>
              {saveMsg === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--coral)' }}>Failed to save. Please check the key.</span>
              )}
            </div>
          </>
        )}
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Default Audit Tier</div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
          This tier will be pre-selected when starting new audits.
        </p>
        <TierPill selected={defaultTier} onChange={setDefaultTier} />
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Slack Integration</div>
        <div style={{ marginBottom: 16 }}>
          <label className="form-label">Webhook URL</label>
          <input className="form-input" value={slackWebhook}
            onChange={(e) => setSlackWebhook(e.target.value)}
            placeholder="https://hooks.slack.com/services/..." />
        </div>
        <button className="btn btn-ghost" style={{ fontSize: 12 }}>Test Webhook</button>
      </div>

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Email Notifications</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[
            { label: 'On regression detected', checked: notifyRegression, onChange: setNotifyRegression },
            { label: 'On audit complete', checked: notifyComplete, onChange: setNotifyComplete },
            { label: 'Weekly summary', checked: weeklySummary, onChange: setWeeklySummary },
          ].map((item) => (
            <label key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)',
            }}>
              <input type="checkbox" checked={item.checked}
                onChange={(e) => item.onChange(e.target.checked)}
                style={{
                  width: 18, height: 18, borderRadius: 4,
                  accentColor: 'var(--accent)', cursor: 'pointer',
                }} />
              {item.label}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Save Workspace Settings</button>
    </div>
  );
}
