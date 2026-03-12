/**
 * src/pages/app/settings/SecurityPage.jsx
 * =========================================
 * - Change password (POST /auth/change-password)
 * - Active sessions display (in-memory only, no persistence)
 * - Delete account with confirmation (DELETE /auth/me)
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, authFetch } from '../../../context/AuthContext';

// ─── Shared style tokens ──────────────────────────────────────────────────────

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
};

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

function SuccessBanner({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      background: 'rgba(38,240,185,0.07)', border: '1px solid rgba(38,240,185,0.25)',
      borderRadius: 8, padding: '10px 14px', color: '#26f0b9',
      fontSize: 12.5, marginTop: 12,
    }}>
      {msg}
    </div>
  );
}

function PwInput({ value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input
        type={show ? 'text' : 'password'}
        style={{ ...S.input, flex: 1 }}
        value={value} onChange={onChange}
        placeholder={placeholder || '••••••••'}
        autoComplete={autoComplete || 'off'}
        onFocus={e => e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'}
        onBlur={e => e.target.style.borderColor = 'rgba(33,57,90,0.9)'}
      />
      <button
        type="button" onClick={() => setShow(s => !s)}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(33,57,90,0.9)',
          borderRadius: 8, color: 'rgba(142,168,199,0.6)',
          padding: '0 13px', cursor: 'pointer', fontSize: 14, flexShrink: 0,
        }}
      >
        {show ? '🙈' : '👁'}
      </button>
    </div>
  );
}

// ─── Password strength meter ──────────────────────────────────────────────────

function StrengthMeter({ password }) {
  const score = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8)  s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  })();

  const label = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][score] || '';
  const colors = ['', '#ff4d6d', '#f0a500', '#3bb4ff', '#26f0b9', '#26f0b9'];
  const color  = colors[score] || 'transparent';

  if (!password) return null;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1,2,3,4,5].map(i => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= score ? color : 'rgba(33,57,90,0.8)',
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <div style={{
        fontSize: 10.5, color,
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {label}
      </div>
    </div>
  );
}

// ─── Change Password Section ──────────────────────────────────────────────────

function ChangePasswordSection() {
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setError('New passwords do not match.'); return; }
    if (next === current) { setError('New password must differ from current password.'); return; }

    setSaving(true);
    try {
      await authFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      setSuccess('Password updated successfully.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      if (err.status === 405 || err.status === 404) {
        setError('Password change is not yet enabled on this server.');
      } else if (err.status === 401) {
        setError('Current password is incorrect.');
      } else {
        setError(err.message || 'Password update failed.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>Change Password</div>
      <div style={S.sectionDesc}>
        Choose a strong password with at least 8 characters, a mix of letters, numbers, and symbols.
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={S.label}>Current Password</label>
          <PwInput
            value={current} onChange={e => setCurrent(e.target.value)}
            placeholder="Your current password" autoComplete="current-password"
          />
        </div>
        <div>
          <label style={S.label}>New Password</label>
          <PwInput
            value={next} onChange={e => setNext(e.target.value)}
            placeholder="At least 8 characters" autoComplete="new-password"
          />
          <StrengthMeter password={next} />
        </div>
        <div>
          <label style={S.label}>Confirm New Password</label>
          <PwInput
            value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder="Repeat new password" autoComplete="new-password"
          />
        </div>
        <ErrorBanner msg={error} />
        <SuccessBanner msg={success} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            type="submit" disabled={saving}
            style={{
              padding: '9px 20px', borderRadius: 8,
              background: 'rgba(59,180,255,0.1)',
              border: '1px solid rgba(59,180,255,0.35)',
              color: 'var(--neon-blue, #3bb4ff)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12, fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Active Sessions (informational) ─────────────────────────────────────────

function ActiveSessionsSection({ onLogout }) {
  const now = new Date();
  const browser = navigator.userAgent.includes('Chrome') ? 'Chrome'
    : navigator.userAgent.includes('Firefox') ? 'Firefox'
    : navigator.userAgent.includes('Safari') ? 'Safari' : 'Browser';
  const os = navigator.userAgent.includes('Windows') ? 'Windows'
    : navigator.userAgent.includes('Mac') ? 'macOS'
    : navigator.userAgent.includes('Linux') ? 'Linux' : 'Unknown OS';

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>Active Sessions</div>
      <div style={S.sectionDesc}>
        Sessions are stored in memory only. Refreshing the page ends your session automatically.
      </div>

      {/* Current session row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px',
        background: 'rgba(59,180,255,0.05)',
        border: '1px solid rgba(59,180,255,0.15)',
        borderRadius: 9,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'rgba(59,180,255,0.1)',
            border: '1px solid rgba(59,180,255,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>
            💻
          </div>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(232,244,255,0.9)', fontWeight: 500 }}>
              {browser} on {os}
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(142,168,199,0.6)',
              fontFamily: "'JetBrains Mono', monospace", marginTop: 2,
            }}>
              Started {now.toLocaleTimeString()} · Current session
            </div>
          </div>
        </div>
        <span style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: '#26f0b9',
          background: 'rgba(38,240,185,0.1)',
          border: '1px solid rgba(38,240,185,0.25)',
          padding: '3px 9px', borderRadius: 4,
        }}>
          active
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          onClick={onLogout}
          style={{
            padding: '8px 16px', borderRadius: 7,
            background: 'none',
            border: '1px solid rgba(255,77,109,0.3)',
            color: '#ff4d6d',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Sign out of all sessions
        </button>
      </div>
    </div>
  );
}

// ─── Delete Account Section ───────────────────────────────────────────────────

function DeleteAccountSection() {
  const { logout } = useAuth();
  const navigate   = useNavigate();
  const [open,     setOpen]    = useState(false);
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error,    setError]    = useState('');

  async function handleDelete(e) {
    e.preventDefault();
    setError('');
    if (confirm !== 'DELETE MY ACCOUNT') {
      setError('You must type exactly: DELETE MY ACCOUNT');
      return;
    }
    setDeleting(true);
    try {
      await authFetch('/auth/me', {
        method: 'DELETE',
        body: JSON.stringify({ password, confirm }),
      });
      logout();
      navigate('/auth/login', { replace: true });
    } catch (err) {
      if (err.status === 405 || err.status === 404) {
        setError('Account deletion is not yet enabled on this server.');
      } else if (err.status === 401) {
        setError('Incorrect password.');
      } else {
        setError(err.message || 'Deletion failed.');
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{
      ...S.card,
      border: '1px solid rgba(255,77,109,0.2)',
      background: 'rgba(255,77,109,0.02)',
    }}>
      <div style={{ ...S.sectionTitle, color: '#ff4d6d' }}>Delete Account</div>
      <div style={S.sectionDesc}>
        Permanently deactivates your account. All your data, targets, and run history
        will be inaccessible. This cannot be undone.
      </div>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          style={{
            padding: '8px 18px', borderRadius: 8,
            background: 'rgba(255,77,109,0.08)',
            border: '1px solid rgba(255,77,109,0.3)',
            color: '#ff4d6d',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          I want to delete my account
        </button>
      ) : (
        <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ ...S.label, color: 'rgba(255,77,109,0.7)' }}>Confirm Password</label>
            <PwInput value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div>
            <label style={{ ...S.label, color: 'rgba(255,77,109,0.7)' }}>
              Type "DELETE MY ACCOUNT" to confirm
            </label>
            <input
              style={{ ...S.input, borderColor: 'rgba(255,77,109,0.3)' }}
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              onFocus={e => e.target.style.borderColor = '#ff4d6d'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,77,109,0.3)'}
            />
          </div>
          <ErrorBanner msg={error} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button" onClick={() => { setOpen(false); setError(''); setPassword(''); setConfirm(''); }}
              style={{
                padding: '8px 16px', borderRadius: 7,
                background: 'none', border: '1px solid rgba(33,57,90,0.8)',
                color: 'rgba(142,168,199,0.7)', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              }}
            >
              Cancel
            </button>
            <button
              type="submit" disabled={deleting}
              style={{
                padding: '8px 18px', borderRadius: 7,
                background: 'rgba(255,77,109,0.15)',
                border: '1px solid rgba(255,77,109,0.4)',
                color: '#ff4d6d',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12, fontWeight: 600,
                cursor: deleting ? 'wait' : 'pointer',
                opacity: deleting ? 0.7 : 1,
              }}
            >
              {deleting ? 'Deleting…' : 'Delete Account'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  function handleLogout() {
    logout();
    navigate('/auth/login', { replace: true });
  }

  return (
    <div>
      <ChangePasswordSection />
      <ActiveSessionsSection onLogout={handleLogout} />
      <DeleteAccountSection />
    </div>
  );
}
