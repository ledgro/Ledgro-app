import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import SplashScreen from './components/SplashScreen';
import Legal from './pages/Legal';

// Protected Route wrapper
const ProtectedRoute = ({ children, requireNoShop = false }) => {
  const { user, hasShop } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If we require the user NOT to have a shop (e.g. for the Setup screen)
  if (requireNoShop && hasShop) {
    return <Navigate to="/dashboard" replace />;
  }

  // If we require the user TO have a shop (e.g. for Dashboard)
  if (!requireNoShop && hasShop === false) {
    return <Navigate to="/setup" replace />;
  }

  return children;
};

// Auth Route wrapper (redirect logged in users to appropriate screen)
const AuthRoute = ({ children }) => {
  const { user, hasShop } = useAuth();

  if (user) {
    if (hasShop === true) {
      return <Navigate to="/dashboard" replace />;
    } else if (hasShop === false) {
      return <Navigate to="/setup" replace />;
    } else {
      // hasShop is null, still resolving
      return <SplashScreen />;
    }
  }

  return children;
};

// Use HashRouter for GitHub pages compatibility.
const router = createHashRouter([
  {
    path: '/login',
    element: (
      <AuthRoute>
        <SignIn />
      </AuthRoute>
    ),
  },
  {
    path: '/setup',
    element: (
      <ProtectedRoute requireNoShop={true}>
        <ShopSetup />
      </ProtectedRoute>
    ),
  },
  {
    path: '/dashboard',
    element: (
      <ProtectedRoute>
        <Dashboard />
      </ProtectedRoute>
    ),
  },
  {
    path: '/pos',
    element: (
      <ProtectedRoute>
        <POS />
      </ProtectedRoute>
    ),
  },
  {
    path: '/ledger',
    element: (
      <ProtectedRoute>
        <Ledger />
      </ProtectedRoute>
    ),
  },
  {
    path: '/expenses',
    element: (
      <ProtectedRoute>
        <Expenses />
      </ProtectedRoute>
    ),
  },
  {
    path: '/products',
    element: (
      <ProtectedRoute>
        <Products />
      </ProtectedRoute>
    ),
  },
  {
    path: '/members',
    element: (
      <ProtectedRoute>
        <Members />
      </ProtectedRoute>
    ),
  },
  {
    path: '/settings',
    element: (
      <ProtectedRoute>
        <Settings />
      </ProtectedRoute>
    ),
  },
  {
    path: '/pnl',
    element: (
      <ProtectedRoute>
        <PLScreen />
      </ProtectedRoute>
    ),
  },
  {
    path: '/privacy',
    element: <Legal />,
  },
  {
    path: '/terms',
    element: <Legal />,
  },
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);


if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().then(granted => {
    if (!granted) console.warn('Storage persistence denied');
  });
}

function App() {

  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
