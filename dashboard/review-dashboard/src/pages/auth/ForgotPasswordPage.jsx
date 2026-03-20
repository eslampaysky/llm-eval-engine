import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSent(true);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 420, margin: '0 auto', padding: '64px 24px 80px' }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('auth.forgotPassword.title', 'Reset your password')}
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
          {t('auth.forgotPassword.subtitle', "Enter your email and we'll send you a reset link.")}
        </p>
      </div>

      {sent ? (
        <div className="success-box">
          {t('auth.forgotPassword.success', "Check your inbox for a password reset link. If you don't see it, check your spam folder.")}
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label className="form-label" htmlFor="forgot-email">{t('auth.forgotPassword.email', 'Email')}</label>
            <input id="forgot-email" className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('auth.forgotPassword.emailPlaceholder', 'you@company.com')} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px 20px' }}>
            {t('auth.forgotPassword.submit', 'Send Reset Link')}
          </button>
        </form>
      )}

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'var(--text-muted)' }}>
        {t('auth.forgotPassword.remembered', 'Remember your password?')} {' '}
        <Link to="/auth/login" style={{ color: 'var(--accent)', fontWeight: 500 }}>
          {t('auth.forgotPassword.login', 'Log in')}
        </Link>
      </div>
    </div>
  );
}
