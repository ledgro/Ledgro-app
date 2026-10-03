import fs from 'fs';

let content = fs.readFileSync('src/firebase.js', 'utf-8');

// Fix 1: Dev environment hot reload crash prevention
content = content.replace(
  /const app = initializeApp\(firebaseConfig\);/,
  `import { getApp, getApps } from 'firebase/app';
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);`
);

// Fix 2: process.env.NODE_ENV -> import.meta.env.MODE
content = content.replace(
  /process\.env\.NODE_ENV !== 'test'/,
  `import.meta.env.MODE !== 'test'`
);

// Fix 3: ReCaptchaEnterpriseProvider instead of CustomProvider (Mock Turnstile block)
content = content.replace(
  /import \{ initializeAppCheck, CustomProvider \} from 'firebase\/app-check';/,
  `import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';`
);

const appCheckOld = /export let appCheck = null;\nif \(typeof window !== 'undefined' && import\.meta\.env\.MODE !== 'test'\) \{[\s\S]*?\}\nconst auth = getAuth\(app\);/;
const appCheckNew = `export let appCheck = null;
if (typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  // If in dev, we can set FIREBASE_APPCHECK_DEBUG_TOKEN flag on window
  if (import.meta.env.DEV) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }

  appCheck = initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider('6Ld_REAqAAAAAA9pP2Y4V_T2-V_P9Y9K9Q9V9V9Y'), // Replace with actual site key in console later
    isTokenAutoRefreshEnabled: true
  });
}
const auth = getAuth(app);`;

content = content.replace(appCheckOld, appCheckNew);

// Fix 4: Set CACHE_SIZE_UNLIMITED -> 100MB (104857600), Handle IDB fallback
content = content.replace(
  /import \{[\s\S]*?CACHE_SIZE_UNLIMITED,[\s\S]*?\} from 'firebase\/firestore';/,
  `import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  getPersistentCacheIndexManager,
  enablePersistentCacheIndexAutoCreation
} from 'firebase/firestore';`
);

const dbInitOld = /const db = initializeFirestore\(app, \{[\s\S]*?\}\);\n\nconst indexManager = new PersistentCacheIndexManager\(db\);\nenablePersistentCacheIndexAutoCreation\(indexManager\);/;
const dbInitNew = `let db;
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
}`;

content = content.replace(dbInitOld, dbInitNew);

fs.writeFileSync('src/firebase.js', content);
