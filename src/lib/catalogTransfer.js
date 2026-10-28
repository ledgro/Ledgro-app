import { variantName } from './variants';
import { imageKey } from './productImage';

// Move products between shops. CSV (opens in Excel, no photos) and a full backup (JSON, with photos).
// Pure helpers: no Firebase here, so they are easy to test.

export const MAX_IMPORT_ROWS = 500;
const HEADERS = ['Product', 'Category', 'Size', 'Colour', 'Other options', 'Price', 'Cost price', 'Stock', 'Unit', 'Low stock alert', 'Supplier', 'Description', 'Active'];
const AXIS_SIZE = /^sizes?$/i;
const AXIS_COLOUR = /^colou?rs?$/i;

const rupees = (paise) => (paise == null ? '' : String(Math.round(paise) / 100));
const num = (v) => {
  const t = String(v ?? '').replace(/[₹,\s]|rs\.?/gi, '');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`; // stop spreadsheet formulas
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV text (with a BOM so Excel reads it as UTF-8). Cost price is included: only the admin exports. */
export function buildCatalogCsv(items) {
  const rows = items.filter((i) => !i.deleted).map((i) => {
    const o = Object.entries(i.options || {});
    const size = o.find(([k]) => AXIS_SIZE.test(k.trim()));
    const colour = o.find(([k]) => AXIS_COLOUR.test(k.trim()));
    const other = o.filter(([k]) => k !== size?.[0] && k !== colour?.[0]).map(([k, v]) => `${k}=${v}`).join('; ');
    return [
      i.groupId ? (i.baseName || i.name) : i.name, i.category || '', size?.[1] || '', colour?.[1] || '', other,
      rupees(i.lastUsedPrice), rupees(i.costPrice), i.stockCount ?? '', i.unit || 'piece', i.lowStockAlert ?? '', i.source || '', i.description || '', i.isActive === false ? 'No' : 'Yes',
    ];
  });
  return `﻿${[HEADERS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

/** Full backup: every field plus the photos, to restore in another shop. */
export function buildCatalogBackup(items, images = {}) {
  const live = items.filter((i) => !i.deleted);
  const products = live.map((i) => ({
    name: i.name, baseName: i.baseName || null, groupId: i.groupId || null, options: i.options || null,
    category: i.category || '', price: i.lastUsedPrice ?? 0, cost: i.costPrice ?? null, stock: i.stockCount ?? null,
    unit: i.unit || 'piece', lowStockAlert: i.lowStockAlert ?? null, source: i.source || '', description: i.description || '', active: i.isActive !== false,
    image: i.hasImage ? (images[imageKey(i)] || null) : null,
  }));
  return JSON.stringify({ app: 'ledgro', kind: 'catalog', version: 1, exportedAt: new Date().toISOString(), products });
}

/** Small CSV reader: quotes, commas and line breaks inside quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const t = String(text).replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

const parseOther = (s) => Object.fromEntries(String(s || '').split(';').map((p) => p.split('=')).filter(([k, v]) => k?.trim() && v?.trim()).map(([k, v]) => [k.trim().slice(0, 20), v.trim().slice(0, 30)]));

/** Text of either format -> records. Throws a readable Error for a file that is not ours. */
export function parseCatalogFile(text) {
  const trimmed = String(text).trim();
  if (trimmed.startsWith('{')) {
    let data;
    try { data = JSON.parse(trimmed); } catch { throw new Error('This file is damaged.'); }
    if (data?.app !== 'ledgro' || !Array.isArray(data.products)) throw new Error('This is not a Ledgro product file.');
    return data.products.map((p, n) => ({
      line: n + 1, name: p.baseName && p.groupId ? p.baseName : p.name, groupRef: p.groupId || null, options: p.options || null,
      category: p.category || '', price: Number(p.price), cost: p.cost == null ? null : Number(p.cost), stock: p.stock == null ? null : Number(p.stock),
      unit: p.unit || 'piece', lowStockAlert: p.lowStockAlert == null ? null : Number(p.lowStockAlert), source: p.source || '', description: p.description || '',
      active: p.active !== false, image: typeof p.image === 'string' && p.image.startsWith('data:image/jpeg;base64,') && p.image.length <= 70000 ? p.image : null,
    }));
  }
  const rows = parseCsv(trimmed);
  if (rows.length < 2) throw new Error('No products found in this file.');
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const ix = { name: col('product', 'name', 'product name', 'item'), cat: col('category'), size: col('size'), colour: col('colour', 'color'), other: col('other options', 'options'), price: col('price', 'selling price', 'mrp'), cost: col('cost price', 'cost'), stock: col('stock', 'quantity', 'qty'), unit: col('unit'), low: col('low stock alert', 'low stock'), source: col('supplier', 'source'), desc: col('description'), active: col('active') };
  if (ix.name < 0 || ix.price < 0) throw new Error('The file needs "Product" and "Price" columns.');
  const get = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
  return rows.slice(1).map((r, n) => {
    const options = {};
    if (get(r, ix.size)) options.Size = get(r, ix.size).slice(0, 30);
    if (get(r, ix.colour)) options.Colour = get(r, ix.colour).slice(0, 30);
    Object.assign(options, parseOther(get(r, ix.other)));
    const name = get(r, ix.name);
    const has = Object.keys(options).length > 0;
    return {
      line: n + 2, name, groupRef: has ? `csv:${name.toLowerCase()}` : null, options: has ? options : null,
      category: get(r, ix.cat), price: num(get(r, ix.price)), cost: num(get(r, ix.cost)), stock: num(get(r, ix.stock)), unit: get(r, ix.unit) || 'piece',
      lowStockAlert: num(get(r, ix.low)), source: get(r, ix.source), description: get(r, ix.desc), active: !/^(no|false|0|n)$/i.test(get(r, ix.active)), image: null,
      csvRupees: true,
    };
  });
}

/**
 * Decide what to create. Never overwrites: a product (or size/colour) that already exists is skipped.
 * existing = this shop's catalog items. newId() makes a group id.
 * Returns { creates: [{ payload, image }], skipped, errors: [{ line, message }] }.
 */
export function planImport(records, existing, newId) {
  const errors = [];
  let skipped = 0;
  const creates = [];
  if (records.length > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS} rows at a time.`);
  const names = new Set(existing.filter((i) => !i.deleted).map((i) => String(i.name || '').toLowerCase()));
  const groups = new Map(); // groupRef -> groupId
  existing.forEach((i) => { if (i.groupId && i.baseName) groups.set(`csv:${String(i.baseName).toLowerCase()}`, i.groupId); });

  records.forEach((r) => {
    const bad = (m) => errors.push({ line: r.line, message: m });
    const base = String(r.name || '').replace(/\s+/g, ' ').trim();
    if (!base) return bad('Missing product name');
    if (base.length > 90) return bad('Name is too long');
    const price = r.csvRupees ? r.price : r.price / 100; // records hold rupees (CSV) or paise (backup)
    if (price == null || Number.isNaN(price) || price < 0) return bad('Price is not a number');
    for (const [label, v] of [['Stock', r.stock], ['Low stock alert', r.lowStockAlert], ['Cost price', r.csvRupees ? r.cost : (r.cost == null ? null : r.cost / 100)]]) {
      if (v != null && (Number.isNaN(v) || v < 0)) return bad(`${label} is not a valid number`);
    }
    const opts = r.options && Object.keys(r.options).length ? r.options : null;
    if (opts && Object.keys(opts).length > 3) return bad('At most 3 options per product');
    const name = opts ? variantName(base, opts) : base;
    if (names.has(name.toLowerCase())) { skipped += 1; return; }
    names.add(name.toLowerCase());

    const payload = {
      name, lastUsedPrice: Math.round(price * 100), unit: String(r.unit || 'piece').slice(0, 20), stockCount: r.stock == null ? null : r.stock,
      lowStockAlert: r.lowStockAlert == null ? null : r.lowStockAlert, category: String(r.category || '').trim().slice(0, 40), description: String(r.description || '').slice(0, 500),
      source: String(r.source || '').slice(0, 60), costPrice: r.cost == null ? null : Math.round((r.csvRupees ? r.cost : r.cost / 100) * 100), isActive: r.active !== false, frequency: 0,
    };
    if (opts) {
      const key = r.groupRef || `csv:${base.toLowerCase()}`;
      const ref = r.groupRef && !r.groupRef.startsWith('csv:') ? `bk:${r.groupRef}` : `csv:${base.toLowerCase()}`;
      if (!groups.has(ref)) groups.set(ref, newId());
      payload.groupId = groups.get(ref);
      payload.baseName = base;
      payload.options = opts;
      void key;
    }
    if (r.image) payload.hasImage = true;
    creates.push({ payload, image: r.image || null });
  });
  return { creates, skipped, errors };
}
