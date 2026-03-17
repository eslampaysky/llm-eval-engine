import { useState } from 'react';
import TierPill from '../../../components/TierPill.jsx';

export default function WorkspacePage() {
  const [defaultTier, setDefaultTier] = useState('vibe');
  const [slackWebhook, setSlackWebhook] = useState('');
  const [notifyRegression, setNotifyRegression] = useState(true);
  const [notifyComplete, setNotifyComplete] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState(true);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
