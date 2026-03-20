import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context/AuthContext.jsx';

const MOCK_SESSIONS = [
  { id: '1', deviceKey: 'chromeWindows', lastActiveKey: 'activeNow', current: true, lastActiveRaw: 'Active now' },
  { id: '2', deviceKey: 'safariIphone', lastActiveKey: null, current: false, lastActiveRaw: 'Mar 17, 2026' },
];

export default function SecurityPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isOAuth = user?.provider === 'google';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!isOAuth && (
        <div className="card" style={{ padding: 28, maxWidth: 480 }}>
          <div className="card-label">{t('settings.security.changePassword')}</div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label className="form-label">{t('settings.security.currentPassword')}</label>
              <input className="form-input" type="password" />
            </div>
            <div>
              <label className="form-label">{t('settings.security.newPassword')}</label>
              <input className="form-input" type="password" />
            </div>
            <div>
              <label className="form-label">{t('settings.security.confirmPassword')}</label>
              <input className="form-input" type="password" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }}>{t('settings.security.updatePassword')}</button>
        </div>
      )}

      {isOAuth && (
        <div className="card" style={{ padding: 28 }}>
          <div className="card-label">{t('settings.security.password')}</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('settings.security.oauthMessage')}
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">{t('settings.security.activeSessions')}</div>
        <div className="card" style={{ padding: 0, overflow: 'auto', marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('settings.security.device')}</th>
                <th>{t('settings.security.lastActive')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_SESSIONS.map((session) => (
                <tr key={session.id}>
                  <td style={{ color: 'var(--text-primary)' }}>
                    {t(`settings.security.sessions.${session.deviceKey}`)}
                    {session.current && <span className="badge badge-green" style={{ marginInlineStart: 8 }}>{t('common.current')}</span>}
                  </td>
                  <td>{session.lastActiveKey ? t(`settings.security.sessions.${session.lastActiveKey}`) : session.lastActiveRaw}</td>
                  <td>
                    {!session.current && (
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
                        <Trash2 size={12} /> {t('settings.security.revoke')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
