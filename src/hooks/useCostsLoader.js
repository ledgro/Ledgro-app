import { useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useCostStore } from '../store/costStore';

/** Loads the owner-only cost documents once per shop. Staff never call the rules-protected collection. */
export function useCostsLoader(shopId, isAdmin) {
  useEffect(() => {
    if (!shopId || !isAdmin) return;
    const st = useCostStore.getState();
    if (st.loaded && st.shopId === shopId) return;
    let live = true;
    getDocs(collection(db, `shops/${shopId}/costs`)).then((snap) => {
      if (!live) return;
      const costs = {};
      snap.docs.forEach((d) => { const v = d.data(); costs[d.id] = { costPrice: v.costPrice ?? null, source: v.source || '' }; });
      useCostStore.getState().setAll(shopId, costs);
    }).catch((err) => console.warn('Could not load costs', err));
    return () => { live = false; };
  }, [shopId, isAdmin]);
}
