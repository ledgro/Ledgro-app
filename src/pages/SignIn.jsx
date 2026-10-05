import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { POLICY_VERSION } from '../lib/constants';

const SignIn = () => {
  const { signInWithGoogle, user, hasShop } = useAuth();
  const navigate = useNavigate();
  const { isIAB, targetBrowser } = useMemo(() => {
    const ua = navigator.userAgent || navigator.vendor;
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /android/i.test(ua);

    // Check for common in-app browsers
    const isIAB = (
      ua.indexOf('FBAN') > -1 ||
      ua.indexOf('FBAV') > -1 ||
      ua.indexOf('WhatsApp') > -1 ||
      ua.indexOf('Instagram') > -1 ||
      /\bLine\//.test(ua) ||
      ua.indexOf('FB_IAB') > -1 ||
      ua.indexOf('Snapchat') > -1 ||
      ua.indexOf('Twitter') > -1 ||
      ua.indexOf('LinkedInApp') > -1 ||
      /; wv\)/.test(ua)
    );

    let targetBrowser = 'Safari or Chrome';
    if (isIOS) targetBrowser = 'Safari';
    else if (isAndroid) targetBrowser = 'Chrome';

    return { isIAB, targetBrowser };
  }, []);


  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [lang, setLang] = useState('en');

  useEffect(() => {
    // Wait for the sign-in flow (including the consent setDoc) to complete before navigating away
    if (user && !isSigningIn) {
      if (hasShop) {
        navigate('/dashboard');
      } else if (hasShop === false) {
        navigate('/setup');
      }
    }
  }, [user, hasShop, navigate, isSigningIn]);

  const handleSignIn = async () => {
    if (isSigningIn) return;
    if (!termsAccepted) {
      setError(lang === 'en' ? 'Please accept the Terms of Service and Privacy Policy to continue.' : 'തുടരാൻ ദയവായി സേവന നിബന്ധനകളും സ്വകാര്യതാ നയവും അംഗീകരിക്കുക.'); // TODO: native speaker review
      return;
    }
    try {
      setIsSigningIn(true);
      setError('');
      await signInWithGoogle();

      if (auth.currentUser) {
        // Check if consent record exists, if not, write it
        const userRef = doc(db, 'users', auth.currentUser.uid);
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (readError) {
          console.error("Consent read failed:", readError);
          await auth.signOut();
          setError(lang === 'en' ? "Failed to verify consent. Please try again." : "സമ്മതം പരിശോധിക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.");
          return;
        }

        if (userSnap.data()?.consentRecord?.policyVersion !== POLICY_VERSION) {
          try {
            await setDoc(userRef, {
              consentRecord: {
                termsAccepted: true,
                policyVersion: POLICY_VERSION,
                language: lang,
                acceptedAt: serverTimestamp()
              }
            }, { merge: true });
          } catch (consentError) {
            console.error("Consent write failed:", consentError);
            await auth.signOut(); // using auth directly since useAuth hook destructuring might be missing
            setError(lang === 'en' ? "Failed to save consent. Please try again." : "സമ്മതം രേഖപ്പെടുത്താൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.");
            return; // Halt redirect
          }
        }
      }
    } catch (err) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // Silently ignore user cancellations
      } else {
        setError(lang === 'en' ? 'Failed to sign in. Please try again.' : 'സൈൻ ഇൻ പരാജയപ്പെട്ടു. വീണ്ടും ശ്രമിക്കുക.');
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleCopyLink = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(window.location.href)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error("Clipboard API failed:", err);
          fallbackCopyTextToClipboard(window.location.href);
        });
    } else {
      fallbackCopyTextToClipboard(window.location.href);
    }
  };

  const fallbackCopyTextToClipboard = (text) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.position = "fixed";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      const success = document.execCommand('copy');
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setError(lang === 'en' ? "Copy failed. Long-press the address bar to copy the link." : "പകർത്തുവാൻ കഴിഞ്ഞില്ല. ലിങ്ക് പകർത്താൻ അഡ്രസ്സ് ബാറിൽ അമർത്തി പിടിക്കുക.");
      }
    } catch (err) {
      console.error('Fallback copy error:', err);
      setError(lang === 'en' ? "Copy failed. Long-press the address bar to copy the link." : "പകർത്തുവാൻ കഴിഞ്ഞില്ല. ലിങ്ക് പകർത്താൻ അഡ്രസ്സ് ബാറിൽ അമർത്തി പിടിക്കുക.");
    }
    document.body.removeChild(textArea);
  };

  return (
    <div className="h-[100dvh] overflow-y-auto flex flex-col items-center justify-center bg-white p-6">
      <div className="max-w-md w-full text-center space-y-12">
        <div className="space-y-3">
          <h1 className="text-5xl font-black text-blue-600 tracking-tight font-bruno">Ledgro</h1>
          <p className="text-slate-500 font-medium text-lg">Simple billing for your shop.</p>
        </div>

        {isIAB ? (
          <div className="space-y-4 bg-orange-50 text-orange-800 p-4 rounded-lg border border-orange-100">
            <div className="flex justify-end mb-2">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} className={`px-2.5 py-1 text-xs font-bold rounded ${lang === 'en' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>EN</button>
                <button type="button" aria-pressed={lang === 'ml'} onClick={() => setLang('ml')} className={`px-2.5 py-1 text-xs font-bold rounded ${lang === 'ml' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>ML</button>
              </div>
            </div>
            <p className="font-medium">
              {lang === 'en' ? `Open in ${targetBrowser} to continue.` : `തുടരാൻ ${targetBrowser}-ൽ തുറക്കുക.`}
            </p>
            <p className="text-sm">
              {lang === 'en' ? "Google Sign-In is blocked inside this app's browser." : "ഈ ആപ്പിന്റെ ബ്രൗസറിൽ ഗൂഗിൾ സൈൻ-ഇൻ ബ്ലോക്ക് ചെയ്തിരിക്കുന്നു."}
            </p>
            <button
              onClick={handleCopyLink}
              className="w-full flex justify-center py-3 px-4 border border-orange-300 rounded-lg shadow-sm text-sm font-medium text-orange-700 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
            >
              {copied
                ? (lang === 'en' ? 'Link Copied!' : 'ലിങ്ക് പകർത്തി!')
                : (lang === 'en' ? 'Copy Link' : 'ലിങ്ക് പകർത്തുക')}
            </button>
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          </div>
        ) : (
          <div className="space-y-4 w-full px-4 text-left">
            <div className="flex justify-end mb-2">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} className={`px-2.5 py-1 text-xs font-bold rounded ${lang === 'en' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>EN</button>
                <button type="button" aria-pressed={lang === 'ml'} onClick={() => setLang('ml')} className={`px-2.5 py-1 text-xs font-bold rounded ${lang === 'ml' ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}>ML</button>
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-xl mb-4">
              <div className="pt-0.5">
                <input
                  type="checkbox"
                  className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  checked={termsAccepted}
                  onChange={(e) => {
                    setTermsAccepted(e.target.checked);
                    if (e.target.checked) setError('');
                  }}
                />
              </div>
              <div className="text-sm font-medium text-slate-700 leading-snug">
                {lang === 'en' ? (
                  <>I agree to the <Link to="/terms" className="text-blue-600 underline">Terms of Service</Link> and <Link to="/privacy" className="text-blue-600 underline">Privacy Policy</Link>.</>
                ) : (
                  <>ഞാൻ <Link to="/terms" className="text-blue-600 underline">സേവന നിബന്ധനകളും</Link> <Link to="/privacy" className="text-blue-600 underline">സ്വകാര്യതാ നയവും</Link> വായിച്ചു സമ്മതിക്കുന്നു.</>
                )}
              </div>
            </label>

            {/* Only true if the Firestore database is in an Indian region (asia-south1/asia-south2). Verify in the Firebase console. */}
            <p className="text-[11px] text-slate-400 font-medium text-center mb-4">
              {lang === 'en'
                ? "We collect your basic profile to manage your shop ledger. Your data remains stored in India."
                : "നിങ്ങളുടെ ഷോപ്പ് അക്കൗണ്ട് കൈകാര്യം ചെയ്യുന്നതിനായി നിങ്ങളുടെ അടിസ്ഥാന വിവരങ്ങൾ ഞങ്ങൾ ശേഖരിക്കുന്നു. നിങ്ങളുടെ വിവരങ്ങൾ ഇന്ത്യയിൽ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നു."}
            </p>

            <button
              onClick={handleSignIn}
              disabled={isSigningIn || !termsAccepted}
              className={`w-full flex items-center justify-center gap-3 h-14 px-4 border border-slate-200 rounded-xl shadow-sm text-base font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all active:scale-[0.98] ${
                isSigningIn ? 'opacity-70 cursor-not-allowed' : 'hover:bg-slate-50'
              }`}
            >
              {isSigningIn ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
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
              {isSigningIn ? (lang === 'en' ? 'Signing in...' : 'സൈൻ ഇൻ ചെയ്യുന്നു...') : (lang === 'en' ? 'Continue with Google' : 'Google വഴി തുടരുക')} {/* TODO: native speaker review */}
            </button>
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default SignIn;
