import { variantName, parseValues, colourLabel, colourKey } from './variants';

// Editing one product in one colour as a whole: shared details, the colour name and its sizes.
// Pure planning only (no Firebase): the sheet turns the plan into writes.

const COLOUR_AXIS = /^colou?rs?$/i;
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const num = (t) => (String(t ?? '').trim() === '' ? null : Number(t));

/** Axis names of a colour card: which option is the colour and which is the size. */
export function axesOf(items) {
  const keys = [];
  items.forEach((i) => Object.keys(i.options || {}).forEach((k) => { if (!keys.includes(k)) keys.push(k); }));
  return { colourAxis: keys.find((k) => COLOUR_AXIS.test(k.trim())) || null, sizeAxis: keys.find((k) => !COLOUR_AXIS.test(k.trim())) || null };
}

/**
 * form: { base, colour, price, cost, category, lowStock, active, rows: [{ id, stock, remove }], newSizes }
 * Returns { error } or { updates: [{ id, data, stockDiff, stockSet }], creates: [data], removes: [id], colourChanged }.
 */
export function planColourEdit({ entry, groupItems, allItems, form }) {
  const found = axesOf(entry.items);
  const sizeAxis = found.sizeAxis;
  const colourAxis = found.colourAxis;
  const base = clean(form.base).slice(0, 90);
  if (!base) return { error: 'Enter the product name.' };
  const price = Number(form.price);
  if (form.price === '' || !Number.isFinite(price) || price < 0) return { error: 'Enter a valid price.' };
  const cost = num(form.cost);
  if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return { error: 'Enter a valid cost price.' };
  const low = num(form.lowStock);
  if (low !== null && (!Number.isFinite(low) || low < 0)) return { error: 'Enter a valid low stock alert.' };

  const oldColour = entry.colour;
  // A product saved without a colour can get one later: the option is added to each of its sizes.
  const typedColour = colourLabel(clean(form.colour).slice(0, 30));
  const colourName = colourAxis || (typedColour ? 'Colour' : null);
  let colour = oldColour;
  if (colourName) {
    colour = typedColour;
    if (colourAxis && !colour) return { error: 'Enter the colour.' };
    if (!colourAxis && entry.items.some((i) => Object.keys(i.options || {}).length >= 3)) return { error: 'This product already has 3 options, so a colour cannot be added.' };
  }
  const colourChanged = colour.toLowerCase() !== oldColour.toLowerCase();
  // Moving sizes into a colour the product already has joins them (same-size clashes are caught by the name check below).
  const merged = colourChanged && !!colour && groupItems.some((i) => !entry.items.some((e) => e.id === i.id) && colourKey(i) === colour.normalize('NFC').toLowerCase());

  const rowById = new Map(form.rows.map((r) => [r.id, r]));
  const kept = entry.items.filter((i) => !rowById.get(i.id)?.remove);
  const removes = entry.items.filter((i) => rowById.get(i.id)?.remove).map((i) => i.id);

  const common = {
    lastUsedPrice: Math.round(price * 100), costPrice: cost === null ? null : Math.round(cost * 100),
    category: clean(form.category).slice(0, 40), lowStockAlert: low, isActive: form.active !== false,
  };
  const optionsFor = (item, sizeLabel) => {
    const o = { ...(item.options || {}) };
    if (colourName) o[colourName] = colour;
    if (sizeAxis && sizeLabel != null) o[sizeAxis] = sizeLabel;
    return o;
  };

  const taken = new Set(allItems.filter((i) => !i.deleted && !entry.items.some((e) => e.id === i.id)).map((i) => String(i.name || '').toLowerCase()));
  const updates = [];
  for (const item of kept) {
    const row = rowById.get(item.id) || {};
    const options = optionsFor(item);
    const name = variantName(base, options);
    if (taken.has(name.toLowerCase())) return { error: `"${name}" already exists.` };
    taken.add(name.toLowerCase());
    const data = { ...common, name, baseName: base, options };
    const raw = row.stock;
    const stock = num(raw);
    let stockDiff = null; let stockSet;
    if (raw !== undefined && stock !== null && (!Number.isFinite(stock) || stock < 0)) return { error: `Enter a valid stock for ${name}.` };
    if (raw !== undefined) {
      if (stock === null) { if (item.stockCount != null) stockSet = null; }
      else if (item.stockCount == null) stockSet = stock;
      else if (stock !== item.stockCount) stockDiff = stock - item.stockCount;
    }
    updates.push({ id: item.id, data, stockDiff, stockSet, stockAfter: stockSet !== undefined ? stockSet : stockDiff !== null ? stock : item.stockCount });
  }

  // other colours of the product follow a renamed product
  if (base !== clean(entry.name)) {
    groupItems.filter((i) => !entry.items.some((e) => e.id === i.id)).forEach((i) => {
      const name = variantName(base, i.options);
      updates.push({ id: i.id, data: { baseName: base, name }, stockDiff: null, stockAfter: i.stockCount });
    });
  }

  const creates = [];
  const typed = parseValues(form.newSizes);
  if (typed.length) {
    if (!sizeAxis) return { error: 'This product has no size option to add to.' };
    const have = new Set(kept.map((i) => String(i.options?.[sizeAxis] ?? '').toLowerCase()));
    const rep = entry.rep;
    for (const label of typed) {
      if (have.has(label.toLowerCase())) continue;
      const options = optionsFor(rep, label);
      const name = variantName(base, options);
      if (taken.has(name.toLowerCase())) return { error: `"${name}" already exists.` };
      taken.add(name.toLowerCase());
      creates.push({ ...common, name, baseName: base, options, groupId: rep.groupId, unit: rep.unit || 'piece', source: rep.source || '', description: rep.description || '', stockCount: null, hasImage: entry.items.some((i) => i.hasImage), frequency: 0 });
    }
    if (kept.length + creates.length > 20) return { error: 'Up to 20 sizes per colour.' };
  }
  if (!kept.length && !creates.length) return { error: 'A colour needs at least one size. Remove the whole product from the list instead.' };
  return { updates, creates, removes, colourChanged, merged, colour };
}
