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
    if (e.kind === 'payout' && e.via === 'cash') return sum + a; // a wage paid from the drawer
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

/** Document id for a person's salary record: the name in lower case, letters and digits only. */
export const personId = (name) => cleanStaff(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'staff';

const atOf = (e) => (e.createdAt?.toDate ? e.createdAt.toDate() : e.createdAt instanceof Date ? e.createdAt : null);

/** Loans are cleared oldest first as money comes back (cash, or cut from salary). Returns id -> { closed, left }. */
export function loanStatus(entries) {
  const loans = (entries || []).filter((e) => e.kind === 'advance' || e.kind === 'debt')
    .sort((a, b) => (atOf(a)?.getTime() || 0) - (atOf(b)?.getTime() || 0));
  let back = (entries || []).filter((e) => e.kind === 'repay').reduce((n, e) => n + (Number(e.amount) || 0), 0);
  const out = new Map();
  loans.forEach((l) => {
    const amt = Number(l.amount) || 0;
    const used = Math.min(back, amt);
    back -= used;
    out.set(l.id, { closed: used >= amt, left: amt - used });
  });
  return out;
}

/** Time of the last settle-up for a person, or null. */
export function lastClose(entries) {
  let t = null;
  (entries || []).forEach((e) => { if (e.kind === 'close') { const at = atOf(e); if (at && (!t || at > t)) t = at; } });
  return t;
}

/** Since the last settle-up: days worked, wage earned, wage paid, cut for loans, and what is still due. */
export function periodSummary(entries) {
  const since = lastClose(entries);
  let days = 0; let earned = 0; let paid = 0; let cut = 0; let todayMarked = false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  (entries || []).forEach((e) => {
    const at = atOf(e);
    if (e.kind === 'work' && at && at >= today && !(since && at <= since)) todayMarked = true;
    if (since && at && at <= since) return;
    if (e.kind === 'work') { days += Number(e.units) || 0; earned += Number(e.amount) || 0; }
    else if (e.kind === 'payout') paid += Number(e.amount) || 0;
    else if (e.kind === 'repay' && (e.via || 'cash') === 'salary') cut += Number(e.amount) || 0;
  });
  const owed = loanTotals(entries);
  return { days, earned, paid, cut, due: Math.max(0, earned - paid - cut), owed, since, todayMarked };
}

/** What the person still owes the shop for loans and advances. */
export function loanTotals(entries) {
  return (entries || []).reduce((n, e) => {
    const a = Number(e.amount) || 0;
    if (e.kind === 'advance' || e.kind === 'debt') return n + a;
    if (e.kind === 'repay') return n - a;
    return n;
  }, 0);
}

/** Entries newest first, grouped by month: [{ label, items }]. */
export function groupByMonth(entries) {
  const sorted = [...(entries || [])].sort((a, b) => (atOf(b)?.getTime() || 0) - (atOf(a)?.getTime() || 0));
  const groups = [];
  sorted.forEach((e) => {
    const d = atOf(e) || new Date();
    const label = d.toLocaleString([], { month: 'long', year: 'numeric' });
    if (!groups.length || groups[groups.length - 1].label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(e);
  });
  return groups;
}
