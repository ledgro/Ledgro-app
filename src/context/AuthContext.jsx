import { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, setPersistence, indexedDBLocalPersistence, deleteUser, reauthenticateWithPopup } from 'firebase/auth';
import { listenForSessionEvents } from '../lib/sessionBroadcast';
import { clearStore } from '../lib/idb';
import { sessionGuard } from '../lib/SessionGuard';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteField, deleteDoc, onSnapshot, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import { deleteShopCascade, flushPendingWrites } from '../lib/firestoreUtils';
import SplashScreen from '../components/SplashScreen';

const AuthContext = createContext();
const SESSION_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in ms

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// Legacy keys from older versions: only ever deleted now, never read or written.
const OFFLINE_KEYS = ['ledgro_offline_shopId', 'ledgro_offline_shopAdminId', 'ledgro_offline_shopName', 'lastLoginTime'];

try { OFFLINE_KEYS.slice(0, 3).forEach((k) => localStorage.removeItem(k)); } catch { /* storage unavailable */ }

function clearLocalSession() {
  OFFLINE_KEYS.forEach((k) => localStorage.removeItem(k));
}

async function wipeOfflineData() {
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    console.info('Offline cache wipe skipped or failed', e);
  }
  try {
    await clearStore('pendingBills');
    await clearStore('session');
    await clearStore('catalogCache');
  } catch (e) {
    console.info('IDB clear skipped or failed', e);
  }
}

