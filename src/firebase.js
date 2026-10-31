import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence, initializeAuth, inMemoryPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getPersistentCacheIndexManager,
  enablePersistentCacheIndexAutoCreation
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: "getledgro-2afec.firebaseapp.com",
  projectId: "getledgro-2afec",
  storageBucket: "getledgro-2afec.firebasestorage.app",
  messagingSenderId: "238850420032",
  appId: "1:238850420032:web:e448f2bc083bcd07b4dea5"
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

const auth = getAuth(app);

setPersistence(auth, indexedDBLocalPersistence).catch((err) => {
  console.warn('IndexedDB persistence unavailable:', err);
});

const googleProvider = new GoogleAuthProvider();

let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
      cacheSizeBytes: 104857600 // 100 MB max to prevent eviction loops
    })
  });

  const indexManager = getPersistentCacheIndexManager(db);
  if (indexManager) {
    enablePersistentCacheIndexAutoCreation(indexManager);
  }
} catch (err) {
  console.warn("Failed to initialize persistent Firestore cache, falling back to memory:", err);
  if (err.code === 'failed-precondition') {
    db = getFirestore(app); // Fallback for hot reloads where initialization already happened
  } else {
    db = initializeFirestore(app, { localCache: memoryLocalCache() });
  }
}

// A second, separate connection used only to create staff logins: creating a user signs that user in,
// and this keeps the owner signed in on the main one. Nothing is stored on the device.
let staffAuth;
export function getStaffCreateAuth() {
  if (!staffAuth) {
    const existing = getApps().find((a) => a.name === 'staff-create');
    const second = existing || initializeApp(firebaseConfig, 'staff-create');
    staffAuth = initializeAuth(second, { persistence: inMemoryPersistence });
  }
  return staffAuth;
}

export { auth, googleProvider, db };
