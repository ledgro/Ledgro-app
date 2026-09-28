import { initializeApp } from 'firebase/app';
import { initializeAppCheck, CustomProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  CACHE_SIZE_UNLIMITED,
  PersistentCacheIndexManager,
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

const app = initializeApp(firebaseConfig);

let appCheck = null;
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  appCheck = initializeAppCheck(app, {
    provider: new CustomProvider({
      getToken: () => {
        return new Promise((resolve) => {
          // Cloudflare Turnstile token exchange logic goes here.
          // For now, we mock a successful token since we don't have the Turnstile widget.
          resolve({
            token: 'mock-turnstile-token',
            expireTimeMillis: Date.now() + 60 * 60 * 1000
          });
        });
      }
    }),
    isTokenAutoRefreshEnabled: true
  });
}
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

setPersistence(auth, indexedDBLocalPersistence).catch(err => {
  console.warn('IndexedDB persistence unavailable:', err);
});

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});

const indexManager = new PersistentCacheIndexManager(db);
enablePersistentCacheIndexAutoCreation(indexManager);

export { auth, googleProvider, db };
