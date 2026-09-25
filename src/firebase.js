import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
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
    provider: new ReCaptchaV3Provider('6Ld_ePwqAAAAACN_52wP49yD5ZzPz7H6E7_sD9sZ'),
    isTokenAutoRefreshEnabled: true
  });
}
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});

// Enable persistent cache index auto creation for faster offline queries
const indexManager = new PersistentCacheIndexManager(db);
enablePersistentCacheIndexAutoCreation(indexManager);

export { auth, googleProvider, db };
