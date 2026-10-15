export const lineTotal = (line) => Math.round((Number(line.unitPrice) || 0) * (Number(line.qty) || 0));

export function exchangeTotals(returnTotal, lines) {
  const newTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);
  return { newTotal, difference: newTotal - returnTotal };
}

export function replacementItems(lines) {
  return lines.map((l) => {
    const total = lineTotal(l);
    return {
      name: l.name,
      catalogId: l.catalogId,
      unit: l.unit || 'unit',
      unitPrice: Math.round(Number(l.unitPrice) || 0),
      qty: Number(l.qty) || 0,
      rawTotal: total,
      lineDiscount: null,
      finalLineTotal: total,
    };
  });
}

export function netStockDeltas(returnedItems, lines) {
  const deltas = new Map();
  (returnedItems || []).forEach((i) => {
    if (i.catalogId) deltas.set(i.catalogId, (deltas.get(i.catalogId) || 0) + (Number(i.qty) || 0));
  });
  lines.forEach((l) => {
    if (l.catalogId) deltas.set(l.catalogId, (deltas.get(l.catalogId) || 0) - (Number(l.qty) || 0));
  });
  return deltas;
}

export function flooredStockChange(stock, delta) {
  if (typeof stock !== 'number' || !delta) return 0;
  return Math.max(delta, -Math.max(0, stock)) + 0;
}
