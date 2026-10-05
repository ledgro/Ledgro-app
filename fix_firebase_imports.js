import fs from 'fs';
let content = fs.readFileSync('src/firebase.js', 'utf-8');

// Insert missing imports
content = `import { initializeApp, getApp, getApps } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider, setPersistence, indexedDBLocalPersistence } from 'firebase/auth';
` + content;

// Remove stray duplicate import
content = content.replace("import { getApp, getApps } from 'firebase/app';\n", "");

fs.writeFileSync('src/firebase.js', content);
