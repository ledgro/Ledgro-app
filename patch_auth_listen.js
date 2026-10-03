import fs from 'fs';

let content = fs.readFileSync('src/context/AuthContext.jsx', 'utf-8');

// The listenForSessionEvents now receives a uid. Only act if the current logged-in user matches the uid.
content = content.replace(
  /const cleanup = listenForSessionEvents\(\n\s*async \(\) => \{/,
  `const cleanup = listenForSessionEvents(
      async (broadcastUid) => {
        if (!auth.currentUser || auth.currentUser.uid !== broadcastUid) return;`
);

fs.writeFileSync('src/context/AuthContext.jsx', content);
