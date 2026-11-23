import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

// Cost price and supplier ("source") live in shops/{shopId}/costs/{productId}, readable by admins only.
// Until every product has been moved, the old fields on the product are the fallback.

export const costDocRef = (shopId, productId) => doc(db, `shops/${shopId}/costs/${productId}`);

/** The cost data to use for a product: the new document if it exists (even if empty), else the old fields. */
export function costFields(item, map) {
  const c = item && map ? map[item.id] : null;
  if (c) return { costPrice: c.costPrice ?? null, source: c.source || '' };
  return { costPrice: item?.costPrice ?? null, source: item?.source || '' };
}

/** Items with cost and source filled from the new place (fallback: old fields). */
export const withCosts = (items, map) => items.map((i) => ({ ...i, ...costFields(i, map) }));

/** Adds the owner-only cost document to a batch. Admin only: the rules refuse anyone else. */
export function putCost(w, shopId, productId, { costPrice, source }) {
  w.set(costDocRef(shopId, productId), {
    costPrice: costPrice == null || Number.isNaN(Number(costPrice)) ? null : Math.round(Number(costPrice)),
    source: String(source || '').slice(0, 60),
    updatedAt: serverTimestamp(),
  });
}

/** Products that still need moving: they have an old cost or supplier and no cost document yet. Safe to run twice. */
export function planCostMove(items, map) {
  return items
    .filter((i) => i && i.id && !i.deleted && !(map && map[i.id]) && (i.costPrice != null || String(i.source || '').trim()))
    .map((i) => ({ id: i.id, costPrice: i.costPrice ?? null, source: i.source || '' }));
}

/** Copies the planned rows into /costs in batches. The old fields are left in place. Returns how many were copied. */
export async function runCostMove(shopId, rows, onProgress) {
  const SIZE = 400;
  let done = 0;
  for (let i = 0; i < rows.length; i += SIZE) {
    const batch = writeBatch(db);
    rows.slice(i, i + SIZE).forEach((r) => putCost(batch, shopId, r.id, r));
    await batch.commit();
    done += Math.min(SIZE, rows.length - i);
    onProgress?.(done, rows.length);
  }
  return done;
}
