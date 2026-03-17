import { useAuth } from '../../../context/AuthContext.jsx';
import { Trash2 } from 'lucide-react';

const MOCK_SESSIONS = [
  { id: '1', device: 'Chrome on Windows', lastActive: 'Active now', current: true },
  { id: '2', device: 'Safari on iPhone', lastActive: 'Mar 17, 2026', current: false },
];

export default function SecurityPage() {
  const { user } = useAuth();
  const isOAuth = user?.provider === 'google';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {!isOAuth && (
        <div className="card" style={{ padding: 28, maxWidth: 480 }}>
          <div className="card-label">Change Password</div>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <label className="form-label">Current Password</label>
              <input className="form-input" type="password" />
            </div>
            <div>
              <label className="form-label">New Password</label>
              <input className="form-input" type="password" />
            </div>
            <div>
              <label className="form-label">Confirm New Password</label>
              <input className="form-input" type="password" />
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 16 }}>Update Password</button>
        </div>
      )}

      {isOAuth && (
        <div className="card" style={{ padding: 28 }}>
          <div className="card-label">Password</div>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Your account is connected via Google. Password management is handled through your Google account.
          </p>
        </div>
      )}

      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Active Sessions</div>
        <div className="card" style={{ padding: 0, overflow: 'auto', marginTop: 8 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Last Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_SESSIONS.map((s) => (
                <tr key={s.id}>
                  <td style={{ color: 'var(--text-primary)' }}>
                    {s.device}
                    {s.current && <span className="badge badge-green" style={{ marginLeft: 8 }}>Current</span>}
                  </td>
                  <td>{s.lastActive}</td>
                  <td>
                    {!s.current && (
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}>
                        <Trash2 size={12} /> Revoke
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
