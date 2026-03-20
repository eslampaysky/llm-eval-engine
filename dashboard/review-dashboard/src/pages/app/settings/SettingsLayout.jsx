import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { User, Shield, CreditCard, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const TAB_ICONS = {
  profile: User,
  security: Shield,
  billing: CreditCard,
  workspace: Settings,
};

export default function SettingsLayout() {
  const { t } = useTranslation();
  const location = useLocation();

  const tabs = [
    { to: '/app/settings/profile', label: t('settings.tabs.profile'), key: 'profile' },
    { to: '/app/settings/security', label: t('settings.tabs.security'), key: 'security' },
    { to: '/app/settings/billing', label: t('settings.tabs.billing'), key: 'billing' },
    { to: '/app/settings/workspace', label: t('settings.tabs.workspace'), key: 'workspace' },
  ];

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <div className="page-eyebrow">{t('settings.layout.eyebrow')}</div>
        <h1 className="page-title">{t('settings.layout.title')}</h1>
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid var(--line)', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {tabs.map((tab) => {
          const Icon = TAB_ICONS[tab.key];
          const isActive = location.pathname === tab.to;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              style={{
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                textDecoration: 'none',
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
              }}
            >
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
