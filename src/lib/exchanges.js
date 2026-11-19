// An exchange is saved as two bills: a return (credit note) and a new sale. Both carry the same exchangeId
// (older data only has exchangeOf = the original bill's id, so it is paired by nearest time instead).
// foldExchanges marks each exchange sale with its return and flags the return as "folded" (shown inside the sale's row).

const isSale = (b) => !b.type || b.type === 'sale';
const keyOf = (b) => b.exchangeId || b.exchangeOf || '';
const ms = (b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : b.createdAt instanceof Date ? b.createdAt.getTime() : Number(b.clientCreatedAt ? new Date(b.clientCreatedAt).getTime() : 0) || 0);

export function foldExchanges(bills) {
  const returnsByKey = new Map();
  bills.forEach((b) => {
    if (b.type === 'return' && keyOf(b)) {
      const k = keyOf(b);
      if (!returnsByKey.has(k)) returnsByKey.set(k, []);
      returnsByKey.get(k).push(b);
    }
  });
  const pairOfSale = new Map(); // sale id -> return bill
  const used = new Set();
  bills
    .filter((b) => isSale(b) && keyOf(b))
    .sort((a, b) => ms(a) - ms(b))
    .forEach((sale) => {
      const k = keyOf(sale);
      const free = (returnsByKey.get(k) || []).filter((r) => !used.has(r.id));
      const exact = sale.exchangeId ? free.find((r) => r.exchangeId === sale.exchangeId) : null;
      const pick = exact || free.sort((a, b) => Math.abs(ms(a) - ms(sale)) - Math.abs(ms(b) - ms(sale)))[0];
      if (pick) { used.add(pick.id); pairOfSale.set(sale.id, pick); }
    });
  return bills.map((b) => ({
    ...b,
    exchangeReturn: pairOfSale.get(b.id),
    folded: used.has(b.id),
  }));
}
