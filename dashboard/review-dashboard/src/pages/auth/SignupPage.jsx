import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    signup(email || 'user@example.com');
    navigate('/app/dashboard', { replace: true });
  }

  return (
    <section className="page fade-in" style={{ display: 'grid', placeItems: 'center' }}>
      <form className="card" onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 420 }}>
        <div className="card-label">Sign Up</div>
        <div className="field">
          <label className="label">Work email</label>
          <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="you@company.com" />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Create a password" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} type="submit">Create Account</button>
        <div style={{ marginTop: 12, fontSize: 11 }}>
          Already have an account? <Link to="/auth/login">Log in</Link>
        </div>
      </form>
    </section>
  );
}
