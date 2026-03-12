import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    login(email || 'user@example.com');
    navigate(location.state?.from?.pathname || '/app/dashboard', { replace: true });
  }

  return (
    <section className="page fade-in" style={{ display: 'grid', placeItems: 'center' }}>
      <form className="card" onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-label">Login</div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Any password works for now" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit">Log In</button>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11 }}>
          <Link to="/auth/forgot-password">Forgot password?</Link>
          <Link to="/auth/signup">Create account</Link>
        </div>
      </form>
    </section>
  );
}
