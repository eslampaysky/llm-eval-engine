import { Link, Outlet } from 'react-router-dom';
import { css } from '../App.jsx';

export default function PublicLayout() {
  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <header style={{ borderBottom: '1px solid var(--line)', background: 'rgba(12,15,26,.88)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 50 }}>
          <div style={{ maxWidth: 1180, margin: '0 auto', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <div className="logo-mark">
                <div className="logo-dot" />
                AI BREAKER LABS
              </div>
              <div className="logo-sub">Reliability layer for AI-built apps</div>
            </Link>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Link className="btn btn-ghost" to="/auth/login">Login</Link>
              <Link className="btn btn-primary" to="/auth/signup">Sign Up</Link>
            </div>
          </div>
        </header>
        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
