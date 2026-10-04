import fs from 'fs';
let content = fs.readFileSync('src/pages/PLScreen.jsx', 'utf-8');

// Ensure useDeferredValue and limit are imported
if (!content.includes("useDeferredValue")) {
    content = content.replace("useCallback } from 'react';", "useCallback, useDeferredValue } from 'react';");
}
if (!content.includes("limit")) {
    content = content.replace("getDocs } from 'firebase/firestore';", "getDocs, limit } from 'firebase/firestore';");
}

fs.writeFileSync('src/pages/PLScreen.jsx', content);
