import { createHashRouter, RouterProvider, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import SignIn from './pages/SignIn';
import ShopSetup from './pages/ShopSetup';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Ledger from './pages/Ledger';
import Expenses from './pages/Expenses';
import Members from './pages/Members';
import Products from './pages/Products';
import Settings from './pages/Settings';
import PLScreen from './pages/PLScreen';
import Legal from './pages/Legal';
import SplashScreen from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

// Protected Route wrapper
const ProtectedRoute = ({ children, requireNoShop = false }) => {
  const { user, hasShop } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
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
    const handleTouchEnd = (e) => {
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
        <Outlet />
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
      { path: '/privacy', element: <Legal /> },
      { path: '/terms', element: <Legal /> },
      { path: '*', element: <Navigate to="/login" replace /> },
    ]
  }
]);

export default function App() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </AuthProvider>
  );
}
