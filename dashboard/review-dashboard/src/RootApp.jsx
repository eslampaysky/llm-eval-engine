import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { AppShellProvider } from './context/AppShellContext.jsx';
import router from './router/index.jsx';

export default function RootApp() {
  return (
    <AuthProvider>
      <AppShellProvider>
        <RouterProvider router={router} />
      </AppShellProvider>
    </AuthProvider>
  );
}
