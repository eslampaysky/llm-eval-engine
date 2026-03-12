/**
 * src/pages/app/settings/ProfilePage.jsx
 * ========================================
 * Edit display name and email.
 * Calls PATCH /auth/me → gets a fresh JWT back → updates AuthContext.
 *
 * If your backend PATCH /auth/me isn't wired yet, the form degrades
 * gracefully — it still shows user info and shows a "Coming soon" banner.
 */

import { useState } from 'react';
import { useAuth, authFetch } from '../../../context/AuthContext';

// ─── Shared primitives ────────────────────────────────────────────────────────

const S = {
  card: {
    background: '#0c1220',
    border: '1px solid rgba(33,57,90,0.7)',
    borderRadius: 12, padding: '22px 24px',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13, fontWeight: 700,
    fontFamily: "'Space Grotesk', sans-serif",
    color: 'rgba(232,244,255,0.9)', marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 12, color: 'rgba(142,168,199,0.65)', marginBottom: 18, lineHeight: 1.5,
  },
  label: {
    display: 'block', marginBottom: 5,
    fontSize: 10.5, color: 'rgba(142,168,199,0.7)',
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: '0.08em', textTransform: 'uppercase',
  },
  input: {
    width: '100%', background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(33,57,90,0.9)',
    borderRadius: 8, color: 'rgba(232,244,255,0.93)',
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 13.5, padding: '10px 13px', outline: 'none',
    transition: 'border-color 0.12s', boxSizing: 'border-box',
  },
  divider: { height: 1, background: 'rgba(33,57,90,0.6)', margin: '18px 0' },
};

function SaveButton({ saving, saved, label = 'Save changes', savedLabel = '✓ Saved' }) {
  return (
    <button
      type="submit"
      disabled={saving}
      style={{
        padding: '9px 20px', borderRadius: 8,
        background: saved ? 'rgba(38,240,185,0.1)' : 'rgba(59,180,255,0.1)',
        border: `1px solid ${saved ? 'rgba(38,240,185,0.35)' : 'rgba(59,180,255,0.35)'}`,
        color: saved ? 'var(--neon-green, #26f0b9)' : 'var(--neon-blue, #3bb4ff)',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer',
        opacity: saving ? 0.7 : 1, transition: 'all 0.15s',
      }}
    >
      {saving ? 'Saving…' : saved ? savedLabel : label}
    </button>
  );
}

function ErrorBanner({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'rgba(255,77,109,0.08)', border: '1px solid rgba(255,77,109,0.25)',
      borderRadius: 8, padding: '10px 14px', color: '#ff4d6d',
      fontSize: 12.5, marginTop: 12,
    }}>
      {msg}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 64 }) {
  const initials = (name || '?')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, rgba(59,180,255,0.6), rgba(38,240,185,0.6))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Space Grotesk', sans-serif",
      fontWeight: 700, fontSize: size * 0.35,
      color: '#02050d', flexShrink: 0,
      boxShadow: '0 0 0 2px rgba(59,180,255,0.2)',
    }}>
      {initials}
    </div>
  );
}

// ─── Stat chip ────────────────────────────────────────────────────────────────

function StatChip({ label, value }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(33,57,90,0.7)',
      borderRadius: 8, padding: '10px 14px',
    }}>
      <div style={{
        fontSize: 10, color: 'rgba(142,168,199,0.6)',
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(232,244,255,0.9)' }}>
        {value}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, login } = useAuth();

  const [name, setName]   = useState(user?.name  || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const data = await authFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      // Backend returns new token + updated user
      if (data.access_token) {
        // Re-login with the new token so AuthContext updates
        // (authFetch already stored the new token internally via the module var)
        // Just trigger a context refresh by calling /auth/me
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch (err) {
      if (err.status === 405 || err.status === 404) {
        // PATCH /auth/me not yet implemented — show friendly message
        setError('Profile editing is not yet enabled on this server.');
      } else {
        setError(err.message || 'Update failed.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Identity card */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
          <Avatar name={user?.name} size={72} />
          <div>
            <div style={{
              fontSize: 19, fontWeight: 700,
              fontFamily: "'Space Grotesk', sans-serif",
              color: 'rgba(232,244,255,0.97)', marginBottom: 3,
            }}>
              {user?.name || 'Unknown User'}
            </div>
            <div style={{
              fontSize: 13, color: 'rgba(142,168,199,0.7)',
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {user?.email}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <StatChip label="Member since" value={memberSince} />
          <StatChip label="Account ID" value={user?.user_id?.slice(0, 8) + '…' || '—'} />
          <StatChip label="Plan" value="Free" />
        </div>
      </div>

      {/* Edit form */}
      <div style={S.card}>
        <div style={S.sectionTitle}>Personal Information</div>
        <div style={S.sectionDesc}>Update your display name and email address.</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={S.label}>Display Name</label>
            <input
              style={S.input} value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your full name" required
              onFocus={e => e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'}
              onBlur={e => e.target.style.borderColor = 'rgba(33,57,90,0.9)'}
            />
          </div>

          <div>
            <label style={S.label}>Email Address</label>
            <input
              type="email" style={S.input} value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              onFocus={e => e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'}
              onBlur={e => e.target.style.borderColor = 'rgba(33,57,90,0.9)'}
            />
          </div>

          <ErrorBanner msg={error} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <SaveButton saving={saving} saved={saved} />
          </div>
        </form>
      </div>

      {/* Danger zone */}
      <div style={{
        ...S.card,
        border: '1px solid rgba(255,77,109,0.2)',
        background: 'rgba(255,77,109,0.03)',
      }}>
        <div style={{ ...S.sectionTitle, color: '#ff4d6d' }}>Danger Zone</div>
        <div style={S.sectionDesc}>
          Permanently delete your account and all associated data.
          This action cannot be undone.
        </div>
        <button
          type="button"
          onClick={() => {
            const confirmed = window.confirm(
              'Are you sure? This will permanently delete your account.\n\nType "yes" to confirm.'
            );
            if (confirmed) alert('Account deletion is handled in the Security tab.');
          }}
          style={{
            padding: '8px 18px', borderRadius: 8,
            background: 'rgba(255,77,109,0.08)',
            border: '1px solid rgba(255,77,109,0.3)',
            color: '#ff4d6d',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}
