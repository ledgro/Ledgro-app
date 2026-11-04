import { colourOf, colourLabel, sizeLabelOf } from './variants';

// Pure report maths over bills already loaded. Money is in paise. Only live sales count as sales:
// a voided sale becomes type 'reversal', and returns are their own negative bills.
const isSale = (b) => (b.type || 'sale') === 'sale';
const isReturn = (b) => b.type === 'return';
const lineQty = (i) => Number(i.qty) || 0;
const lineMoney = (i) => Number(i.finalLineTotal ?? i.lineTotal ?? i.rawTotal) || 0;

/** The bill's time as a Date (Firestore Timestamp, Date, or ms). */
export function billDate(b) {
  const t = b.createdAt;
  if (t?.toDate) return t.toDate();
  if (t instanceof Date) return t;
  if (typeof t === 'number') return new Date(t);
  return b.clientCreatedAt ? new Date(b.clientCreatedAt) : null;
}

export function summarize(bills) {
  const sales = bills.filter(isSale);
  const returns = bills.filter(isReturn);
  const revenue = sales.reduce((s, b) => s + (Number(b.grandTotal) || 0), 0);
  const units = sales.reduce((s, b) => s + (b.items || []).reduce((a, i) => a + lineQty(i), 0), 0);
  const returned = returns.reduce((s, b) => s - (Number(b.grandTotal) || 0), 0);
  return {
    bills: sales.length,
    revenue,
    avgBill: sales.length ? Math.round(revenue / sales.length) : 0,
    unitsPerBill: sales.length ? units / sales.length : 0,
    returned,
    returnRate: revenue > 0 ? returned / revenue : 0,
  };
}

const baseOf = (name) => String(name || 'Item').split(' - ')[0].trim() || 'Item';

/**
 * Best sellers grouped by product, colour or size.
 * `catalog` is the shop's product list (to know each line's colour and size); lines without a match fall back to their name.
 */
export function rankItems(bills, catalog, by = 'product', top = 15) {
  const byId = new Map((catalog || []).filter((c) => c.id).map((c) => [c.id, c]));
  const rows = new Map();
  bills.filter(isSale).forEach((b) => (b.items || []).forEach((i) => {
    const c = byId.get(i.catalogId);
    let label;
    if (by === 'colour') label = c ? colourLabel(colourOf(c)) : '';
    else if (by === 'size') label = c?.options ? String(sizeLabelOf(c)) : '';
    else label = c?.baseName || baseOf(c?.name || i.name);
    if (!label) return;
    const row = rows.get(label) || { label, qty: 0, revenue: 0 };
    row.qty += lineQty(i);
    row.revenue += lineMoney(i);
    rows.set(label, row);
  }));
  return [...rows.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, top);
}

/** Sales by weekday (0 = Sunday) and by hour of day, using the phone's local time. */
export function busyTimes(bills) {
  const weekday = Array.from({ length: 7 }, () => ({ bills: 0, revenue: 0 }));
  const hour = Array.from({ length: 24 }, () => ({ bills: 0, revenue: 0 }));
  bills.filter(isSale).forEach((b) => {
    const d = billDate(b);
    if (!d) return;
    const money = Number(b.grandTotal) || 0;
    weekday[d.getDay()].bills += 1; weekday[d.getDay()].revenue += money;
    hour[d.getHours()].bills += 1; hour[d.getHours()].revenue += money;
  });
  return { weekday, hour };
}

/** Products that were returned, with how many sold in the same period. Often points to a sizing or fit problem. */
export function returnsByProduct(bills, top = 15) {
  const sold = new Map();
  bills.filter(isSale).forEach((b) => (b.items || []).forEach((i) => {
    const k = baseOf(i.name); sold.set(k, (sold.get(k) || 0) + lineQty(i));
  }));
  const back = new Map();
  bills.filter(isReturn).forEach((b) => (b.items || []).forEach((i) => {
    const k = baseOf(i.name);
    const row = back.get(k) || { label: k, qty: 0, money: 0 };
    row.qty += lineQty(i); row.money += Math.abs(Number(i.lineTotal ?? i.finalLineTotal) || 0);
    back.set(k, row);
  }));
  return [...back.values()]
    .map((r) => ({ ...r, sold: sold.get(r.label) || 0, rate: sold.get(r.label) ? r.qty / sold.get(r.label) : 0 }))
    .sort((a, b) => b.qty - a.qty).slice(0, top);
}

/** Products with stock on the shelf that did not sell at all in the period (stock is only known for tracked items). */
export function deadStock(catalog, bills, top = 30) {
  const sold = new Set();
  bills.filter(isSale).forEach((b) => (b.items || []).forEach((i) => { if (i.catalogId) sold.add(i.catalogId); }));
  return (catalog || [])
    .filter((c) => c.id && c.isActive !== false && !c.deleted && typeof c.stockCount === 'number' && c.stockCount > 0 && !sold.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, stock: c.stockCount, value: c.stockCount * (Number(c.lastUsedPrice) || 0) }))
    .sort((a, b) => b.value - a.value).slice(0, top);
}
