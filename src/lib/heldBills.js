import { calculateBillTotals } from '../reducers/billReducer';

// Bills put on hold while another customer is served. Kept on this phone only (nothing is sent to the server).
const KEY = 'ledgro-held-bills';
export const MAX_HELD = 10;
export const HELD_TTL_MS = 12 * 60 * 60 * 1000;

export function loadHeld(uid, shopId, now = Date.now()) {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!d || d.uid !== uid || d.shopId !== shopId || !Array.isArray(d.held)) return [];
    return d.held.filter((h) => h?.items?.length && now - h.savedAt <= HELD_TTL_MS);
  } catch { return []; }
}

export function saveHeld(uid, shopId, held) {
  try {
    if (held.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ uid, shopId, held }));
  } catch { /* storage blocked */ }
}

/** New list with the cart added at the front (newest first). Returns null when the list is full. */
export function addHeld(held, cart, now = Date.now()) {
  if (!cart?.items?.length || held.length >= MAX_HELD) return null;
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return [{ id, savedAt: now, items: cart.items, globalDiscount: cart.globalDiscount ?? null }, ...held];
}

export const removeHeld = (held, id) => held.filter((h) => h.id !== id);

export function heldSummary(h) {
  const { grandTotal } = calculateBillTotals({ items: h.items, globalDiscount: h.globalDiscount });
  return { total: grandTotal, count: h.items.length, names: h.items.slice(0, 2).map((i) => i.name).join(', ') };
}
