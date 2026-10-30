// Cash staff take from the drawer. advance = to be deducted from salary, debt = a loan, repay = money back.
// A repayment "via salary" changes what they owe but never touches the drawer.

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export const cleanStaff = (s) => norm(s).slice(0, 40);

/** Net cash that left the drawer for these entries (negative: more came back than went out). */
export function staffCashNet(entries) {
  return (entries || []).reduce((sum, e) => {
    const a = Number(e.amount) || 0;
    if (e.kind === 'advance' || e.kind === 'debt') return sum + a;
    if (e.kind === 'repay' && (e.via || 'cash') === 'cash') return sum - a;
    return sum;
  }, 0);
}

/** Per person: what they still owe, split by kind, plus what they took since `monthStart`. Largest balance first. */
export function staffBalances(entries, monthStart = null) {
  const map = new Map();
  (entries || []).forEach((e) => {
    const name = cleanStaff(e.staff);
    if (!name) return;
    const key = name.toLowerCase();
    if (!map.has(key)) map.set(key, { key, name, advance: 0, debt: 0, repaid: 0, thisMonth: 0, entries: [] });
    const p = map.get(key);
    const a = Number(e.amount) || 0;
    if (e.kind === 'advance') p.advance += a;
    else if (e.kind === 'debt') p.debt += a;
    else if (e.kind === 'repay') p.repaid += a;
    const at = e.createdAt?.toDate ? e.createdAt.toDate() : e.createdAt;
    if (monthStart && at && at >= monthStart && (e.kind === 'advance' || e.kind === 'debt')) p.thisMonth += a;
    p.entries.push(e);
  });
  return [...map.values()]
    .map((p) => ({ ...p, owed: p.advance + p.debt - p.repaid }))
    .sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name));
}
