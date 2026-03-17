import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  LayoutDashboard, Zap, Search, Wrench, History, Radio,
  Key, Settings, ChevronRight, Menu, X, LogOut
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Core',
    items: [
      { to: '/app/overview', label: 'Overview', icon: LayoutDashboard },
      { to: '/app/vibe-check', label: 'Vibe Check', icon: Zap },
      { to: '/app/web-audit', label: 'Deep Dive', icon: Search },
      { to: '/app/agent-audit', label: 'Fix & Verify', icon: Wrench },
    ],
  },
  {
    label: 'History',
    items: [
      { to: '/app/audits', label: 'Audits', icon: History },
      { to: '/app/monitoring', label: 'Monitoring', icon: Radio },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/app/api-keys', label: 'API Keys', icon: Key },
      { to: '/app/settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function AppLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'var(--sidebar-width) minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)',
      height: '100dvh',
      minHeight: '100vh',
    }}
    className="app-shell"
    >
      {/* ── Mobile header ────────────────────────────────── */}
      <header className="app-mobile-header" style={{
        display: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(6, 8, 16, 0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--line)',
        padding: '0 16px',
        height: 56,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <button
          onClick={() => setSidebarOpen(true)}
          style={{
            background: 'none', border: 'none', color: 'var(--text-secondary)',
            cursor: 'pointer', padding: 4,
          }}
        >
          <Menu size={22} />
        </button>
        <span style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--text-primary)',
        }}>
          AiBreaker
        </span>
        <div style={{ width: 30 }} />
      </header>

      {/* ── Scrim ────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="app-scrim"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 90,
          }}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────── */}
      <aside
        className={`app-sidebar ${sidebarOpen ? 'open' : ''}`}
        style={{
          background: 'var(--bg-base)',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
          minHeight: 0,
        }}
      >
        {/* Logo */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--line)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Link to="/app/overview" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
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
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--text-primary)',
                letterSpacing: '-0.02em',
                lineHeight: 1,
              }}>
                AiBreaker
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginTop: 2,
              }}>
                Reliability Layer
              </div>
            </div>
          </Link>
          <button
            className="app-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            style={{
              display: 'none',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 12px' }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 500,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--text-dim)',
                padding: '4px 8px 6px',
              }}>
                {section.label}
              </div>
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.to ||
                  location.pathname.startsWith(`${item.to}/`);
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      textDecoration: 'none',
                      transition: 'all 0.12s',
                      background: isActive ? 'var(--accent-dim)' : 'transparent',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'var(--bg-elevated)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {isActive && (
                      <div style={{
                        position: 'absolute',
                        left: 0,
                        top: 8,
                        bottom: 8,
                        width: 2,
                        borderRadius: 1,
                        background: 'var(--accent)',
                      }} />
                    )}
                    <Icon size={16} style={{ opacity: isActive ? 1 : 0.6, flexShrink: 0 }} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--line)',
          flexShrink: 0,
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
            }}>
              {(user?.name || user?.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {user?.name || user?.email || 'User'}
              </div>
              <div style={{
                fontSize: 11,
                color: 'var(--text-dim)',
              }}>
                Free plan
              </div>
            </div>
          </div>
          <button
            onClick={logout}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              padding: '8px 0',
              background: 'none',
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s',
              fontFamily: 'var(--font-body)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--line-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)';
              e.currentTarget.style.borderColor = 'var(--line)';
            }}
          >
            <LogOut size={14} />
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <main style={{
        overflowY: 'auto',
        overflowX: 'hidden',
        minHeight: 0,
        background: 'var(--bg-deep)',
      }}
      className="app-main"
      >
        <Outlet />
      </main>

      {/* ── Responsive CSS ───────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .app-shell {
            grid-template-columns: 1fr !important;
            grid-template-rows: auto minmax(0, 1fr) !important;
          }
          .app-mobile-header { display: flex !important; }
          .app-sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: 280px !important;
            z-index: 100 !important;
            transform: translateX(-100%) !important;
            transition: transform 0.25s ease !important;
            box-shadow: 4px 0 24px rgba(0,0,0,0.4) !important;
          }
          .app-sidebar.open {
            transform: translateX(0) !important;
          }
          .app-sidebar-close { display: block !important; }
          .app-main { grid-column: 1 !important; grid-row: 2 !important; }
        }
      `}</style>
    </div>
  );
}
