import { useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useCostStore } from '../store/costStore';

/** Reads the owner-only cost documents. Sets `error` on failure so the boxes can say why and offer a retry. */
export async function loadCosts(shopId) {
  useCostStore.getState().setError(false);
  try {
    const snap = await getDocs(collection(db, `shops/${shopId}/costs`));
    const costs = {};
    snap.docs.forEach((d) => { const v = d.data(); costs[d.id] = { costPrice: v.costPrice ?? null, source: v.source || '' }; });
    useCostStore.getState().setAll(shopId, costs);
  } catch (err) {
    console.warn('Could not load costs', err);
    useCostStore.getState().setError(true);
  }
}

/** Loads the owner-only cost documents once per shop. Staff never call the rules-protected collection. */
export function useCostsLoader(shopId, isAdmin) {
  useEffect(() => {
    if (!shopId || !isAdmin) return;
    const st = useCostStore.getState();
    if (st.loaded && st.shopId === shopId) return;
    loadCosts(shopId);
  }, [shopId, isAdmin]);
}
