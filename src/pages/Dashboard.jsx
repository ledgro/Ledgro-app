import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error("Failed to log out", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-20 px-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">
            Welcome to Ledgro
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            {user?.displayName ? `Hello, ${user.displayName}` : 'You are signed in!'}
          </p>
        </div>

        <div className="pt-8 border-t border-gray-200">
          <button
            onClick={handleSignOut}
            className="w-full flex justify-center py-3 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
