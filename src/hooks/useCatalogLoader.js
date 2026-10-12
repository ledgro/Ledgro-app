import { useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useCatalogStore } from '../store/catalogStore';

/** Loads the shop catalog into the shared store. Safe to call from any screen. */
export function useCatalogLoader(shopId) {
  const hydrateCatalog = useCatalogStore((s) => s.hydrateCatalog);
  useEffect(() => {
    if (!shopId) return undefined;
    let cancelled = false;
    getDocs(collection(db, `shops/${shopId}/catalog`))
      .then((snap) => {
        if (cancelled) return;
        hydrateCatalog(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      })
      .catch((err) => console.error('Failed to load catalog', err));
    return () => { cancelled = true; };
  }, [hydrateCatalog, shopId]);
}
