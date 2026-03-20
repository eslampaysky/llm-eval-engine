import { Suspense, lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import PrivateRoute from './PrivateRoute.jsx';
import PublicLayout from '../layouts/PublicLayout.jsx';
import AppLayout from '../layouts/AppLayout.jsx';

import LandingPage from '../pages/public/LandingPage.jsx';
import DemoPage from '../pages/public/DemoPage.jsx';
import PricingPage from '../pages/public/PricingPage.jsx';
import PublicReportPage from '../pages/public/PublicReportPage.jsx';

import LoginPage from '../pages/auth/LoginPage.jsx';
import SignupPage from '../pages/auth/SignupPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';

import OverviewPage from '../pages/app/OverviewPage.jsx';
import VibeCheckPage from '../pages/app/VibeCheckPage.jsx';
import MonitoringPage from '../pages/app/MonitoringPage.jsx';
import ApiKeysPage from '../pages/app/ApiKeysPage.jsx';
import SettingsLayout from '../pages/app/settings/SettingsLayout.jsx';
import ProfilePage from '../pages/app/settings/ProfilePage.jsx';
import SecurityPage from '../pages/app/settings/SecurityPage.jsx';
import BillingPage from '../pages/app/settings/BillingPage.jsx';
import WorkspacePage from '../pages/app/settings/WorkspacePage.jsx';

const WebAuditPage = lazy(() => import('../pages/app/WebAuditPage.jsx'));
const AgentAuditPage = lazy(() => import('../pages/app/AgentAuditPage.jsx'));
const AuditsPage = lazy(() => import('../pages/app/AuditsPage.jsx'));
const AuditDetailPage = lazy(() => import('../pages/app/AuditDetailPage.jsx'));

function suspenseWrap(element) {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '2rem', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      }
    >
      {element}
    </Suspense>
  );
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'demo', element: <DemoPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'report/:reportId', element: <PublicReportPage /> },
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/signup', element: <SignupPage /> },
      { path: 'auth/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  {
    path: '/app',
    element: (
      <PrivateRoute>
        <AppLayout />
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/app/overview" replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'vibe-check', element: <VibeCheckPage /> },
      { path: 'web-audit', element: suspenseWrap(<WebAuditPage />) },
      { path: 'agent-audit', element: suspenseWrap(<AgentAuditPage />) },
      { path: 'audits', element: suspenseWrap(<AuditsPage />) },
      { path: 'audits/:auditId', element: suspenseWrap(<AuditDetailPage />) },
      { path: 'monitoring', element: <MonitoringPage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="profile" replace /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'security', element: <SecurityPage /> },
          { path: 'billing', element: <BillingPage /> },
          { path: 'workspace', element: <WorkspacePage /> },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;