function RetryScreen({ onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center h-[100dvh] bg-slate-50 p-8 text-center" role="alert">
      <h2 className="text-xl font-semibold text-slate-900 mb-2">Could not load your shop</h2>
      <p className="text-slate-500 text-sm mb-6 max-w-sm">
        Check your internet connection and try again. Your data is safe.
      </p>
      <button onClick={onRetry} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold">Retry</button>
    </div>
  );
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [shopAdminId, setShopAdminId] = useState(null);
  const [shopName, setShopName] = useState('');
  const [shopProfile, setShopProfile] = useState({ address: '', phone: '', tagline: '' });
  const [shopError, setShopError] = useState(false);
  const [lookupNonce, setLookupNonce] = useState(0);

  const requestCounter = useRef(0);
  // set while this device is deliberately leaving / deleting, so the
  // "you were removed" listener below doesn't fight the voluntary flow
  const voluntaryExitRef = useRef(false);

  useEffect(() => {
    const cleanup = listenForSessionEvents(
      async (broadcastUid) => {
        if (!auth.currentUser || auth.currentUser.uid !== broadcastUid) return;
        try {
          clearLocalSession();
          await wipeOfflineData();
          await firebaseSignOut(auth);
          window.location.href = '/';
        } catch (e) {
          console.error('Session event auto sign-out failed', e);
        }
      },
      async (uid) => {
        if (auth.currentUser && auth.currentUser.uid !== uid) {
          try {
            clearLocalSession();
            await wipeOfflineData();
            await firebaseSignOut(auth);
          } catch (e) {
            console.error('Cross-tab session mismatch auto sign-out failed', e);
          }
        }
      }
    );
    return cleanup;
  }, []);

  useEffect(() => {
    const clearShop = () => {
      setHasShop(false);
      setShopId(null);
      setShopAdminId(null);
      setShopName('');
    };

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
      if (currentUser) {
        sessionGuard.bindSession(currentUser.uid);
      }

      if (!currentUser) {
        setHasShop(null);
        setShopId(null);
        setShopAdminId(null);
        setShopName('');
        setShopError(false);
        setLoading(false);
        return;
      }

      try {
        setShopError(false);

        // Shop and role always come from the server (nothing is remembered on the device).
        // Find the shop by membership. Equality filters (not `in`) so
        // firestore.rules can prove the query only returns shops the user belongs to.
        // allSettled: one rejected query must not hide a shop found by the other.
        const shopsRef = collection(db, 'shops');
        const results = await Promise.allSettled([
          getDocs(query(shopsRef, where(`members.${currentUser.uid}`, '==', 'admin'))),
          getDocs(query(shopsRef, where(`members.${currentUser.uid}`, '==', 'member'))),
        ]);
        if (currentRequestId !== requestCounter.current) return;

        const fulfilled = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
        const foundShop = fulfilled.flatMap((snap) => snap.docs)[0] || null;

        if (foundShop) {
          const data = foundShop.data({ serverTimestamps: 'estimate' });
          setHasShop(true);
          setShopId(foundShop.id);
          setShopAdminId(data.ownerId);
          setShopName(data.name);
        } else if (fulfilled.length === results.length) {
          // every query succeeded and found nothing: genuinely no shop yet
          clearShop();
        } else {
          // a query failed and nothing was found: we do not know -> let the user retry
          console.error('Shop lookup failed', results);
          setShopError(true);
        }
      } catch (error) {
        console.error('Error checking for shop:', error);
        if (currentRequestId !== requestCounter.current) return;
        setShopError(true);
      }

      if (currentRequestId === requestCounter.current) {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [lookupNonce]);

  // Live shop listener: keeps owner/name/profile fresh AND logs out a user who
  // was removed from the shop (or whose shop was deleted) on ANY screen, not
  // only the Members page.
  useEffect(() => {
    if (!user?.uid || !shopId || !hasShop) return undefined;

    const revoke = async () => {
      if (voluntaryExitRef.current) return;
      clearLocalSession();
      await wipeOfflineData();
      try { await firebaseSignOut(auth); } catch (e) { console.error(e); }
      window.location.replace('/');
    };

    const unsubscribe = onSnapshot(doc(db, 'shops', shopId), (snap) => {
      if (!snap.exists()) {
        // a cache-only "missing" while offline is not a real deletion
        if (!snap.metadata.fromCache) revoke();
        return;
      }
      const data = snap.data({ serverTimestamps: 'estimate' });
      const members = data.members || {};
      if (members[user.uid] == null) {
        revoke();
        return;
      }
      setShopAdminId((prev) => (data.ownerId && data.ownerId !== prev ? data.ownerId : prev));
      setShopName((prev) => (data.name && data.name !== prev ? data.name : prev));
      setShopProfile({ address: data.address || '', phone: data.phone || '', tagline: data.tagline || '' });
    }, (err) => {
      if (err?.code === 'permission-denied') revoke();
      else console.warn('Shop listener error', err);
    });

    return () => unsubscribe();
  }, [user?.uid, shopId, hasShop]);

  useEffect(() => {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().then((granted) => {
        if (!granted) {
          console.warn('Storage will not be persisted. Running in best-effort mode.');
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
        throw new Error('An account already exists with this email using a different sign-in method. Please sign in using your original provider.');
      } else if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        // User closed popup or cancelled auth request: silent, no error shown
      } else if (error.code === 'auth/popup-blocked') {
        throw new Error('Popup blocked. Please allow popups for this site.');
      } else {
        throw new Error('Sign-in failed. Please try again.');
      }
    }
  }, []);

  /**
   * Sign out and wipe the offline cache. Refuses (throws SYNC_PENDING) while
   * offline bills are still queued, because wiping would destroy them.
   * `force` skips that check (used when the user was removed from the shop and
   * their writes can no longer succeed anyway).
   */
  const signOut = useCallback(async ({ force = false } = {}) => {
    if (!force) {
      const flushed = await flushPendingWrites();
      if (!flushed) throw new Error('SYNC_PENDING');
    }

    clearLocalSession();
    setHasShop(null);
    setShopId(null);
    setShopAdminId(null);
    setShopName('');
    sessionGuard.unbindSession();

    await wipeOfflineData();

    try {
      await firebaseSignOut(auth);
    } catch (e) {
      console.error('Failed to sign out', e);
      throw e;
    }
    // Firestore was terminated above; a clean reload is the only safe way to
    // get a working instance for the next sign-in.
    window.location.replace('/');
  }, []);

  const beginVoluntaryExit = useCallback(() => {
    voluntaryExitRef.current = true;
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!auth.currentUser) return;

    try {
      // Re-authenticate before any destructive operation
      await reauthenticateWithPopup(auth.currentUser, googleProvider);
    } catch (error) {
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        throw new Error('Account deletion cancelled.');
      }
      throw new Error('Failed to authenticate. Please try again.');
    }

    const uid = auth.currentUser.uid;

    // Make sure nothing the user already recorded is still waiting to upload
    const flushed = await flushPendingWrites();
    if (!flushed) {
      throw new Error('You have unsynced offline data. Connect to the internet and wait for it to sync before deleting your account.');
    }

    voluntaryExitRef.current = true;

    try {
      if (shopId) {
        const shopDocRef = doc(db, 'shops', shopId);
        const shopSnap = await getDoc(shopDocRef);
        if (shopSnap.exists()) {
          const shopData = shopSnap.data();
          const members = shopData.members || {};
          const memberCount = Object.keys(members).length;
          const otherAdmins = Object.keys(members).filter((m) => m !== uid && members[m] === 'admin');

          if (members[uid] === 'admin' && otherAdmins.length === 0) {
            if (memberCount === 1) {
              // sole member: close the shop and all its records
              await deleteShopCascade(shopId);
            } else {
              throw new Error('You are the only Admin. You must promote another member to Admin before deleting your account to prevent locking the shop.');
            }
          } else {
            const update = { [`members.${uid}`]: deleteField() };
            // never leave the shop pointing at an owner who no longer exists
            if (shopData.ownerId === uid && otherAdmins.length > 0) update.ownerId = otherAdmins[0];
            await updateDoc(shopDocRef, update);
          }
        }
      }
    } catch (err) {
      voluntaryExitRef.current = false;
      if (err.message.includes('only Admin')) throw err;
      console.error('Error removing member from shop:', err);
      throw new Error('Failed to remove account from shop. Please check your internet connection.');
    }

    // consent record
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.warn('Failed to delete user consent record:', err);
    }

    // the auth account itself
    try {
      await deleteUser(auth.currentUser);
    } catch (error) {
      voluntaryExitRef.current = false;
      console.error(error);
      throw new Error('Failed to delete account entirely. Please try again.');
    }

    clearLocalSession();
    await wipeOfflineData();
    window.location.replace('/');
  }, [shopId]);

  const value = useMemo(() => ({
    user,
    hasShop,
    shopId,
    shopAdminId,
    shopName,
    shopProfile,
    loading,
    setHasShop,
    setShopId,
    setShopAdminId,
    signInWithGoogle,
    signOut,
    beginVoluntaryExit,
    deleteAccount,
  }), [user, hasShop, shopId, shopAdminId, shopName, shopProfile, loading, signInWithGoogle, signOut, beginVoluntaryExit, deleteAccount]);

  if (loading) {
    return <AuthContext.Provider value={value}><SplashScreen /></AuthContext.Provider>;
  }

  if (user && hasShop === null && shopError) {
    return (
      <AuthContext.Provider value={value}>
        <RetryScreen onRetry={() => { setLoading(true); setShopError(false); setLookupNonce((n) => n + 1); }} />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
