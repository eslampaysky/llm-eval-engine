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
import LoginPage from '../pages/auth/LoginPage.jsx';
import SignupPage from '../pages/auth/SignupPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';
import DashboardPage from '../pages/app/DashboardPage.jsx';
import TargetsPage from '../pages/app/TargetsPage.jsx';
import TargetDetailPage from '../pages/app/TargetDetailPage.jsx';
import RunsPage from '../pages/app/RunsPage.jsx';
import RunDetailPage from '../pages/app/RunDetailPage.jsx';
import PlaygroundPage from '../pages/app/PlaygroundPage.jsx';
import HitlPage from '../pages/app/HitlPage.jsx';
import AgenticPage from '../pages/app/AgenticPage.jsx';
import ComparePage from '../pages/app/ComparePage.jsx';
import ApiKeysPage from '../pages/app/ApiKeysPage.jsx';
import DriftPage from '../pages/app/DriftPage.jsx';
import EsgPage from '../pages/app/EsgPage.jsx';
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
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'targets', element: <TargetsPage /> },
      { path: 'targets/:id', element: <TargetDetailPage /> },
      { path: 'runs', element: <RunsPage /> },
      { path: 'runs/:runId', element: <RunDetailPage /> },
      { path: 'hitl', element: <HitlPage /> },
      { path: 'playground', element: <PlaygroundPage /> },
      { path: 'agentic', element: <AgenticPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      { path: 'drift', element: <DriftPage /> },
      { path: 'esg', element: <EsgPage /> },
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
