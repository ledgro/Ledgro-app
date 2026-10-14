import { collection, getDocs, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { db } from '../firebase';
import { clearStore, getAllRecords, putRecords } from './idb';

const STORE = 'catalogCache';
const META_ID = '__meta';
export const FULL_REFRESH_MS = 24 * 60 * 60 * 1000;

const isTs = (v) => v && typeof v === 'object' && typeof v.seconds === 'number' && typeof v.nanoseconds === 'number';

export function encodeItem(item) {
  const out = {};
  Object.entries(item).forEach(([k, v]) => {
    out[k] = isTs(v) ? { __ts: [v.seconds, v.nanoseconds] } : v;
  });
  return out;
}

export function decodeItem(rec) {
  const out = {};
  Object.entries(rec).forEach(([k, v]) => {
    out[k] = v && Array.isArray(v.__ts) ? new Timestamp(v.__ts[0], v.__ts[1]) : v;
  });
  return out;
}

export function mergeChanged(items, changed) {
  const byId = new Map(items.map((i) => [i.id, i]));
  changed.forEach((c) => byId.set(c.id, c));
  return [...byId.values()];
}

export function newestCursor(items, fallback) {
  let best = fallback;
  items.forEach((i) => {
    const t = i.updatedAt;
    if (!isTs(t)) return;
    if (!best || t.seconds > best.seconds || (t.seconds === best.seconds && t.nanoseconds > best.nanoseconds)) {
      best = { seconds: t.seconds, nanoseconds: t.nanoseconds };
    }
  });
  return best;
}

export function needsFullRead(meta, shopId, now) {
  return !meta || meta.shopId !== shopId || !meta.cursor || now - (meta.fullAt || 0) > FULL_REFRESH_MS;
}

const toItems = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));

async function readCache() {
  try {
    const rows = await getAllRecords(STORE);
    const meta = rows.find((r) => r.id === META_ID) || null;
    const items = rows.filter((r) => r.id !== META_ID).map(decodeItem);
    return { meta, items };
  } catch {
    return { meta: null, items: [] };
  }
}

async function writeCache(shopId, items, cursor, fullAt) {
  try {
    await clearStore(STORE);
    await putRecords(STORE, [...items.map(encodeItem), { id: META_ID, shopId, cursor, fullAt }]);
  } catch (err) {
    console.warn('Could not save catalog cache', err);
  }
}

/**
 * Returns the shop catalog. First visit (or once a day) reads every product; every other time
 * it reads only products changed since the newest one already held, keeping reads small.
 * Every catalog write sets updatedAt to server time (enforced by firestore.rules), so a change
 * can never be missed. The daily full read also picks up products an admin deleted.
 */
export async function loadCatalog(shopId, { onCached } = {}) {
  const ref = collection(db, `shops/${shopId}/catalog`);
  const { meta, items: cached } = await readCache();
  const usable = meta && meta.shopId === shopId;
  if (usable && cached.length) onCached?.(cached);

  const full = needsFullRead(meta, shopId, Date.now());
  if (full) {
    const items = toItems(await getDocs(ref));
    await writeCache(shopId, items, newestCursor(items, null), Date.now());
    return items;
  }

  const cursor = new Timestamp(meta.cursor.seconds, meta.cursor.nanoseconds);
  const changed = toItems(await getDocs(query(ref, where('updatedAt', '>=', cursor), orderBy('updatedAt'))));
  const items = mergeChanged(cached, changed);
  if (changed.length) await writeCache(shopId, items, newestCursor(changed, meta.cursor), meta.fullAt);
  return items;
}

export async function forgetCatalogCache() {
  try { await clearStore(STORE); } catch { /* nothing cached */ }
}
