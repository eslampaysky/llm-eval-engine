import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SignupPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const result = await registerUser({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
    });
    setSubmitting(false);

    if (result.success) {
      navigate('/app/dashboard', { replace: true });
    } else {
      setError(result.error || 'Registration failed.');
    }
  }

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(33,57,90,0.9)',
    borderRadius: 8,
    color: 'rgba(232,244,255,0.95)',
    fontFamily: 'Space Grotesk, sans-serif',
    fontSize: 14,
    padding: '11px 14px',
    outline: 'none',
    transition: 'border-color 0.12s',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    marginBottom: 6,
    fontSize: 11,
    color: 'rgba(142,168,199,0.8)',
    fontFamily: 'JetBrains Mono, monospace',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg, #05070d)',
      padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'linear-gradient(140deg, var(--neon-blue, #3bb4ff), var(--neon-green, #26f0b9))',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700,
            fontSize: 18,
            color: '#011320',
            marginBottom: 14,
          }}>
            AB
          </div>
          <div style={{
            fontSize: 24,
            fontWeight: 700,
            fontFamily: 'Space Grotesk, sans-serif',
            color: 'rgba(232,244,255,0.97)',
            letterSpacing: '-0.02em',
          }}>
            Create your account
          </div>
          <div style={{ color: 'rgba(142,168,199,0.7)', fontSize: 13, marginTop: 4 }}>
            Start stress-testing AI systems in minutes
          </div>
        </div>

        <div style={{
          background: '#0c1220',
          border: '1px solid rgba(33,57,90,0.9)',
          borderRadius: 14,
          padding: '28px 30px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={labelStyle}>Full Name</label>
              <input
                type="text"
                style={inputStyle}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Alice Smith"
                required
                autoComplete="name"
                onFocus={(e) => { e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
              />
            </div>

            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                style={inputStyle}
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                onFocus={(e) => { e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
              />
            </div>

            <div>
              <label style={labelStyle}>Password</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  style={{ ...inputStyle, flex: 1 }}
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Min. 8 characters"
                  required
                  autoComplete="new-password"
                  onFocus={(e) => { e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(33,57,90,0.9)',
                    borderRadius: 8,
                    color: 'rgba(142,168,199,0.7)',
                    padding: '0 14px',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  {showPw ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input
                type={showPw ? 'text' : 'password'}
                style={inputStyle}
                value={form.confirm}
                onChange={(e) => set('confirm', e.target.value)}
                placeholder="Repeat your password"
                required
                autoComplete="new-password"
                onFocus={(e) => { e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
              />
            </div>

            {error && (
              <div style={{
                background: 'rgba(255,77,109,0.08)',
                border: '1px solid rgba(255,77,109,0.3)',
                borderRadius: 8,
                padding: '10px 14px',
                color: '#ff4d6d',
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: '12px',
                borderRadius: 9,
                marginTop: 4,
                background: 'rgba(38,240,185,0.1)',
                border: '1px solid rgba(38,240,185,0.35)',
                color: 'var(--neon-green, #26f0b9)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {submitting ? (
                <>
                  <div style={{
                    width: 13,
                    height: 13,
                    border: '2px solid rgba(38,240,185,0.3)',
                    borderTopColor: 'var(--neon-green, #26f0b9)',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Creating account...
                </>
              ) : 'Create account'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(142,168,199,0.6)' }}>
          Already have an account?{' '}
          <Link
            to="/auth/login"
            style={{ color: 'var(--neon-blue, #3bb4ff)', textDecoration: 'none', fontWeight: 600 }}
          >
            Sign in
          </Link>
        </div>
      </div>

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
