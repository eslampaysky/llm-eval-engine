import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { User, Shield, CreditCard, Settings } from 'lucide-react';

const TABS = [
  { to: '/app/settings/profile', label: 'Profile', icon: User },
  { to: '/app/settings/security', label: 'Security', icon: Shield },
  { to: '/app/settings/billing', label: 'Billing', icon: CreditCard },
  { to: '/app/settings/workspace', label: 'Workspace', icon: Settings },
];

export default function SettingsLayout() {
  const location = useLocation();

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">Account</div>
        <h1 className="page-title">Settings</h1>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--line)',
        overflowX: 'auto', flexWrap: 'nowrap',
      }}>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.to;
          return (
            <NavLink key={tab.to} to={tab.to} style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              textDecoration: 'none',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 6,
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}>
              <Icon size={14} />
              {tab.label}
            </NavLink>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
