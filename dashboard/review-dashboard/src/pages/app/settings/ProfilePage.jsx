import { useState } from 'react';
import { useAuth } from '../../../context/AuthContext.jsx';
import { Camera } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const isOAuth = user?.provider === 'google';

  return (
    <div>
      <div className="card" style={{ padding: 28 }}>
        <div className="card-label">Profile</div>

        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'var(--bg-surface)', border: '2px solid var(--line)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 700,
            color: 'var(--accent)', position: 'relative', cursor: 'pointer',
          }}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
            <div style={{
              position: 'absolute', bottom: 0, right: 0,
              width: 24, height: 24, borderRadius: '50%',
              background: 'var(--bg-elevated)', border: '1px solid var(--line)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Camera size={12} style={{ color: 'var(--text-muted)' }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>Upload avatar</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>JPG, PNG. Max 2MB.</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 16, maxWidth: 400 }}>
          <div>
            <label className="form-label">Display Name</label>
            <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="form-label">Email</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="form-input" value={user?.email || ''} readOnly
                style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              {isOAuth && (
                <span className="badge badge-blue">Connected via Google</span>
              )}
            </div>
          </div>
        </div>

        <button className="btn btn-primary" style={{ marginTop: 20 }}>Save Changes</button>
      </div>
    </div>
  );
}
