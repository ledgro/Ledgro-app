import { createHashRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { lazy, Suspense, useEffect } from 'react';
import { motion } from 'framer-motion';

const SignIn = lazy(() => import('./pages/SignIn'));
const ShopSetup = lazy(() => import('./pages/ShopSetup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Members = lazy(() => import('./pages/Members'));
const Products = lazy(() => import('./pages/Products'));
const Transfers = lazy(() => import('./pages/Transfers'));
const Settings = lazy(() => import('./pages/Settings'));
const PLScreen = lazy(() => import('./pages/PLScreen'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
import SplashScreen from './components/SplashScreen';
import OfflineBanner from './components/OfflineBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import ConfirmHost from './components/ConfirmHost';
import { useKeyboardInset } from './hooks/useKeyboardInset';

const ProtectedRoute = ({ children, requireNoShop = false }) => {
  const { user, hasShop } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (hasShop === null) return null;
  if (requireNoShop && hasShop) return <Navigate to="/dashboard" replace />;
  if (!requireNoShop && hasShop === false) return <Navigate to="/setup" replace />;
  return children;
};

const AuthRoute = ({ children }) => {
  const { user, hasShop } = useAuth();
  if (user) {
    if (hasShop === true) return <Navigate to="/dashboard" replace />;
    else if (hasShop === false) return <Navigate to="/setup" replace />;
    else return <SplashScreen />;
  }
  return children;
};

// Tab switches fade the new page in. No slide and no exit animation, so two pages are never on screen together.
const preloadPages = () => Promise.all([
  import('./pages/Dashboard'), import('./pages/POS'), import('./pages/Ledger'), import('./pages/Expenses'),
  import('./pages/Products'), import('./pages/Settings'), import('./pages/PLScreen'), import('./pages/Members'), import('./pages/Transfers'),
]).catch(() => {});

const AnimatedLayout = () => {
  const location = useLocation();

  useEffect(() => {
    // After the first screen is up, fetch the other pages quietly so tapping a tab never shows a loading flash.
    const run = () => { preloadPages(); };
    if ('requestIdleCallback' in window) { const id = window.requestIdleCallback(run, { timeout: 4000 }); return () => window.cancelIdleCallback(id); }
    const t = setTimeout(run, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ position: 'absolute', width: '100%', height: '100%' }}
    >
      <Suspense fallback={<SplashScreen />}>
        <Outlet />
      </Suspense>
    </motion.div>
  );
};

// Back button after sign-out or account deletion can restore the old page from the browser's memory,
// still showing the dashboard with a dead session. Always reload a restored page so it checks the real sign-in state.
window.addEventListener('pageshow', (e) => { if (e.persisted) window.location.reload(); });

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (!granted) console.warn('Storage persistence denied');
  });
}

const router = createHashRouter([
  {
    element: <AnimatedLayout />,
    children: [
      { path: '/login', element: <AuthRoute><SignIn /></AuthRoute> },
      { path: '/setup', element: <ProtectedRoute requireNoShop={true}><ShopSetup /></ProtectedRoute> },
      { path: '/dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
      { path: '/pos', element: <ProtectedRoute><POS /></ProtectedRoute> },
      { path: '/ledger', element: <ProtectedRoute><Ledger /></ProtectedRoute> },
      { path: '/expenses', element: <ProtectedRoute><Expenses /></ProtectedRoute> },
      { path: '/products', element: <ProtectedRoute><Products /></ProtectedRoute> },
      { path: '/transfers', element: <ProtectedRoute><Transfers /></ProtectedRoute> },
      { path: '/members', element: <ProtectedRoute><Members /></ProtectedRoute> },
      { path: '/settings', element: <ProtectedRoute><Settings /></ProtectedRoute> },
      { path: '/pnl', element: <ProtectedRoute><PLScreen /></ProtectedRoute> },
      { path: '/privacy', element: <PrivacyPolicy /> },
      { path: '/terms', element: <TermsOfService /> },
      { path: '*', element: <Navigate to="/login" replace /> },
    ]
  }
]);

export default function App() {
  useKeyboardInset();
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OfflineBanner />
        <ConfirmHost />
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  );
}