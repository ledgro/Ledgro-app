import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, setPersistence, indexedDBLocalPersistence, deleteUser } from 'firebase/auth';
import { listenForSessionEvents } from '../lib/sessionBroadcast';
import { sessionGuard } from '../lib/SessionGuard';
import { terminate } from 'firebase/firestore';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteField, deleteDoc } from 'firebase/firestore';
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
          const cachedShopId = localStorage.getItem('ledgro_offline_shopId');
          if (cachedShopId) {
            // Fast path: fetch direct doc if we have it to avoid rules blocking full collection queries
            try {
              const shopDocRef = doc(db, 'shops', cachedShopId);
              let shopSnap;
              try {
                // Fast path: fetch direct doc from cache first
                shopSnap = await getDoc(shopDocRef, { source: 'cache' });
              } catch (cacheError) {
                console.warn("Cache miss for shop doc, falling back to network getDoc.");
                // Fallback to network if cache misses
                shopSnap = await getDoc(shopDocRef);
              }

              if (shopSnap.exists()) {
                const data = shopSnap.data({ serverTimestamps: 'estimate' });
                // Check if user is actually a member of this shop
                if (data.ownerId === currentUser.uid || (data.members && data.members[currentUser.uid])) {
                  setHasShop(true);
                  setShopId(cachedShopId);
                  setShopAdminId(data.ownerId);
                  setShopName(data.name);
                  setLoading(false);
                  return; // We're done
                } else {
                  // User is no longer a member of this cached shop.
                  localStorage.removeItem('ledgro_offline_shopId');
                  setHasShop(false);
                  setShopId(null);
                  setShopAdminId(null);
                  setShopName('');
                }
              } else {
                 // Shop doesn't exist anymore
                 localStorage.removeItem('ledgro_offline_shopId');
                 setHasShop(false);
                 setShopId(null);
              }
            } catch (fastPathError) {
              console.warn("Direct fetch failed, falling back to query.", fastPathError);
            }
          }

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
      try {
        await setPersistence(auth, indexedDBLocalPersistence);
      } catch (err) {
        console.warn('IndexedDB persistence unavailable:', err);
      }
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
    localStorage.removeItem('ledgro_offline_shopId');
    localStorage.removeItem('lastLoginTime');
    setHasShop(null);
    setShopId(null);
    return firebaseSignOut(auth);
  };


  const deleteAccount = async () => {
    if (!auth.currentUser) return;

    // Check shop status if they are in a shop
    if (shopId) {
      try {
        const shopDocRef = doc(db, 'shops', shopId);
        const shopSnap = await getDoc(shopDocRef);
        if (shopSnap.exists()) {
          const shopData = shopSnap.data();
          const members = shopData.members || {};

          if (members[auth.currentUser.uid] === 'admin') {
            // Check if they are the ONLY admin
            const adminCount = Object.values(members).filter(role => role === 'admin').length;
            if (adminCount <= 1) {
              // If they are the ONLY person in the shop, let them delete the shop entirely
              if (Object.keys(members).length === 1) {
                await deleteDoc(shopDocRef);
              } else {
                throw new Error("You are the only Admin. You must promote another member to Admin before deleting your account to prevent locking the shop.");
              }
            } else {
               // Safe to remove admin from shop
              await updateDoc(shopDocRef, {
                [`members.${auth.currentUser.uid}`]: deleteField()
              });
            }
          } else {
            // Safe to remove regular member from shop
            await updateDoc(shopDocRef, {
              [`members.${auth.currentUser.uid}`]: deleteField()
            });
          }
        }
      } catch (err) {
        if (err.message.includes("only Admin")) throw err; // Pass custom error up
        console.error("Error removing member from shop:", err);
        throw new Error("Failed to remove account from shop. Please check your internet connection.");
      }
    }

    try {
      await deleteUser(auth.currentUser);
      localStorage.removeItem('ledgro_offline_shopId');
      window.location.href = '/';
    } catch (error) {
      if (error.code === 'auth/requires-recent-login') {
        throw new Error("For security reasons, please sign out and sign back in before deleting your account.");
      }
      throw new Error("Failed to delete account. Please try again.");
    }
  };

  return (
    <AuthContext.Provider value={{ user, hasShop, shopId, shopAdminId, setShopAdminId, shopName, setHasShop, setShopId, loading, signInWithGoogle, signOut, deleteAccount }}>
      {loading ? <SplashScreen /> : children}
    </AuthContext.Provider>
  );
};
