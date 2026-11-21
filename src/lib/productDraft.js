// A half-typed New Product form is kept on this phone only (never Firestore: private, and no reads to pay for).
// One draft per shop and signed-in user. Everything is try/catch: storage can be blocked or full.

const PREFIX = 'ledgro.productDraft.';
const MAX_PHOTO_CHARS = 150000; // a photo bigger than this is skipped so the draft always fits

export const draftKey = (shopId, uid) => (shopId && uid ? `${PREFIX}${shopId}.${uid}` : null);

const today = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
export const sameDay = (savedAt, now = new Date()) => !!savedAt && today(new Date(savedAt)) === today(now);

/** True when nothing worth keeping was typed. */
export function isDraftEmpty(d) {
  if (!d) return true;
  const text = [d.name, d.price, d.stockCount, d.lowStockAlert, d.category, d.description, d.source, d.costPrice];
  if (text.some((v) => String(v ?? '').trim())) return false;
  if ((d.axes || []).some((a) => String(a.values ?? '').trim())) return false;
  if (Object.values(d.comboStock || {}).some((v) => String(v ?? '').trim())) return false;
  return !d.photo;
}

export function saveDraft(key, data, now = Date.now()) {
  if (!key) return false;
  try {
    if (isDraftEmpty(data)) { localStorage.removeItem(key); return false; }
    const keep = { ...data, photo: data.photo && data.photo.length <= MAX_PHOTO_CHARS ? data.photo : null, savedAt: now };
    localStorage.setItem(key, JSON.stringify(keep));
    return true;
  } catch { return false; }
}

export function loadDraft(key) {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && typeof d === 'object' && !isDraftEmpty(d) ? d : null;
  } catch { return null; }
}

export function clearDraft(key) {
  if (!key) return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}
