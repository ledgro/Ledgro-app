import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import SignIn from './pages/SignIn';
import ShopSetup from './pages/ShopSetup';
import Dashboard from './pages/Dashboard';

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
    if (hasShop) {
      return <Navigate to="/dashboard" replace />;
    } else {
      return <Navigate to="/setup" replace />;
    }
  }

  return children;
};

const router = createBrowserRouter([
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
