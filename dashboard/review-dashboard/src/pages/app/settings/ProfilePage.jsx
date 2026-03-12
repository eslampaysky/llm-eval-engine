/**
 * Profile settings.
 * - Shows identity and account stats
 * - Edits name/email via PATCH /auth/me
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authFetch, useAuth } from '../../../context/AuthContext.jsx';

const S = {
  card: {
    background: '#0c1220',
    border: '1px solid rgba(33,57,90,0.7)',
    borderRadius: 12,
    padding: '22px 24px',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'rgba(232,244,255,0.9)',
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12,
    color: 'rgba(142,168,199,0.65)',
    marginBottom: 18,
    lineHeight: 1.5,
  },
  label: {
    display: 'block',
    marginBottom: 5,
    fontSize: 10.5,
    color: 'rgba(142,168,199,0.7)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(33,57,90,0.9)',
    borderRadius: 8,
    color: 'rgba(232,244,255,0.93)',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 13.5,
    padding: '10px 13px',
    outline: 'none',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    boxSizing: 'border-box',
  },
};

function SaveButton({ saving, saved }) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        padding: '9px 20px',
        borderRadius: 8,
        background: saved ? 'rgba(38,240,185,0.12)' : 'rgba(59,180,255,0.12)',
        border: `1px solid ${saved ? 'rgba(38,240,185,0.35)' : 'rgba(59,180,255,0.35)'}`,
        color: saved ? 'var(--accent2)' : 'var(--accent)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12,
        fontWeight: 700,
        cursor: saving ? 'wait' : 'pointer',
        opacity: saving ? 0.75 : 1,
        transition: 'all 0.15s',
      }}
    >
      {saving ? 'Saving...' : saved ? 'Saved' : 'Save changes'}
    </button>
  );
}

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div
      style={{
        background: 'rgba(255,77,109,0.08)',
        border: '1px solid rgba(255,77,109,0.25)',
        borderRadius: 8,
        padding: '10px 14px',
        color: '#ff4d6d',
        fontSize: 12.5,
        marginTop: 12,
      }}
    >
      {msg}
    </div>
  );
}

function Avatar({ name, size = 64 }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(59,180,255,0.65), rgba(38,240,185,0.55))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 800,
        fontSize: size * 0.35,
        color: '#02050d',
        flexShrink: 0,
        boxShadow: '0 0 0 2px rgba(59,180,255,0.22)',
      }}
    >
      {initials}
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(33,57,90,0.65)',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 10,
          color: 'rgba(142,168,199,0.55)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: 'rgba(232,244,255,0.92)' }}>{value}</div>
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const memberSince = useMemo(() => {
    if (!user?.created_at) return '--';
    try {
      return new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return '--';
    }
  }, [user?.created_at]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const data = await authFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      updateUser(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      if (err.status === 405 || err.status === 404) {
        setError('Profile editing is not enabled on this server yet.');
      } else {
        setError(err.message || 'Update failed.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <Avatar name={user?.name} size={72} />
          <div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 800,
                fontFamily: "'Space Grotesk', sans-serif",
                color: 'rgba(232,244,255,0.97)',
                marginBottom: 3,
              }}
            >
              {user?.name || 'Unknown User'}
            </div>
            <div
              style={{
                fontSize: 13,
                color: 'rgba(142,168,199,0.7)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {user?.email || '--'}
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <StatChip label="Member since" value={memberSince} />
          <StatChip label="Account ID" value={user?.user_id ? `${user.user_id.slice(0, 8)}...` : '--'} />
          <StatChip label="Plan" value="Free" />
        </div>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>Personal Information</div>
        <div style={S.sectionDesc}>Update your display name and email address.</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>Display Name</label>
            <input
              style={S.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              required
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)';
                e.target.style.boxShadow = 'var(--accent-glow)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(33,57,90,0.9)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div>
            <label style={S.label}>Email Address</label>
            <input
              type="email"
              style={S.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--accent)';
                e.target.style.boxShadow = 'var(--accent-glow)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(33,57,90,0.9)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <ErrorBanner msg={error} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <SaveButton saving={saving} saved={saved} />
          </div>
        </form>
      </div>

      <div
        style={{
          ...S.card,
          border: '1px solid rgba(255,77,109,0.2)',
          background: 'rgba(255,77,109,0.03)',
        }}
      >
        <div style={{ ...S.sectionTitle, color: '#ff4d6d' }}>Danger Zone</div>
        <div style={S.sectionDesc}>Account deletion is handled in the Security tab. This action is permanent.</div>
        <button
          type="button"
          onClick={() => {
            navigate('/app/settings/security');
          }}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            background: 'rgba(255,77,109,0.08)',
            border: '1px solid rgba(255,77,109,0.3)',
            color: '#ff4d6d',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Go to Security
        </button>
      </div>
    </div>
  );
}
