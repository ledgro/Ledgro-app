import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const SignIn = () => {
  const { signInWithGoogle, user, hasShop } = useAuth();
  const navigate = useNavigate();
  const [isInAppBrowser, setIsInAppBrowser] = useState(false);
  const [browserTarget, setBrowserTarget] = useState('Safari or Chrome');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    // Detect WhatsApp or Facebook in-app browsers
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    if (
      ua.indexOf('FBAN') > -1 ||
      ua.indexOf('FBAV') > -1 ||
      ua.indexOf('WhatsApp') > -1 ||
      ua.indexOf('Instagram') > -1
    ) {
      setIsInAppBrowser(true);

      // Basic OS detection for better messaging
      if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
        setBrowserTarget('Safari');
      } else if (/android/i.test(ua)) {
        setBrowserTarget('Chrome');
      }
    }

    if (user) {
      if (hasShop) {
        navigate('/dashboard');
      } else if (hasShop === false) {
        navigate('/setup');
      }
    }
  }, [user, hasShop, navigate]);

  const handleSignIn = async () => {
    if (isSigningIn) return;
    try {
      setIsSigningIn(true);
      setError('');
      await signInWithGoogle();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to sign in. Please try again.');
      setIsSigningIn(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm p-8 text-center space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 tracking-tight">Ledgro</h1>
          <p className="mt-2 text-gray-500">Simple billing for your shop.</p>
        </div>

        {isInAppBrowser ? (
          <div className="space-y-4 bg-orange-50 text-orange-800 p-4 rounded-lg border border-orange-100">
            <p className="font-medium">
              Open in {browserTarget} to continue.
            </p>
            <p className="text-sm">
              Google Sign-In is blocked inside this app's browser.
            </p>
            <button
              onClick={handleCopyLink}
              className="w-full flex justify-center py-3 px-4 border border-orange-300 rounded-lg shadow-sm text-sm font-medium text-orange-700 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
            >
              {copied ? 'Link Copied!' : 'Copy Link'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={handleSignIn}
              disabled={isSigningIn}
              className={`w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors ${
                isSigningIn ? 'opacity-70 cursor-not-allowed' : 'hover:bg-gray-50'
              }`}
            >
              {isSigningIn ? (
                <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {isSigningIn ? 'Signing in...' : 'Sign in with Google'}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignIn;
