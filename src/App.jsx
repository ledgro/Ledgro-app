import { createHashRouter, RouterProvider, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { lazy, Suspense, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SignIn = lazy(() => import('./pages/SignIn'));
const ShopSetup = lazy(() => import('./pages/ShopSetup'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const POS = lazy(() => import('./pages/POS'));
const Ledger = lazy(() => import('./pages/Ledger'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Members = lazy(() => import('./pages/Members'));
const Products = lazy(() => import('./pages/Products'));
const Settings = lazy(() => import('./pages/Settings'));
const PLScreen = lazy(() => import('./pages/PLScreen'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
import SplashScreen from './components/SplashScreen';
import OfflineBanner from './components/OfflineBanner';
import { ErrorBoundary } from './components/ErrorBoundary';

// Protected Route wrapper
const ProtectedRoute = ({ children, requireNoShop = false }) => {
  const { user, hasShop } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (hasShop === null) return null; // Wait for resolving shop status
  if (requireNoShop && hasShop) return <Navigate to="/dashboard" replace />;
  if (!requireNoShop && hasShop === false) return <Navigate to="/setup" replace />;
  return children;
};

// Auth Route wrapper
const AuthRoute = ({ children }) => {
  const { user, hasShop } = useAuth();
  if (user) {
    if (hasShop === true) return <Navigate to="/dashboard" replace />;
    else if (hasShop === false) return <Navigate to="/setup" replace />;
    else return <SplashScreen />;
  }
  return children;
};

const pageVariants = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '-30%', opacity: 0 }
};

const pageTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
  duration: 0.25
};

const AnimatedLayout = () => {
  const location = useLocation();
  const [disableExitAnimation, setDisableExitAnimation] = useState(false);

  useEffect(() => {
    let touchStartX = 0;
    const handleTouchStart = (e) => {
      touchStartX = e.touches[0].clientX;
    };
    const handleTouchEnd = () => {
      if (touchStartX < 20) {
        setDisableExitAnimation(true);
        setTimeout(() => setDisableExitAnimation(false), 500);
      }
    };
    window.addEventListener('touchstart', handleTouchStart);
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <AnimatePresence mode="popLayout" custom={disableExitAnimation}>
      <motion.div
        key={location.pathname}
        variants={pageVariants}
        initial="initial"
        animate="animate"
        exit={disableExitAnimation ? {} : "exit"}
        transition={pageTransition}
        style={{ position: 'absolute', width: '100%', height: '100%' }}
      >
        <Suspense fallback={<SplashScreen />}>
          <Outlet />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
};

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
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OfflineBanner />
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  );
}