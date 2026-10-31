import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';
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

// App Check: Firebase only answers requests that carry a token proven by reCAPTCHA Enterprise, so scripts that
// call the database directly are turned away once enforcement is switched on in the console.
// This is a public site key (it ships to every browser by design), not a secret.
const RECAPTCHA_SITE_KEY = '6LddKdItAAAAAJS2nnWIDQi7ha3BF4pIYCJCZhml';
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  try {
    if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true; // local development uses a debug token printed in the console
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.warn('App Check not started:', err);
  }
}

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

export { auth, googleProvider, db };
