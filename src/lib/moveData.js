// Move products from one shop to another through a file. The file never contains photos, bills or people.
export const PRODUCTS_FILE = 'ledgro-products';
export const MAX_IMPORT = 5000;

const clean = (v, n) => String(v ?? '').normalize('NFC').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const paise = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);

/** Same product = same name and same options (size, colour), ignoring capitalisation. */
export function itemKey(it) {
  const opts = Object.entries(it.options || {}).map(([k, v]) => `${clean(k, 40).toLowerCase()}=${clean(v, 40).toLowerCase()}`).sort().join('&');
  return `${clean(it.baseName || it.name, 100).toLowerCase()}|${opts}`;
}

export function buildProductsExport(items, { stock = false, cost = false } = {}) {
  const rows = items.filter((i) => i && i.name && i.isActive !== false && !i.deleted).map((i) => ({
    name: i.name,
    ...(i.groupId ? { groupId: i.groupId, baseName: i.baseName || i.name, options: i.options || {} } : {}),
    price: i.lastUsedPrice ?? 0,
    unit: i.unit || 'piece',
    category: i.category || '',
    description: i.description || '',
    source: i.source || '',
    lowStockAlert: i.lowStockAlert ?? null,
    ...(stock ? { stock: i.stockCount ?? null } : {}),
    ...(cost ? { cost: i.costPrice ?? null } : {}),
  }));
  return { app: PRODUCTS_FILE, version: 1, exportedAt: new Date().toISOString(), count: rows.length, items: rows };
}

/** Checks and cleans a file. Returns { items } or { error }. Nothing from the file is trusted. */
export function parseProductsExport(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'This is not a Ledgro products file.' }; }
  if (!data || data.app !== PRODUCTS_FILE || !Array.isArray(data.items)) return { error: 'This is not a Ledgro products file.' };
  if (data.items.length > MAX_IMPORT) return { error: `Too many products (limit ${MAX_IMPORT}).` };
  const items = [];
  for (const r of data.items) {
    if (!r || typeof r !== 'object') continue;
    const name = clean(r.name, 100);
    const price = paise(r.price);
    if (!name || price === null) continue;
    let options = null;
    if (r.groupId && r.options && typeof r.options === 'object' && !Array.isArray(r.options)) {
      const e = Object.entries(r.options).slice(0, 3).map(([k, v]) => [clean(k, 40), clean(v, 40)]).filter(([k, v]) => k && v);
      if (e.length) options = Object.fromEntries(e);
    }
    items.push({
      name, price, options,
      groupId: options ? clean(r.groupId, 40) : null,
      baseName: options ? clean(r.baseName || name, 100) : null,
      unit: clean(r.unit, 20) || 'piece',
      category: clean(r.category, 60),
      description: clean(r.description, 300),
      source: clean(r.source, 60),
      lowStockAlert: paise(r.lowStockAlert),
      stock: 'stock' in r ? paise(r.stock) : undefined,
      cost: 'cost' in r ? paise(r.cost) : undefined,
    });
  }
  return { items };
}

/** Splits the file's products into new ones and ones this shop already has. */
export function planImport(existing, incoming) {
  const have = new Map(existing.filter((i) => i && i.name && !i.deleted).map((i) => [itemKey(i), i]));
  const seen = new Set();
  const fresh = [];
  const dupes = [];
  for (const it of incoming) {
    const k = itemKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    if (have.has(k)) dupes.push({ incoming: it, existing: have.get(k) }); else fresh.push(it);
  }
  return { fresh, dupes };
}

/** Product document for a new product. groupIds are renewed so groups of two shops never mix. */
export function toPayload(it, { groupFor, uid, serverTimestamp }) {
  return {
    name: it.name,
    ...(it.options ? { baseName: it.baseName, groupId: groupFor(it.groupId), options: it.options } : {}),
    lastUsedPrice: it.price,
    unit: it.unit,
    category: it.category,
    description: it.description,
    source: it.source,
    lowStockAlert: it.lowStockAlert,
    stockCount: it.stock ?? null,
    costPrice: it.cost ?? null,
    isActive: true,
    hasImage: false,
    frequency: 0,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}
