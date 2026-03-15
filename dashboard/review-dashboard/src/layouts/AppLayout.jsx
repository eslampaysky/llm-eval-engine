import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { POLL, PersonaSwitcher, SidebarKey, css } from '../App.jsx';
import { AppShellProvider, useAppShell } from '../context/AppShellContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: '◆' },
  { to: '/app/targets', label: 'Targets', icon: '◈' },
  { to: '/app/runs', label: 'Runs', icon: '◷' },
  { to: '/app/audit', label: 'Audit Report', icon: '📋' },
  { to: '/app/hitl', label: 'HITL Review', icon: '✎' },
  { to: '/app/playground', label: 'Playground', icon: '⚡' },
  { to: '/app/agentic', label: 'Agentic', icon: '*' },
  { to: '/app/compare', label: 'Compare', icon: '⇌' },
  { to: '/app/api-keys', label: 'API Keys', icon: '⌘' },
  { to: '/app/config-builder', label: 'Config Builder', icon: '⚙' },
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
            <div className="logo-sub">AI model stress-tester</div>
          </div>

          <nav className="nav">
            <div className="nav-group-label">workspace</div>
            {NAV_ITEMS.map((item) => {
              const isActive = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
              const isPlayground = item.to === '/app/playground' && running && POLL.mode === 'break';
              const isHitl = item.to === '/app/hitl';
              return (
                <>
                  {isHitl && (
                    <div className="nav-group-label" key="results-label">
                      results
                    </div>
                  )}
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={`nav-btn${isActive ? ' active' : ''}`}
                    style={{ textDecoration: 'none' }}
                    onClick={() => setNavOpen(false)}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                    {isPlayground && <span className="nav-badge">running</span>}
                  </NavLink>
                </>
              );
            })}

            <div className="nav-group-label" style={{ marginTop: 16 }}>testing</div>
            {[
              { to: '/app/rag', label: 'RAG Eval', icon: '◈' },
              { to: '/app/vision', label: 'Vision', icon: '◎' },
            ].map((item) => {
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

            <div className="nav-group-label" style={{ marginTop: 16 }}>observability</div>
            {[
              { to: '/app/drift', label: 'Drift Monitor', icon: '↗' },
              { to: '/app/esg', label: 'ESG / Energy', icon: '♻' },
            ].map((item) => {
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
