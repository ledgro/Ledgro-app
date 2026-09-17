import { createHashRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SignIn from './pages/SignIn';
import ShopSetup from './pages/ShopSetup';
import Dashboard from './pages/Dashboard';
import Ledger from './pages/Ledger';
import Expenses from './pages/Expenses';
import Analytics from './pages/Analytics';
import Members from './pages/Members';
import SplashScreen from './components/SplashScreen';

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
    path: '/analytics',
    element: (
      <ProtectedRoute>
        <Analytics />
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
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}

export default App;
