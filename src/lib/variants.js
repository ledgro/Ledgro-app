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
