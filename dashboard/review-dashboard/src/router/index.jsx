import { Navigate, createBrowserRouter } from 'react-router-dom';
import PrivateRoute from './PrivateRoute.jsx';
import PublicLayout from '../layouts/PublicLayout.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import LandingPage from '../pages/public/LandingPage.jsx';
import DemoPage from '../pages/public/DemoPage.jsx';
import DocsPage from '../pages/public/DocsPage.jsx';
import PricingPage from '../pages/public/PricingPage.jsx';
import BillingSuccessPage from '../pages/public/BillingSuccessPage.jsx';
import PublicReportPage from '../pages/public/PublicReportPage.jsx';
import PublicWebAuditPage from '../pages/public/PublicWebAuditPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import SignupPage from '../pages/auth/SignupPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';
import OverviewPage from '../pages/app/OverviewPage.jsx';
import VibeCheckPage from '../pages/app/VibeCheckPage.jsx';
import WebAuditPage from '../pages/app/WebAuditPage.jsx';
import AgentAuditPage from '../pages/app/AgentAuditPage.jsx';
import AuditsPage from '../pages/app/AuditsPage.jsx';
import AuditDetailPage from '../pages/app/AuditDetailPage.jsx';
import AuditHistoryPage from '../pages/app/AuditHistoryPage.jsx';
import AuditPage from '../pages/app/AuditPage.jsx';
import MonitoringPage from '../pages/app/MonitoringPage.jsx';
import ApiKeysPage from '../pages/app/ApiKeysPage.jsx';
import SettingsLayout from '../pages/app/settings/SettingsLayout.jsx';
import ProfilePage from '../pages/app/settings/ProfilePage.jsx';
import SecurityPage from '../pages/app/settings/SecurityPage.jsx';
import BillingPage from '../pages/app/settings/BillingPage.jsx';
import WorkspacePage from '../pages/app/settings/WorkspacePage.jsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'demo', element: <DemoPage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'pricing', element: <PricingPage /> },
      { path: 'billing/success', element: <BillingSuccessPage /> },
      { path: 'report/:reportId', element: <PublicReportPage /> },
      { path: 'web-audit/share/:token', element: <PublicWebAuditPage /> },
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/signup', element: <SignupPage /> },
      { path: 'auth/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Vibe Check is public — no sign-up required (matches landing page promise)
  {
    path: '/app/vibe-check',
    element: <AppLayout />,
    children: [
      { index: true, element: <VibeCheckPage /> },
    ],
  },
  // All other /app routes require authentication
  {
    path: '/app',
    element: (
      <PrivateRoute>
        <AppLayout />
      </PrivateRoute>
    ),
    children: [
      { index: true, element: <Navigate to="/app/vibe-check" replace /> },
      { path: 'overview', element: <OverviewPage /> },
      { path: 'web-audit', element: <WebAuditPage /> },
      { path: 'agent-audit', element: <AgentAuditPage /> },
      { path: 'audits', element: <AuditsPage /> },
      { path: 'audits/:auditId', element: <AuditDetailPage /> },
      { path: 'audit', element: <AuditPage /> },
      { path: 'audit-history', element: <AuditHistoryPage /> },
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
