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

const COLOUR_AXIS = /^colou?rs?$/i;

/** The colour value of a variant ('' when the product has no colour option). */
export function colourOf(item) {
  const hit = Object.entries(item?.options || {}).find(([k]) => COLOUR_AXIS.test(k.trim()));
  return hit ? clean(hit[1]) : '';
}

/** The variant's label without its colour, e.g. "38" for Size 38 / Black. Falls back to the full label. */
export function sizeLabelOf(item) {
  const rest = Object.entries(item?.options || {}).filter(([k]) => !COLOUR_AXIS.test(k.trim())).map(([, v]) => v);
  return rest.length ? rest.join(' / ') : variantLabel(item?.options);
}

/**
 * Folds the flat catalog into one entry per product.
 * Plain products stay single. Variants of one product become a group with a section per colour.
 */
export function groupProducts(items) {
  const out = [];
  const groups = new Map();
  items.forEach((it) => {
    if (!isVariant(it)) { out.push({ type: 'single', key: it.id, item: it }); return; }
    let g = groups.get(it.groupId);
    if (!g) {
      g = { type: 'group', key: it.groupId, groupId: it.groupId, name: it.baseName || it.name, items: [], colours: new Map() };
      groups.set(it.groupId, g);
      out.push(g);
    }
    g.items.push(it);
    const c = colourOf(it);
    if (!g.colours.has(c)) g.colours.set(c, []);
    g.colours.get(c).push(it);
  });
  return out.map((e) => (e.type === 'group'
    ? { ...e, colours: [...e.colours.entries()].map(([colour, list]) => ({ colour, items: list, rep: list.find((i) => i.hasImage) || list[0] })) }
    : e));
}
