import { useCallback, useEffect, useState, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { lazyWithRetry as lazy } from './utils/lazyWithRetry';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { authApi } from './services/api';
import './App.css';

const Login = lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const Connection = lazy(() =>
  import('./pages/Connection').then(m => ({ default: m.Connection })),
);
const Campaigns = lazy(() =>
  import('./pages/Campaigns').then(m => ({ default: m.Campaigns })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppContent() {
  const [authState, setAuthState] = useState<'loading' | 'guest' | 'authed'>('loading');

  const checkSession = useCallback(async () => {
    try {
      await authApi.me();
      setAuthState('authed');
    } catch {
      setAuthState('guest');
    }
  }, []);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  useEffect(() => {
    const onLogout = () => setAuthState('guest');
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const handleLogin = () => setAuthState('authed');

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      /* ignore */
    }
    setAuthState('guest');
  };

  const loadingFallback = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <Loader2 className="animate-spin" size={32} />
    </div>
  );

  if (authState === 'loading') return loadingFallback;

  if (authState === 'guest') {
    return (
      <Suspense fallback={loadingFallback}>
        <Login onLogin={handleLogin} />
      </Suspense>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Suspense fallback={loadingFallback}>
          <Routes>
            <Route path="/" element={<Layout onLogout={handleLogout} />}>
              <Route index element={<Navigate to="/campaigns" replace />} />
              <Route path="campaigns" element={<Campaigns />} />
              <Route path="connection" element={<Connection />} />
              <Route path="*" element={<Navigate to="/campaigns" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ToastProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
