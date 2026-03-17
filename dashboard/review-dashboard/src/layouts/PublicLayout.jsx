import { useState, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { to: '/demo', label: 'Demo' },
  { to: '/pricing', label: 'Pricing' },
];

export default function PublicLayout() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ── Navbar ──────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        borderBottom: '1px solid var(--line)',
        background: 'rgba(6, 8, 16, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}>
        <div style={{
          maxWidth: 'var(--max-width)',
          margin: '0 auto',
          padding: '0 32px',
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, var(--accent), #1a8fd8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: '#020810',
            }}>
              Ai
            </div>
            <span style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}>
              AiBreaker
            </span>
          </Link>

          {/* Desktop nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="hide-mobile-nav">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                style={({ isActive }) => ({
                  padding: '8px 14px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                })}
              >
                {link.label}
              </NavLink>
            ))}
            <div style={{ width: 1, height: 20, background: 'var(--line)', margin: '0 8px' }} />
            <Link to="/auth/login" style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}>
              Login
            </Link>
            <Link to="/auth/signup" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: 13 }}>
              Get Started
            </Link>
          </nav>

          {/* Mobile hamburger */}
          <button
            className="show-mobile-nav"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div style={{
            padding: '16px 32px 24px',
            borderTop: '1px solid var(--line)',
            background: 'var(--bg-base)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} style={{
                padding: '10px 0',
                fontSize: 14,
                color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}>
                {link.label}
              </Link>
            ))}
            <div style={{ height: 1, background: 'var(--line)', margin: '8px 0' }} />
            <Link to="/auth/login" style={{
              padding: '10px 0',
              fontSize: 14,
              color: 'var(--text-secondary)',
              textDecoration: 'none',
            }}>
              Login
            </Link>
            <Link to="/auth/signup" className="btn btn-primary" style={{ textAlign: 'center', marginTop: 8 }}>
              Get Started
            </Link>
          </div>
        )}
      </header>

      {/* ── Main content ───────────────────────────────────── */}
      <main style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </main>

      {/* ── CSS for responsive nav ─────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .hide-mobile-nav { display: none !important; }
          .show-mobile-nav { display: flex !important; }
        }
        @media (min-width: 769px) {
          .show-mobile-nav { display: none !important; }
        }
      `}</style>
    </div>
  );
}
