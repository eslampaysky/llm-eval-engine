import { useState } from 'react';
import { Link } from 'react-router-dom';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <section className="page fade-in" style={{ display: 'grid', placeItems: 'center' }}>
      <form className="card" onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-label">Forgot Password</div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit">Send Reset Link</button>
        {submitted && <div style={{ marginTop: 12, color: 'var(--mid)' }}>Mock flow only: a reset email would be sent to {email || 'your inbox'}.</div>}
        <div style={{ marginTop: 12, fontSize: 11 }}>
          <Link to="/auth/login">Back to login</Link>
        </div>
      </form>
    </section>
  );
}
