import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { POLL, PersonaSwitcher, SidebarKey, css } from '../App.jsx';
import { AppShellProvider, useAppShell } from '../context/AppShellContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: '◆' },
  { to: '/app/targets', label: 'Targets', icon: '◈' },
  { to: '/app/runs', label: 'Runs', icon: '◷' },
  { to: '/app/playground', label: 'Playground', icon: '⚡' },
  { to: '/app/compare', label: 'Compare', icon: '⇌' },
  { to: '/app/api-keys', label: 'API Keys', icon: '⌘' },
  { to: '/app/settings', label: 'Settings', icon: '⚙' },
];

function AppLayoutFrame() {
  const location = useLocation();
  const { logout } = useAuth();
  const { apiKey, setApiKey, groqApiKey, setGroqApiKey, persona, setPersona, running } = useAppShell();

  return (
    <>
      <style>{css}</style>
      <div className="shell">
        <aside className="sidebar">
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
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={`nav-btn${isActive ? ' active' : ''}`}
                  style={{ textDecoration: 'none' }}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                  {isPlayground && <span className="nav-badge">running</span>}
                </NavLink>
              );
            })}
          </nav>

          <div className="sidebar-foot">
            <div className="key-label">Breaker API Key</div>
            <SidebarKey value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <div className="key-label" style={{ marginTop: 12 }}>Groq API Key</div>
            <SidebarKey value={groqApiKey} onChange={(e) => setGroqApiKey(e.target.value)} />
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={logout}>
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
