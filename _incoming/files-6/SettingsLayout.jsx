/**
 * src/pages/app/settings/SettingsLayout.jsx
 * ===========================================
 * Shared layout for /app/settings/*
 * Renders a left tab rail + right content area.
 * Each tab links to a sub-route; active tab is derived from the URL.
 *
 * Routes expected:
 *   /app/settings/profile
 *   /app/settings/security
 *   /app/settings/billing
 *   /app/settings/workspace
 */

import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: 'profile',   icon: '👤', label: 'Profile'   },
  { to: 'security',  icon: '🔒', label: 'Security'  },
  { to: 'billing',   icon: '💳', label: 'Billing'   },
  { to: 'workspace', icon: '⚙️',  label: 'Workspace' },
];

export default function SettingsLayout() {
  const tabBase = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 14px', borderRadius: 8,
    fontFamily: "'Space Grotesk', sans-serif",
    fontSize: 13, fontWeight: 500,
    textDecoration: 'none', color: 'rgba(142,168,199,0.8)',
    transition: 'all 0.12s', border: '1px solid transparent',
    cursor: 'pointer', background: 'none', width: '100%',
  };

  const tabActive = {
    background: 'rgba(59,180,255,0.08)',
    border: '1px solid rgba(59,180,255,0.2)',
    color: 'rgba(232,244,255,0.97)',
  };

  return (
    <div style={{ padding: '28px 34px', maxWidth: 1000 }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 9.5, color: 'var(--neon-blue, #3bb4ff)',
          letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 5,
        }}>
          // config · settings
        </div>
        <h1 style={{
          margin: 0, fontSize: 28, fontWeight: 700,
          fontFamily: "'Space Grotesk', sans-serif",
          color: 'rgba(232,244,255,0.97)', letterSpacing: '-0.025em',
        }}>
          Settings
        </h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 24, alignItems: 'start' }}>
        {/* Tab rail */}
        <nav style={{
          background: '#0c1220',
          border: '1px solid rgba(33,57,90,0.7)',
          borderRadius: 12, padding: 8,
          display: 'flex', flexDirection: 'column', gap: 2,
          position: 'sticky', top: 24,
        }}>
          {TABS.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={({ isActive }) => ({
                ...tabBase,
                ...(isActive ? tabActive : {}),
              })}
            >
              <span style={{ fontSize: 15 }}>{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </nav>

        {/* Content panel */}
        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
