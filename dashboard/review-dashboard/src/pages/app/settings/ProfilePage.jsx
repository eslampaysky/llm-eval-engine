import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext.jsx';

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const isOAuth = user?.provider === 'google';

  return (
    <div>
      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.profile.title')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--bg-surface)', border: '2px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--accent)', position: 'relative', cursor: 'pointer' }}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
            <div style={{ position: 'absolute', bottom: 0, insetInlineEnd: 0, width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={12} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{t('settings.profile.uploadAvatar')}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('settings.profile.avatarHelp')}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, maxWidth: 400 }}>
          <div>
            <label className="form-label">{t('settings.profile.displayName')}</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">{t('settings.profile.email')}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="form-input" value={user?.email || ''} readOnly style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              {isOAuth && <span className="badge badge-blue">{t('settings.profile.connectedViaGoogle')}</span>}
            </div>
          </div>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 20 }}>{t('settings.profile.save')}</button>
      </div>
    </div>
  );
}
