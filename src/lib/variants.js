export const MAX_AXES = 3;
export const MAX_COMBOS = 20;
export const MAX_VALUES_PER_AXIS = 20;
const SEP = ' - ';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function parseValues(text) {
  const seen = new Set();
  const out = [];
  String(text ?? '').split(/[,\n]/).forEach((raw) => {
    const v = clean(raw).slice(0, 30);
    const key = v.toLowerCase();
    if (v && !seen.has(key) && out.length < MAX_VALUES_PER_AXIS) {
      seen.add(key);
      out.push(v);
    }
  });
  return out;
}

export function buildCombos(axes) {
  const usable = (axes || [])
    .slice(0, MAX_AXES)
    .map((a) => ({ name: clean(a.name).slice(0, 20), values: parseValues(a.values) }))
    .filter((a) => a.name && a.values.length);
  const names = new Set();
  for (const a of usable) {
    const k = a.name.toLowerCase();
    if (names.has(k)) return [];
    names.add(k);
  }
  if (!usable.length) return [];
  return usable.reduce(
    (acc, axis) => acc.flatMap((opts) => axis.values.map((v) => ({ ...opts, [axis.name]: v }))),
    [{}]
  );
}

export const variantLabel = (options) => Object.values(options || {}).join(' / ');

export const comboKey = (options) => JSON.stringify(Object.entries(options || {}));

export function variantName(baseName, options) {
  const label = variantLabel(options);
  const base = clean(baseName);
  return (label ? `${base}${SEP}${label}` : base).slice(0, 100);
}

export const isVariant = (item) => !!(item && item.groupId);

/** An existing product group with this name (any capitalisation), so a second "Hells" joins the first. */
export function findGroupByName(items, baseName) {
  const key = clean(baseName).normalize('NFC').toLowerCase();
  if (!key) return null;
  const hit = (items || []).find((i) => i.groupId && i.isActive !== false && clean(i.baseName).normalize('NFC').toLowerCase() === key);
  return hit ? { groupId: hit.groupId, baseName: hit.baseName } : null;
}

const COLOUR_AXIS = /^colou?rs?$/i;

/** The colour value of a variant ('' when the product has no colour option). */
export function colourOf(item) {
  const hit = Object.entries(item?.options || {}).find(([k]) => COLOUR_AXIS.test(k.trim()));
  return hit ? clean(hit[1]) : '';
}

/** Case-insensitive identity of a colour: "black", "Black " and "BLACK" are the same colour. */
export function colourKey(item) {
  return colourOf(item).normalize('NFC').toLowerCase();
}

/** Display form of a colour: first letter of each word upper-case ("dark BROWN" -> "Dark Brown"). */
export function colourLabel(text) {
  return clean(text).split(' ').map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)).join(' ');
}

const bySize = (a, b) => String(sizeLabelOf(a)).localeCompare(String(sizeLabelOf(b)), undefined, { numeric: true });

/** The variant's label without its colour, e.g. "38" for Size 38 / Black. Falls back to the full label. */
export function sizeLabelOf(item) {
  const rest = Object.entries(item?.options || {}).filter(([k]) => !COLOUR_AXIS.test(k.trim())).map(([, v]) => v);
  return rest.length ? rest.join(' / ') : variantLabel(item?.options);
}

/** Group raw catalog products by groupId. Returns [{ type: 'single' | 'group', ... }] */
export function groupProducts(items) {
  const out = [];
  const map = new Map();
  (items || []).forEach((it) => {
    if (it.isActive === false) return;
    if (!it.groupId) {
      out.push({ type: 'single', item: it });
      return;
    }
    let g = map.get(it.groupId);
    if (!g) {
      g = { type: 'group', groupId: it.groupId, baseName: it.baseName || it.name, items: [], colours: new Map() };
      map.set(it.groupId, g);
      out.push(g);
    }
    g.items.push(it);
    const c = colourKey(it);
    if (!g.colours.has(c)) g.colours.set(c, []);
    g.colours.get(c).push(it);
  });
  return out.map((e) => (e.type === 'group'
    ? {
      ...e,
      colours: [...e.colours.values()].map((list) => {
        const sorted = [...list].sort(bySize);
        return { colour: colourLabel(colourOf(sorted[0])), items: sorted, rep: sorted.find((i) => i.hasImage) || sorted[0] };
      }),
    }
    : e));
}
