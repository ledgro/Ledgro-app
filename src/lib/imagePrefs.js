// What the shared product pictures show. Kept on this device; defaults when storage is blocked.
const KEY = 'ledgro.imagePrefs';
export const DEFAULT_IMAGE_PREFS = { prices: true, sizes: true, stock: false };

export function loadImagePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_IMAGE_PREFS };
    return { prices: raw.prices !== false, sizes: raw.sizes !== false, stock: raw.stock === true };
  } catch { return { ...DEFAULT_IMAGE_PREFS }; }
}

export function saveImagePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify({ prices: !!p.prices, sizes: !!p.sizes, stock: !!p.stock })); } catch { /* ignore */ }
}

/** Options handed to the picture maker. Sold-out sizes are always hidden and products without a photo always skipped. */
export const toRenderOptions = (p) => ({ photos: true, prices: !!p.prices, sizes: !!p.sizes, stock: !!p.stock, hideSoldOut: true, skipNoPhoto: true });

/** The one line under the Send button, e.g. "Price and sizes shown". */
export function describePrefs(p) {
  const parts = [];
  if (p.prices) parts.push('Price');
  if (p.sizes) parts.push('sizes');
  if (p.stock) parts.push('stock numbers');
  if (!parts.length) return 'Name and photo only';
  const text = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `${text[0].toUpperCase()}${text.slice(1)} shown`;
}
