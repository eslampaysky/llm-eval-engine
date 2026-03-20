import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SignupPage() {
  const { t } = useTranslation();
  const { register, error, clearError, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    navigate('/app/vibe-check', { replace: true });
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    clearError();
    const result = await register({ name, email, password });
    setLoading(false);
    if (result.success) navigate('/app/vibe-check');
  };

  const handleGoogleClick = () => {
    alert(t('auth.signup.googleSoon', 'Google OAuth coming soon! Use email signup for now.'));
  };

  return (
    <div className="fade-in" style={{ maxWidth: 420, margin: '0 auto', padding: '64px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('auth.signup.title', 'Create your account')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {t('auth.signup.subtitle', 'Join 200+ founders who ship with confidence.')}
        </p>
      </div>

      <button
        onClick={handleGoogleClick}
        style={{
          width: '100%',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--line)',
          background: 'var(--bg-surface)',
          color: 'var(--text-primary)',
          fontSize: 14,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          transition: 'all 0.15s',
          fontFamily: 'var(--font-body)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {t('auth.signup.google', 'Continue with Google')}
      </button>

      <div className="divider">or</div>

      <form onSubmit={handleSubmit}>
        {error && <div className="error-box">{error}</div>}

        <div style={{ marginBottom: 14 }}>
          <label className="form-label" htmlFor="signup-name">{t('auth.signup.name', 'Name')}</label>
          <input id="signup-name" className="form-input" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.signup.namePlaceholder', 'Your name')} required />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="form-label" htmlFor="signup-email">{t('auth.signup.email', 'Email')}</label>
          <input id="signup-email" className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.signup.emailPlaceholder', 'you@company.com')} required />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="form-label" htmlFor="signup-password">{t('auth.signup.password', 'Password')}</label>
          <input id="signup-password" className="form-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('auth.signup.passwordPlaceholder', 'Min 8 characters')} required minLength={8} />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', justifyContent: 'center', padding: '12px 20px' }}>
          {loading ? t('auth.signup.submitting', 'Creating account...') : t('auth.signup.submit', 'Create Account')}
        </button>
      </form>

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-muted)' }}>
        {t('auth.signup.hasAccount', 'Already have an account?')} {' '}
        <Link to="/auth/login" style={{ color: 'var(--accent)', fontWeight: 500 }}>
          {t('auth.signup.login', 'Log in')}
        </Link>
      </div>

      <div style={{ textAlign: 'center', marginTop: 16 }}>
        <Link to="/demo" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)', textDecoration: 'none' }}>
          <ArrowLeft size={14} />
          {t('auth.signup.demoFirst', 'See the demo first')}
        </Link>
      </div>
    </div>
  );
}
