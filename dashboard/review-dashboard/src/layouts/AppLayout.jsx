import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { POLL, PersonaSwitcher, SidebarKey, css } from '../App.jsx';
import { AppShellProvider, useAppShell } from '../context/AppShellContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/app/vibe-check', label: 'Vibe Check', icon: '🚀' },
  { to: '/app/web-audit', label: 'Deep Dive', icon: '🔍' },
  { to: '/app/agent-audit', label: 'Fix & Verify', icon: '🔧' },
  { to: '/app/overview', label: 'Overview', icon: '📊' },
  { to: '/app/audits', label: 'Audits', icon: '📋' },
  { to: '/app/monitoring', label: 'Monitoring', icon: '📡' },
  { to: '/app/api-keys', label: 'API Keys', icon: '🔑' },
  { to: '/app/settings', label: 'Settings', icon: '⚙' },
];

function AppLayoutFrame() {
  const location = useLocation();
  const { logout } = useAuth();
  const { apiKey, setApiKey, groqApiKey, setGroqApiKey, persona, setPersona, running } = useAppShell();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  return (
    <>
      <style>{css}</style>
      <div className="shell">
        <header className="mobilebar">
          <button type="button" className="burger" onClick={() => setNavOpen(true)} aria-label="Open navigation">
            ☰
          </button>
          <div className="mobilebar-title">AI Breaker Labs</div>
        </header>

        <div className={`scrim${navOpen ? ' on' : ''}`} onClick={() => setNavOpen(false)} />

        <aside className={`sidebar${navOpen ? ' open' : ''}`}>
          <div className="logo-area">
            <div className="logo-mark">
              <div className="logo-dot" />
              AI BREAKER LABS
            </div>
            <div className="logo-sub">Reliability layer for AI-built apps</div>
          </div>

          <nav className="nav">
            <div className="nav-group-label">workspace</div>
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-btn${isActive ? ' active' : ''}`}
                  style={{ textDecoration: 'none' }}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              );
            })}
          </nav>

          <div className="sidebar-foot">
            <div className="key-label">Breaker API Key</div>
            <SidebarKey value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <div className="key-label" style={{ marginTop: 12 }}>Groq API Key</div>
            <SidebarKey value={groqApiKey} onChange={(e) => setGroqApiKey(e.target.value)} />
            <button
              className="btn btn-ghost"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              onClick={() => {
                setNavOpen(false);
                logout();
              }}
            >
              Log out
            </button>
          </div>
        </aside>

        <main className="main">
          <div className="main-toolbar">
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase' }}>
              AI Breaker Labs
            </div>
            <PersonaSwitcher persona={persona} setPersona={setPersona} />
          </div>
          <Outlet />
        </main>
      </div>
    </>
  );
}

export default function AppLayout() {
  return (
    <AppShellProvider>
      <AppLayoutFrame />
    </AppShellProvider>
  );
}
