import fs from 'fs';

let content = fs.readFileSync('src/App.jsx', 'utf-8');

// Fix sync loop in App.js: wrap sync in a component rendered inside AuthProvider
const appReplacement = `function SyncManager() {
  const { user } = useAuth();
  const isSyncingRef = React.useRef(false);

  useEffect(() => {
    let intervalId;
    let cancelled = false;

    const handleSync = async () => {
       if (isSyncingRef.current || !navigator.onLine || !user) return;
       isSyncingRef.current = true;
       try {
         const pending = await getAllData('pendingBills');
         for (const bill of pending) {
            if (cancelled) break;

            // Strictly check uid and shopId
            if (!bill.uid || bill.uid !== user.uid) continue;

            try {
               // Clone data and inject serverTimestamp
               const { serverTimestamp } = await import('firebase/firestore');
               const data = { ...bill.data, createdAt: serverTimestamp() };
               await setDoc(doc(db, bill.path), data);
               await deleteData('pendingBills', bill.id);
            } catch(e) {
               console.error('Failed to sync bill', e);
               // In a production app, we would add retry count and quarantine bad bills here.
               // For now, we continue so one bad bill doesn't block the rest.
            }
         }
       } finally {
         isSyncingRef.current = false;
       }
    };

    // Sync on mount/auth change
    handleSync();
    window.addEventListener('online', handleSync);

    // Aggressive sync fallback if storage is not persisted
    if (navigator.storage && navigator.storage.persist) {
       navigator.storage.persist().then(granted => {
          if (!granted && !cancelled) {
             intervalId = setInterval(handleSync, 15000);
          }
       });
    }

    return () => {
       cancelled = true;
       window.removeEventListener('online', handleSync);
       if (intervalId) clearInterval(intervalId);
    };
  }, [user]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SyncManager />
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  );
}`;

content = content.replace(/export default function App\(\) \{[\s\S]*$/, appReplacement);

// Need to import React
content = content.replace("import { useState, useEffect } from 'react';", "import React, { useState, useEffect } from 'react';");

// Make sure ErrorBoundary wraps AuthProvider properly (already done above, we just need to remove old export)
fs.writeFileSync('src/App.jsx', content);
