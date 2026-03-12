/**
 * Security settings.
 * - Change password (POST /auth/change-password)
 * - Active session info (derived from user agent)
 * - Delete account with confirmation (DELETE /auth/me)
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
    fontWeight: 800,
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

function Banner({ type, msg }) {
  if (!msg) return null;
  const cfg =
    type === 'success'
      ? { bg: 'rgba(38,240,185,0.07)', br: 'rgba(38,240,185,0.25)', fg: 'var(--accent2)' }
      : { bg: 'rgba(255,77,109,0.08)', br: 'rgba(255,77,109,0.25)', fg: '#ff4d6d' };
  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${cfg.br}`,
        borderRadius: 8,
        padding: '10px 14px',
        color: cfg.fg,
        fontSize: 12.5,
        marginTop: 12,
      }}
    >
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
        value={value}
        onChange={onChange}
        placeholder={placeholder || '********'}
        autoComplete={autoComplete || 'off'}
        onFocus={(e) => {
          e.target.style.borderColor = 'var(--accent)';
          e.target.style.boxShadow = 'var(--accent-glow)';
        }}
        onBlur={(e) => {
          e.target.style.borderColor = 'rgba(33,57,90,0.9)';
          e.target.style.boxShadow = 'none';
        }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(33,57,90,0.9)',
          borderRadius: 8,
          color: 'rgba(142,168,199,0.6)',
          padding: '0 13px',
          cursor: 'pointer',
          fontSize: 12,
          flexShrink: 0,
        }}
        aria-label={show ? 'Hide password' : 'Show password'}
      >
        {show ? 'hide' : 'show'}
      </button>
    </div>
  );
}

function StrengthMeter({ password }) {
  const score = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s += 1;
    if (password.length >= 12) s += 1;
    if (/[A-Z]/.test(password)) s += 1;
    if (/[0-9]/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return s;
  }, [password]);

  if (!password) return null;

  const label = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'][score] || '';
  const colors = ['', '#ff4d6d', 'var(--accent)', 'var(--accent)', 'var(--accent2)', 'var(--accent2)'];
  const color = colors[score] || 'transparent';

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= score ? color : 'rgba(33,57,90,0.8)',
              transition: 'background 0.2s',
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 10.5, color, fontFamily: "'JetBrains Mono', monospace" }}>
        Strength: <span style={{ fontWeight: 800 }}>{label}</span>
      </div>
    </div>
  );
}

function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await authFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setSuccess('Password updated successfully.');
    } catch (err) {
      if (err.status === 405 || err.status === 404) {
        setError('Password change is not enabled on this server yet.');
      } else if (err.status === 401) {
        setError('Current password is incorrect.');
      } else {
        setError(err.message || 'Update failed.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>Change Password</div>
      <div style={S.sectionDesc}>Update your password. A strong password is recommended.</div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={S.label}>Current Password</label>
          <PwInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" />
        </div>
        <div>
          <label style={S.label}>New Password</label>
          <PwInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          <StrengthMeter password={newPassword} />
        </div>

        <Banner type="error" msg={error} />
        <Banner type="success" msg={success} />

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '9px 18px',
              borderRadius: 8,
              background: 'var(--accent)',
              color: '#020810',
              border: '1px solid rgba(59,180,255,0.2)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.75 : 1,
            }}
          >
            {saving ? 'Updating...' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  );
}

function parseSession() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isWindows = /Windows/i.test(ua);
  const isMac = /Macintosh/i.test(ua);
  const isLinux = /Linux/i.test(ua) && !/Android/i.test(ua);
  const os = isWindows ? 'Windows' : isMac ? 'macOS' : isLinux ? 'Linux' : 'Unknown OS';

  const isChrome = /Chrome/i.test(ua) && !/Edg/i.test(ua);
  const isEdge = /Edg/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua);
  const browser = isEdge ? 'Edge' : isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : 'Unknown Browser';

  return { os, browser };
}

function ActiveSessionsSection({ onLogout }) {
  const session = useMemo(() => parseSession(), []);
  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>Active Session</div>
      <div style={S.sectionDesc}>
        This dashboard keeps a single in-memory session per tab (no localStorage token persistence).
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderRadius: 10,
          border: '1px solid rgba(33,57,90,0.65)',
          background: 'rgba(255,255,255,0.02)',
        }}
      >
        <div>
          <div style={{ color: 'rgba(232,244,255,0.9)', fontWeight: 700 }}>{session.browser}</div>
          <div style={{ color: 'rgba(142,168,199,0.55)', fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
            {session.os}
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          style={{
            padding: '8px 14px',
            borderRadius: 8,
            background: 'rgba(59,180,255,0.12)',
            border: '1px solid rgba(59,180,255,0.3)',
            color: 'var(--accent)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

function DeleteAccountSection() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

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
        setError('Account deletion is not enabled on this server yet.');
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
    <div
      style={{
        ...S.card,
        border: '1px solid rgba(255,77,109,0.2)',
        background: 'rgba(255,77,109,0.02)',
      }}
    >
      <div style={{ ...S.sectionTitle, color: '#ff4d6d' }}>Delete Account</div>
      <div style={S.sectionDesc}>
        Deactivates your account. Your data, targets, and run history will be inaccessible. This cannot be undone.
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            padding: '8px 18px',
            borderRadius: 8,
            background: 'rgba(255,77,109,0.08)',
            border: '1px solid rgba(255,77,109,0.3)',
            color: '#ff4d6d',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          I want to delete my account
        </button>
      ) : (
        <form onSubmit={handleDelete} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ ...S.label, color: 'rgba(255,77,109,0.7)' }}>Confirm Password</label>
            <PwInput value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label style={{ ...S.label, color: 'rgba(255,77,109,0.7)' }}>Type "DELETE MY ACCOUNT" to confirm</label>
            <input
              style={{ ...S.input, borderColor: 'rgba(255,77,109,0.3)' }}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE MY ACCOUNT"
              onFocus={(e) => {
                e.target.style.borderColor = '#ff4d6d';
                e.target.style.boxShadow = '0 0 0 3px rgba(255,77,109,0.12)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(255,77,109,0.3)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <Banner type="error" msg={error} />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
                setPassword('');
                setConfirm('');
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 7,
                background: 'none',
                border: '1px solid rgba(33,57,90,0.8)',
                color: 'rgba(142,168,199,0.7)',
                cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting}
              style={{
                padding: '8px 18px',
                borderRadius: 7,
                background: 'rgba(255,77,109,0.15)',
                border: '1px solid rgba(255,77,109,0.4)',
                color: '#ff4d6d',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 12,
                fontWeight: 800,
                cursor: deleting ? 'wait' : 'pointer',
                opacity: deleting ? 0.75 : 1,
              }}
            >
              {deleting ? 'Deleting...' : 'Delete account'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default function SecurityPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();

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

