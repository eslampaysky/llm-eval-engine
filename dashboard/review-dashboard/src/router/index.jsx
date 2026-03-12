import { Navigate, createBrowserRouter } from 'react-router-dom';
import PrivateRoute from './PrivateRoute.jsx';
import PublicLayout from '../layouts/PublicLayout.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import LandingPage from '../pages/public/LandingPage.jsx';
import DemoPage from '../pages/public/DemoPage.jsx';
import DocsPage from '../pages/public/DocsPage.jsx';
import PricingPage from '../pages/public/PricingPage.jsx';
import LoginPage from '../pages/auth/LoginPage.jsx';
import SignupPage from '../pages/auth/SignupPage.jsx';
import ForgotPasswordPage from '../pages/auth/ForgotPasswordPage.jsx';
import DashboardPage from '../pages/app/DashboardPage.jsx';
import TargetsPage from '../pages/app/TargetsPage.jsx';
import TargetDetailPage from '../pages/app/TargetDetailPage.jsx';
import RunsPage from '../pages/app/RunsPage.jsx';
import RunDetailPage from '../pages/app/RunDetailPage.jsx';
import PlaygroundPage from '../pages/app/PlaygroundPage.jsx';
import ComparePage from '../pages/app/ComparePage.jsx';
import ApiKeysPage from '../pages/app/ApiKeysPage.jsx';
import SettingsPage from '../pages/app/SettingsPage.jsx';

const router = createBrowserRouter([
  {
    path: '/',
    element: <PublicLayout />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: 'demo', element: <DemoPage /> },
      { path: 'docs', element: <DocsPage /> },
      { path: 'pricing', element: <PricingPage /> },
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
      { path: 'playground', element: <PlaygroundPage /> },
      { path: 'compare', element: <ComparePage /> },
      { path: 'api-keys', element: <ApiKeysPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]);

export default router;
