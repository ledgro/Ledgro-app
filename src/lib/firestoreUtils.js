import {
  collection, query, orderBy, limit, startAfter, getDocs, writeBatch, doc, deleteDoc, waitForPendingWrites,
} from 'firebase/firestore';
import { db } from '../firebase';
import { imageKey } from './productImage';

// firestore.rules only allow `list` queries with limit <= 100, so every
export const PAGE_SIZE = 100;
const DELETE_PAGE = 100; // reads are capped at 100 by firestore.rules; going higher is permission-denied
const MAX_PAGES = 200;

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
export async function deleteCollectionPaged(collectionPath, pageSize = DELETE_PAGE, onPage) {
  if (pageSize > PAGE_SIZE) pageSize = PAGE_SIZE;
  const ref = collection(db, collectionPath);
  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await getDocs(query(ref, limit(pageSize)));
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    onPage?.();
    if (snap.size < pageSize) return;
  }
}

/**
 * Permanently remove a shop and everything under it.
 * Only valid when the caller is the sole admin AND sole member
 * (that is the only case firestore.rules allow it).
 */
const STEP_LABEL = { bills: 'bills', expenses: 'expenses', catalog: 'products', dailyClosures: 'cash counts', dailyStats: 'totals', transfers: 'transfers', memberProfiles: 'names', errorLogs: 'error logs', photos: 'photos', catalogImages: 'photos', staffCash: 'staff cash', billCounters: 'bill numbers', auditLogs: 'activity log', staffPeople: 'salaries' };

/**
 * Photos are big (up to 70 KB each), so listing them to delete is slow. Their ids come from the catalog items,
 * so delete by id without reading them, then sweep up anything left over a few at a time.
 */
async function deleteImagesFast(shopId, tick) {
  const catalog = await getDocs(collection(db, `shops/${shopId}/catalog`));
  const keys = new Set();
  catalog.docs.forEach((d) => {
    const item = { id: d.id, ...d.data() };
    if (item.hasImage === false) return;
    keys.add(imageKey(item));
    if (item.groupId) keys.add(item.groupId);
  });
  const ids = [...keys].filter(Boolean);
  for (let i = 0; i < ids.length; i += DELETE_PAGE) {
    const batch = writeBatch(db);
    ids.slice(i, i + DELETE_PAGE).forEach((k) => batch.delete(doc(db, `shops/${shopId}/catalogImages`, k)));
    await batch.commit();
    tick?.();
  }
  await deleteCollectionPaged(`shops/${shopId}/catalogImages`, 25, tick);
}

/** One attempt at a step; rejects only if it makes no progress for `ms` (each page it finishes resets the clock). */
function attempt(label, run, ms) {
  let timer;
  let fail;
  const stuck = new Promise((_, reject) => { fail = reject; });
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => fail(Object.assign(new Error(`${label} is taking too long`), { code: `stuck-${label}` })), ms); };
  arm();
  return Promise.race([run(arm), stuck]).finally(() => clearTimeout(timer));
}

/**
 * Runs a step and, if it fails or stalls, tries again by itself (up to 4 times, a little longer apart each time).
 * Each try only deletes what is still left, so repeating is safe. Permission errors are not retried: they never fix themselves.
 */
async function step(label, run, ms = 60000, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await attempt(label, run, ms); } catch (err) {
      last = err;
      if (err?.code === 'permission-denied') throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw last;
}

/** Runs async tasks with at most `n` going at once, so the single write connection is not flooded. */
async function pool(tasks, n) {
  let next = 0;
  const worker = async () => { while (next < tasks.length) { const t = tasks[next++]; await t(); } };
  await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, worker));
}

export async function deleteShopCascade(shopId, onStep) {
  // Safe to run again: each step only deletes what is still left. Products go first, the biggest job on its own
  // so it is not stuck behind a dozen others, then the rest four at a time.
  const running = new Set();
  const say = (extra) => onStep?.(running.size ? `Deleting ${[...running].join(', ')}${extra ? ` (${extra})` : ''}...` : 'Almost done...');
  const run = (key, work) => async () => {
    const label = STEP_LABEL[key] || key;
    running.add(label); say();
    try { await step(label, work); } finally { running.delete(label); say(); }
  };
  const collection_ = (sub, size = DELETE_PAGE) => run(sub, (tick) => {
    let n = 0;
    return deleteCollectionPaged(`shops/${shopId}/${sub}`, size, () => { n += size; tick(); if (sub === 'catalog') say(`${n}+ gone`); });
  });
  const others = ['bills', 'expenses', 'dailyClosures', 'dailyStats', 'transfers', 'memberProfiles', 'errorLogs', 'staffCash', 'billCounters', 'auditLogs', 'staffPeople'];
  const tasks = [
    collection_('catalog', 50),
    run('photos', (tick) => deleteImagesFast(shopId, tick)),
    ...others.map((sub) => collection_(sub)),
  ];
  await pool(tasks, 4);
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
