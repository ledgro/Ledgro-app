import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as firebaseSignOut, setPersistence, indexedDBLocalPersistence, deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { listenForSessionEvents } from '../lib/sessionBroadcast';
import { sessionGuard } from '../lib/SessionGuard';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteField, deleteDoc, getDocFromCache, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import SplashScreen from '../components/SplashScreen';

const AuthContext = createContext();
const SESSION_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [shopAdminId, setShopAdminId] = useState(null);
  const [shopName, setShopName] = useState('');

  const requestCounter = useRef(0);

  useEffect(() => {
    const cleanup = listenForSessionEvents(
      async () => {
        try {
          // Re-use standard sign out logic instead of bypassing it
          localStorage.removeItem('ledgro_offline_shopId');
          localStorage.removeItem('ledgro_offline_shopAdminId');
          localStorage.removeItem('ledgro_offline_shopName');
          localStorage.removeItem('lastLoginTime');
          try {
            await terminate(db);
            await clearIndexedDbPersistence(db);
          } catch(e) { console.error(e) }

          await firebaseSignOut(auth);
          window.location.href = '/';
        } catch(e){
          console.error("Session event auto sign-out failed", e);
        }
      },
      async (uid) => {
        if (auth.currentUser && auth.currentUser.uid !== uid) {
          try {
            localStorage.removeItem('ledgro_offline_shopId');
            localStorage.removeItem('ledgro_offline_shopAdminId');
            localStorage.removeItem('ledgro_offline_shopName');
            localStorage.removeItem('lastLoginTime');
            try {
              await terminate(db);
              await clearIndexedDbPersistence(db);
            } catch(e) { console.error(e) }

            await firebaseSignOut(auth);
          } catch(e) {
            console.error("Cross-tab session mismatch auto sign-out failed", e);
          }
        }
      }
    );
    return cleanup;
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      const currentRequestId = ++requestCounter.current;

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

      if (currentRequestId !== requestCounter.current) return;
      setUser(currentUser);
      if(currentUser) {
        sessionGuard.bindSession(currentUser.uid);
      }

      if (currentUser) {
        try {
          const cachedShopId = localStorage.getItem('ledgro_offline_shopId');
          if (cachedShopId) {
            try {
              const shopDocRef = doc(db, 'shops', cachedShopId);
              let shopSnap;
              try {
                shopSnap = await getDocFromCache(shopDocRef);
              } catch (cacheError) {
                console.warn("Cache miss for shop doc, falling back to network getDoc.");
                shopSnap = await getDoc(shopDocRef);
              }

              if (currentRequestId !== requestCounter.current) return;

              if (shopSnap.exists()) {
                const data = shopSnap.data({ serverTimestamps: 'estimate' });
                if (data.ownerId === currentUser.uid || (data.members && data.members[currentUser.uid])) {
                  setHasShop(true);
                  setShopId(cachedShopId);
                  setShopAdminId(data.ownerId);
                  setShopName(data.name);
                  localStorage.setItem('ledgro_offline_shopAdminId', data.ownerId);
                  localStorage.setItem('ledgro_offline_shopName', data.name);
                  setLoading(false);
                  return;
                } else {
                  // User removed from cached shop
                  localStorage.removeItem('ledgro_offline_shopId');
                  localStorage.removeItem('ledgro_offline_shopAdminId');
                  localStorage.removeItem('ledgro_offline_shopName');
                  setHasShop(false);
                  setShopId(null);
                  setShopAdminId(null);
                  setShopName('');
                  setLoading(false);
                  return;
                }
              } else {
                 // Cached shop deleted
                 localStorage.removeItem('ledgro_offline_shopId');
                 localStorage.removeItem('ledgro_offline_shopAdminId');
                 localStorage.removeItem('ledgro_offline_shopName');
                 setHasShop(false);
                 setShopId(null);
                 setShopAdminId(null);
                 setShopName('');
                 setLoading(false);
                 return;
              }
            } catch (fastPathError) {
              console.warn("Direct fetch failed, falling back to query.", fastPathError);
            }
          }

          const shopsRef = collection(db, 'shops');
          const qAdmin = query(shopsRef, where('ownerId', '==', currentUser.uid));
          const qMember = query(shopsRef, where(`members.${currentUser.uid}`, 'in', ['admin', 'member']));

          const [adminSnap, memberSnap] = await Promise.all([getDocs(qAdmin), getDocs(qMember)]);
          if (currentRequestId !== requestCounter.current) return;

          let foundShop = null;
          if (!adminSnap.empty) {
            foundShop = adminSnap.docs[0];
          } else if (!memberSnap.empty) {
            foundShop = memberSnap.docs[0];
          }

          if (foundShop) {
            const data = foundShop.data({ serverTimestamps: 'estimate' });
            setHasShop(true);
            setShopId(foundShop.id);
            setShopAdminId(data.ownerId);
            setShopName(data.name);
            localStorage.setItem('ledgro_offline_shopId', foundShop.id);
            localStorage.setItem('ledgro_offline_shopAdminId', data.ownerId);
            localStorage.setItem('ledgro_offline_shopName', data.name);
          } else {
            setHasShop(false);
            setShopId(null);
            setShopAdminId(null);
            setShopName('');
          }
        } catch (error) {
          console.error("Error checking for shop:", error);
          if (currentRequestId !== requestCounter.current) return;
          // Transient error: maintain previous state if we have it locally, otherwise unknown.
          const cachedShopId = localStorage.getItem('ledgro_offline_shopId');
          if (cachedShopId) {
             setHasShop(true);
             setShopId(cachedShopId);
             setShopAdminId(localStorage.getItem('ledgro_offline_shopAdminId'));
             setShopName(localStorage.getItem('ledgro_offline_shopName'));
          } else {
             // Don't arbitrarily set to false if it's just a network failure and we haven't confirmed no shop.
             // Leaving it as null/loading is safer than sending to setup, unless it's a confirmed empty result.
             // Given we can't confirm empty, we rely on cached state or fail gracefully.
          }
        }
      } else {
        setHasShop(null);
        setShopId(null);
        setShopAdminId(null);
        setShopName('');
      }

      if (currentRequestId === requestCounter.current) {
         setLoading(false);
      }
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

  const signInWithGoogle = useCallback(async () => {
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
      } else if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // User closed popup or cancelled auth request — silent, no error shown
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      } else {
        throw new Error('Sign-in failed. Please try again.');
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    localStorage.removeItem('ledgro_offline_shopId');
    localStorage.removeItem('ledgro_offline_shopAdminId');
    localStorage.removeItem('ledgro_offline_shopName');
    localStorage.removeItem('lastLoginTime');
    setHasShop(null);
    setShopId(null);
    setShopAdminId(null);
    setShopName('');

    sessionGuard.unbindSession();

    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
    } catch(e) {
      console.error("Failed to wipe offline database on sign-out", e);
    }

    try {
      await firebaseSignOut(auth);
    } catch(e) {
      console.error("Failed to sign out", e);
      throw e;
    }
  }, []);


  const deleteAccount = useCallback(async () => {
    if (!auth.currentUser) return;

    try {
      // 1. Re-authenticate first before starting any destructive operations
      await reauthenticateWithPopup(auth.currentUser, googleProvider);
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        throw new Error("Account deletion cancelled.");
      }
      throw new Error("Failed to authenticate. Please try again.");
    }

    const uid = auth.currentUser.uid;

    // 2. Check shop status and handle membership/shop deletion
    if (shopId) {
      try {
        const shopDocRef = doc(db, 'shops', shopId);
        const shopSnap = await getDoc(shopDocRef);
        if (shopSnap.exists()) {
          const shopData = shopSnap.data();
          const members = shopData.members || {};

          if (members[uid] === 'admin') {
            const adminCount = Object.values(members).filter(role => role === 'admin').length;
            if (adminCount <= 1) {
              if (Object.keys(members).length === 1) {
                // Delete orphaned subcollections first
                const collectionsToDelete = ['bills', 'expenses', 'catalog'];
                for (const collName of collectionsToDelete) {
                  const subColRef = collection(db, `shops/${shopId}/${collName}`);
                  const snapshot = await getDocs(subColRef);
                  const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
                  await Promise.all(deletePromises);
                }
                // Then delete parent shop
                await deleteDoc(shopDocRef);
              } else {
                throw new Error("You are the only Admin. You must promote another member to Admin before deleting your account to prevent locking the shop.");
              }
            } else {
              await updateDoc(shopDocRef, {
                [`members.${uid}`]: deleteField()
              });
            }
          } else {
            await updateDoc(shopDocRef, {
              [`members.${uid}`]: deleteField()
            });
          }
        }
      } catch (err) {
        if (err.message.includes("only Admin") || err.message.includes("cancelled")) throw err;
        console.error("Error removing member from shop:", err);
        throw new Error("Failed to remove account from shop. Please check your internet connection.");
      }
    }

    // 3. Delete user's consent record
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.warn("Failed to delete user consent record:", err);
    }

    // 4. Delete the actual auth account
    try {
      await deleteUser(auth.currentUser);
      localStorage.removeItem('ledgro_offline_shopId');
      localStorage.removeItem('ledgro_offline_shopAdminId');
      localStorage.removeItem('ledgro_offline_shopName');
      localStorage.removeItem('lastLoginTime');
      try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
      } catch(e) {
        console.error("Failed to clear offline cache", e);
      }
      window.location.href = '/';
    } catch (error) {
      throw new Error("Failed to delete account entirely. Please try again.");
    }
  }, [shopId]);

  const value = useMemo(() => ({
    user,
    hasShop,
    shopId,
    shopAdminId,
    shopName,
    loading,
    setHasShop,
    setShopId,
    setShopAdminId,
    signInWithGoogle,
    signOut,
    deleteAccount
  }), [user, hasShop, shopId, shopAdminId, shopName, loading, signInWithGoogle, signOut, deleteAccount]);

  return (
    <AuthContext.Provider value={value}>
      {loading ? <SplashScreen /> : children}
    </AuthContext.Provider>
  );
};
