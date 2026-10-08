import { collection, doc, getDocs, increment, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import { db } from '../firebase';
import { billDelta, dayKey, emptyStats, mergeEntries, negate, toDate, buildDayStats } from './statsMath';
import { fetchAllPaged } from './firestoreUtils';

const NUM_KEYS = ['rev', 'cash', 'upi', 'splitCash', 'splitUpi', 'bills', 'exp', 'expCash'];

/**
 * Add day-total increments to a batch. Always writes every field so the rules
 * can require them. One write per day, even if several entries share a day.
 * entries: [{ key: 'yyyy-MM-dd', delta }]  (delta already signed)
 */
export function writeStats(batch, shopId, entries) {
  mergeEntries(entries).forEach((d, key) => {
    const data = { date: key };
    NUM_KEYS.forEach((k) => { data[k] = increment(d[k]); });
    data.cats = {};
    Object.entries(d.cats).forEach(([c, v]) => { data.cats[c] = increment(v); });
    batch.set(doc(db, `shops/${shopId}/dailyStats`, key), data, { merge: true });
  });
}

/**
 * Voiding a sale removes it from its own day. Returns made against it are
 * excluded by the reports too, so they come out of their days as well.
 */
export async function voidEntries(shopId, original) {
  const entries = [{ key: dayKey(toDate(original.createdAt)), delta: negate(billDelta({ ...original, type: original.type === 'return' ? 'return' : 'sale' })) }];
  const snap = await getDocs(query(collection(db, `shops/${shopId}/bills`), where('originalBillId', '==', original.id), limit(100)));
  snap.docs.forEach((d) => {
    const r = d.data({ serverTimestamps: 'estimate' });
    if (r.type === 'return') entries.push({ key: dayKey(toDate(r.createdAt)), delta: negate(billDelta(r)) });
  });
  return entries;
}

/** Read day totals between two yyyy-MM-dd keys (inclusive). Returns Map key -> stats. */
export async function readStatsRange(shopId, fromKey, toKey) {
  const out = new Map();
  let cursor = null;
  for (let page = 0; page < 5; page++) {
    const parts = [where('date', '>=', fromKey), where('date', '<=', toKey), orderBy('date')];
    if (cursor) parts.push(startAfter(cursor));
    const snap = await getDocs(query(collection(db, `shops/${shopId}/dailyStats`), ...parts, limit(100)));
    snap.docs.forEach((d) => out.set(d.id, { ...emptyStats(), ...d.data(), cats: d.data().cats || {} }));
    if (snap.size < 100) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

/**
 * Admin tool: recompute the last `days` days of totals from the real bills and
 * expenses, and overwrite the stored day totals. Use once for shops that had
 * data before day totals existed.
 */
export async function rebuildStats(shopId, days = 90) {
  const { writeBatch } = await import('firebase/firestore');
  const to = new Date();
  const from = new Date(); from.setDate(from.getDate() - days); from.setHours(0, 0, 0, 0);
  const range = [where('createdAt', '>=', from), where('createdAt', '<=', to)];
  const [bd, ed] = await Promise.all([
    fetchAllPaged(`shops/${shopId}/bills`, range),
    fetchAllPaged(`shops/${shopId}/expenses`, range),
  ]);
  const bills = bd.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
  const expenses = ed.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
  const built = buildDayStats(bills, expenses);

  const keys = [];
  for (let i = 0; i <= days; i++) { const d = new Date(from); d.setDate(from.getDate() + i); keys.push(dayKey(d)); }
  for (let i = 0; i < keys.length; i += 400) {
    const batch = writeBatch(db);
    keys.slice(i, i + 400).forEach((key) => {
      const s = built.get(key) || emptyStats();
      batch.set(doc(db, `shops/${shopId}/dailyStats`, key), { date: key, ...Object.fromEntries(NUM_KEYS.map((k) => [k, s[k]])), cats: s.cats });
    });
    await batch.commit();
  }
  return { days: keys.length, bills: bills.length };
}
