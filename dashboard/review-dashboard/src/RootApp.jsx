import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from './context/AuthContext.jsx';
import { AppShellProvider } from './context/AppShellContext.jsx';
import router from './router/index.jsx';
import { getLanguageDirection } from './i18n/index.js';

export default function RootApp() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const language = i18n.language || 'en';
    document.documentElement.lang = language;
    document.documentElement.dir = getLanguageDirection(language);
    document.body.dir = getLanguageDirection(language);
  }, [i18n.language]);

  return (
    <AuthProvider>
      <AppShellProvider>
        <RouterProvider router={router} />
      </AppShellProvider>
    </AuthProvider>
  );
}
