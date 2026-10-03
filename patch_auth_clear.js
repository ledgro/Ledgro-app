import fs from 'fs';

let content = fs.readFileSync('src/context/AuthContext.jsx', 'utf-8');

// Add clearStore import
content = content.replace(
  /import \{ listenForSessionEvents \} from '\.\.\/lib\/sessionBroadcast';/,
  `import { listenForSessionEvents } from '../lib/sessionBroadcast';\nimport { clearStore } from '../lib/idb';`
);

// Call clearStore for IDB data on sign out inside the handleSignOut function
const signOutRegex = /const signOut = useCallback\(async \(\) => \{[\s\S]*?try \{[\s\S]*?const pending = await getAllData\('pendingBills'\);/g;
if (content.match(signOutRegex)) {
  content = content.replace(
    /await firebaseSignOut\(auth\);\n\s*window\.location\.href = '\/';/,
    `try {
        await clearStore('pendingBills');
        await clearStore('session');
        await clearStore('catalogCache');
      } catch (e) { console.warn('Could not clear IDB on sign out', e) }
      await firebaseSignOut(auth);
      window.location.href = '/';`
  );
}

// Add clearStore to the listenForSessionEvents callback
content = content.replace(
  /await terminate\(db\);\n\s*await clearIndexedDbPersistence\(db\);\n\s*\} catch\(e\) \{ console\.error\(e\) \}\n\n\s*await firebaseSignOut\(auth\);/,
  `await terminate(db);
            await clearIndexedDbPersistence(db);
            try {
              await clearStore('pendingBills');
              await clearStore('session');
              await clearStore('catalogCache');
            } catch(idbErr) { console.warn('Could not clear IDB', idbErr) }
          } catch(e) { console.error(e) }

          await firebaseSignOut(auth);`
);

fs.writeFileSync('src/context/AuthContext.jsx', content);
