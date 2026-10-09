import { format } from 'date-fns';

// Pure helpers. No Firebase imports, so they are easy to unit test.

/** Cash adjustments written by the old daily lock are not real expenses. */
export function isCashAdjustment(e) {
  if (e.category === 'cash_adjustment') return true;
  return e.category === 'other' && (e.description === 'Cash Shortage' || e.description === 'Cash Overage');
}

/** Bill total in paise with the correct sign (returns always negative). */
export function signedBillTotal(b) {
  const g = Number(b.grandTotal) || 0;
  return b.type === 'return' ? -Math.abs(g) : g;
}

export const dayKey = (d) => format(d, 'yyyy-MM-dd');

// Business day rolls over at 04:30, not midnight. A sale at 01:00 belongs to the day before.
export const DAY_CUTOFF_MIN = 4 * 60 + 30;
const CUT_MS = DAY_CUTOFF_MIN * 60 * 1000;
/** Date whose calendar day equals the business day of `d` (default now). Use for "today" and ranges. */
export const bizDate = (d = new Date()) => new Date(d.getTime() - CUT_MS);
/** Day key (yyyy-MM-dd) of the business day an event timestamp falls in. */
export const bizDayKey = (d = new Date()) => dayKey(bizDate(d));
/** Real start of a business day given its calendar date: 04:30 local that day. */
export const bizDayStart = (day) => { const x = new Date(day); x.setHours(0, 0, 0, 0); return new Date(x.getTime() + CUT_MS); };

export function toDate(ts) {
  if (!ts) return new Date();
  if (typeof ts.toDate === 'function') return ts.toDate();
  return ts instanceof Date ? ts : new Date(ts);
}

export const emptyStats = () => ({ rev: 0, cash: 0, upi: 0, splitCash: 0, splitUpi: 0, bills: 0, exp: 0, expCash: 0, cats: {} });
const NUM_KEYS = ['rev', 'cash', 'upi', 'splitCash', 'splitUpi', 'bills', 'exp', 'expCash'];

/** What one bill adds to its day. Voided/reversed bills add nothing. */
export function billDelta(b) {
  const d = emptyStats();
  if (!b || b.isVoided || b.type === 'reversal') return d;
  const mult = b.type === 'return' ? -1 : 1;
  const total = signedBillTotal(b);
  d.rev = total;
  d.bills = b.type === 'return' ? 0 : 1;
  const method = b.payment?.method || b.paymentMethod;
  if (method === 'split' && b.payment?.breakdown) {
    d.splitCash = (b.payment.breakdown.cash || 0) * mult;
    d.splitUpi = (b.payment.breakdown.upi || 0) * mult;
  } else if (method === 'upi' || b.refundMethod === 'upi') {
    d.upi = total;
  } else {
    d.cash = total;
  }
  return d;
}

const safeCat = (c) => String(c || 'other').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 30);

/** What one expense adds to its day. */
export function expenseDelta(e) {
  const d = emptyStats();
  if (!e || isCashAdjustment(e)) return d;
  const amt = Number(e.amount) || 0;
  d.exp = amt;
  d.expCash = (e.paidVia || 'cash') === 'cash' ? amt : 0;
  d.cats[safeCat(e.category)] = amt;
  return d;
}

export function addInto(target, delta, sign = 1) {
  NUM_KEYS.forEach((k) => { target[k] += sign * (delta[k] || 0); });
  Object.entries(delta.cats || {}).forEach(([c, v]) => { target.cats[c] = (target.cats[c] || 0) + sign * v; });
  return target;
}

export const negate = (d) => addInto(emptyStats(), d, -1);

/** Merge [{key, delta}] so each day is written once per batch. */
export function mergeEntries(entries) {
  const map = new Map();
  entries.forEach(({ key, delta }) => {
    if (!map.has(key)) map.set(key, emptyStats());
    addInto(map.get(key), delta);
  });
  return map;
}

/** Recompute day totals from raw docs (used by Rebuild and tests). Same rules as the old per-bill math. */
export function buildDayStats(bills, expenses) {
  const voided = new Set();
  bills.forEach((b) => {
    if (b.type === 'reversal' || b.isVoided) {
      voided.add(b.id);
      if (b.originalBillId) voided.add(b.originalBillId);
    }
  });
  const map = new Map();
  const get = (k) => { if (!map.has(k)) map.set(k, emptyStats()); return map.get(k); };
  bills.forEach((b) => {
    if (b.type === 'reversal' || b.isVoided) return;
    if (b.type === 'return' && voided.has(b.originalBillId)) return;
    addInto(get(bizDayKey(toDate(b.createdAt))), billDelta(b));
  });
  expenses.forEach((e) => {
    if (isCashAdjustment(e)) return;
    addInto(get(bizDayKey(toDate(e.createdAt))), expenseDelta(e));
  });
  return map;
}

export function sumStats(list) {
  const t = emptyStats();
  list.forEach((s) => addInto(t, { ...emptyStats(), ...s, cats: s.cats || {} }));
  return t;
}
