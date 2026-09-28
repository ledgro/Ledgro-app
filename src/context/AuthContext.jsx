import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { listenForSessionEvents } from '../lib/sessionBroadcast';
import { terminate } from 'firebase/firestore';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import SplashScreen from '../components/SplashScreen';

const AuthContext = createContext();
const SESSION_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [hasShop, setHasShop] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [shopAdminId, setShopAdminId] = useState(null);
  const [shopName, setShopName] = useState('');

  useEffect(() => {
    const cleanup = listenForSessionEvents(
      async () => {
        try {
          await firebaseSignOut(auth);
          window.location.href = '/';
        } catch(e){}
      },
      (uid) => {
        if (auth.currentUser && auth.currentUser.uid !== uid) {
          firebaseSignOut(auth);
        }
      }
    );
    return cleanup;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const loginTime = localStorage.getItem('lastLoginTime');
        if (loginTime && Date.now() - parseInt(loginTime) > SESSION_DURATION) {
          firebaseSignOut(auth);
          localStorage.removeItem('lastLoginTime');
          return;
        } else if (!loginTime) {
          localStorage.setItem('lastLoginTime', Date.now().toString());
        }
      }
      setUser(currentUser);
      if(currentUser) {
        sessionGuard.bindSession(currentUser.uid);
      }

      if (currentUser) {
        try {
          const shopsRef = collection(db, 'shops');



          const qAdmin = query(shopsRef, where('ownerId', '==', currentUser.uid));
          const qMember = query(shopsRef, where(`members.${currentUser.uid}`, 'in', ['admin', 'member']));

          const [adminSnap, memberSnap] = await Promise.all([getDocs(qAdmin), getDocs(qMember)]);

          if (!adminSnap.empty) {
            setHasShop(true);
            setShopId(adminSnap.docs[0].id);
            localStorage.setItem('ledgro_offline_shopId', adminSnap.docs[0].id);
            setShopAdminId(adminSnap.docs[0].data({ serverTimestamps: 'estimate' }).ownerId);
            setShopName(adminSnap.docs[0].data({ serverTimestamps: 'estimate' }).name);
          } else if (!memberSnap.empty) {
            setHasShop(true);
            setShopId(memberSnap.docs[0].id);
            localStorage.setItem('ledgro_offline_shopId', memberSnap.docs[0].id);
            setShopAdminId(memberSnap.docs[0].data({ serverTimestamps: 'estimate' }).ownerId);
            setShopName(memberSnap.docs[0].data({ serverTimestamps: 'estimate' }).name);
          } else {
            setHasShop(false);
            setShopId(null);
            setShopAdminId(null);
            setShopName('');
          }
        } catch (error) {
          console.error("Error checking for shop:", error);
          // If offline and error occurs, check if we have a cached shopId locally to fallback to
          const cachedShopId = localStorage.getItem('ledgro_offline_shopId');
          if (cachedShopId && !navigator.onLine) {
             setHasShop(true);
             setShopId(cachedShopId);
          } else {
             setHasShop(false);
             setShopId(null);
          }
        }
      } else {
        setHasShop(null);
        setShopId(null);
      }

      setLoading(false);
    });

  return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then(granted => {
        if (!granted) {
          console.warn("Storage will not be persisted. Running in best-effort mode.");
        }
      });
    }
  }, []);

  if (isLocked) {
    return <div className="min-h-screen flex items-center justify-center bg-red-50 text-red-900 font-bold p-6 text-center">SESSION LOCKED. Please refresh the page.</div>;
  }

  const signInWithGoogle = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      if (error.code === 'auth/account-exists-with-different-credential') {
         throw new Error("An account already exists with this email using a different sign-in method. Please sign in using your original provider.");
      } else if (error.code === 'auth/popup-closed-by-user') {
        // User closed popup — silent, no error shown
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      } else {
        throw new Error('Sign-in failed. Please try again.');
      }
    }
  };

  const signOut = () => {
    return firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, hasShop, shopId, shopAdminId, shopName, setHasShop, setShopId, loading, signInWithGoogle, signOut }}>
      {loading ? <SplashScreen /> : children}
    </AuthContext.Provider>
  );
};
