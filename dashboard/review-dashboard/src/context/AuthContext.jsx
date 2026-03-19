import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

function resolveApiBase() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:8000';
    }
  }

  return 'https://llm-eval-engine-production.up.railway.app';
}

const API_BASE = resolveApiBase();

let token = localStorage.getItem('auth_token');

export function getAuthHeader() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function authFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.detail || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const initRan = useRef(false);

  useEffect(() => {
    if (initRan.current) return;
    initRan.current = true;

    if (!token) {
      setLoading(false);
      return;
    }

    // token was restored from localStorage, verify it's still valid
    authFetch('/auth/me')
      .then((userData) => setUser(userData))
      .catch((err) => {
        if (err.status === 401 || err.status === 403) {
          token = null;
          localStorage.removeItem('auth_token');
          setUser(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
    setError('');
    try {
      const data = await authFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });
      token = data.access_token;
      localStorage.setItem('auth_token', token);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Registration failed.';
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const login = useCallback(async ({ email, password }) => {
    setError('');
    try {
      const data = await authFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      token = data.access_token;
      localStorage.setItem('auth_token', token);
      setUser(data.user);
      return { success: true };
    } catch (err) {
      const msg = err.status === 401
        ? 'Incorrect email or password.'
        : (err.message || 'Login failed.');
      setError(msg);
      return { success: false, error: msg };
    }
  }, []);

  const logout = useCallback(() => {
    token = null;
    localStorage.removeItem('auth_token');
    setUser(null);
    setError('');
  }, []);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
  }, []);

  const clearError = useCallback(() => setError(''), []);

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    login,
    logout,
    register,
    updateUser,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
