import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function LoginPage() {
  const { login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const from = location.state?.from?.pathname || '/app/dashboard';

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const result = await login({ email, password });
    setSubmitting(false);
    if (result.success) {
      navigate(from, { replace: true });
    } else {
      setError(result.error || 'Login failed.');
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
            Welcome back
          </div>
          <div style={{ color: 'rgba(142,168,199,0.7)', fontSize: 13, marginTop: 4 }}>
            Sign in to AI Breaker Labs
          </div>
        </div>

        <div style={{
          background: '#0c1220',
          border: '1px solid rgba(33,57,90,0.9)',
          borderRadius: 14,
          padding: '28px 30px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                type="email"
                style={inputStyle}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                onFocus={(e) => { e.target.style.borderColor = 'var(--neon-blue, #3bb4ff)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(33,57,90,0.9)'; }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ ...labelStyle, marginBottom: 0 }}>Password</label>
                <Link
                  to="/auth/forgot-password"
                  style={{
                    fontSize: 11,
                    color: 'var(--neon-blue, #3bb4ff)',
                    textDecoration: 'none',
                    fontFamily: 'JetBrains Mono, monospace',
                  }}
                >
                  Forgot password?
                </Link>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  style={{ ...inputStyle, flex: 1 }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
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
              disabled={submitting || authLoading}
              style={{
                padding: '12px',
                borderRadius: 9,
                marginTop: 4,
                background: 'rgba(59,180,255,0.12)',
                border: '1px solid rgba(59,180,255,0.4)',
                color: 'var(--neon-blue, #3bb4ff)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                transition: 'all 0.12s',
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
                    border: '2px solid rgba(59,180,255,0.3)',
                    borderTopColor: 'var(--neon-blue, #3bb4ff)',
                    borderRadius: '50%',
                    animation: 'spin 0.7s linear infinite',
                  }} />
                  Signing in...
                </>
              ) : 'Sign in'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'rgba(142,168,199,0.6)' }}>
          Don't have an account?{' '}
          <Link
            to="/auth/signup"
            style={{ color: 'var(--neon-blue, #3bb4ff)', textDecoration: 'none', fontWeight: 600 }}
          >
            Sign up free
          </Link>
        </div>
      </div>

      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
