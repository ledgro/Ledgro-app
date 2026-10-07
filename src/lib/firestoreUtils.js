import {
  collection, query, orderBy, limit, startAfter, getDocs, writeBatch, doc, deleteDoc, waitForPendingWrites,
} from 'firebase/firestore';
import { db } from '../firebase';

// firestore.rules only allow `list` queries with limit <= 100, so every
// "give me everything" read has to go through fixed-size pages.
export const PAGE_SIZE = 100;
const MAX_PAGES = 200; // hard stop: 20,000 docs per call

/**
 * Read every document of a collection that matches `constraints`
 * (where(...) filters only), ordered by createdAt, in pages of 100.
 * Returns an array of DocumentSnapshots.
 */
export async function fetchAllPaged(collectionPath, constraints = []) {
  const ref = collection(db, collectionPath);
  const out = [];
  let cursor = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const q = cursor
      ? query(ref, ...constraints, orderBy('createdAt'), startAfter(cursor), limit(PAGE_SIZE))
      : query(ref, ...constraints, orderBy('createdAt'), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    out.push(...snap.docs);
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/** Delete every doc in a collection, 100 at a time (rules cap list size at 100). */
export async function deleteCollectionPaged(collectionPath) {
  const ref = collection(db, collectionPath);
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await getDocs(query(ref, limit(PAGE_SIZE)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    if (snap.size < PAGE_SIZE) return;
  }
}

/**
 * Permanently remove a shop and everything under it.
 * Only valid when the caller is the sole admin AND sole member
 * (that is the only case firestore.rules allow it).
 */
export async function deleteShopCascade(shopId) {
  for (const sub of ['bills', 'expenses', 'catalog', 'dailyClosures']) {
    await deleteCollectionPaged(`shops/${shopId}/${sub}`);
  }
  await deleteDoc(doc(db, 'shops', shopId));
}

/**
 * Wait until every locally queued write has been acknowledged by the server.
 * Returns true when flushed, false when it timed out (still unsynced).
 * Call this before anything that wipes the offline cache (sign-out, clear cache),
 * otherwise queued bills would be destroyed.
 */
export async function flushPendingWrites(timeoutMs = 8000) {
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); });
  try {
    return await Promise.race([waitForPendingWrites(db).then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
