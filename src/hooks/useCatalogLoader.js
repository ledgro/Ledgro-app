import { useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useCatalogStore } from '../store/catalogStore';

/**
 * Loads the shop catalog into the shared store.
 * By default it only reads when the store is empty (saves reads on every screen change);
 * pass { force: true } for screens that must always see fresh data.
 */
export function useCatalogLoader(shopId, { force = false } = {}) {
  const hydrateCatalog = useCatalogStore((s) => s.hydrateCatalog);
  useEffect(() => {
    if (!shopId) return undefined;
    if (!force && useCatalogStore.getState().items.some((i) => i.id)) return undefined;
    let cancelled = false;
    getDocs(collection(db, `shops/${shopId}/catalog`))
      .then((snap) => {
        if (cancelled) return;
        hydrateCatalog(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
      })
      .catch((err) => console.error('Failed to load catalog', err));
    return () => { cancelled = true; };
  }, [hydrateCatalog, shopId, force]);
}
