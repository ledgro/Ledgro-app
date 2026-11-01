import { subDays } from 'date-fns';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { readStatsRange } from './dayStats';
import { dayKey, bizDate, bizDayStart, emptyStats } from './statsMath';
import { staffCashNet } from './staffCash';

export { isCashAdjustment, signedBillTotal } from './statsMath';

/** Dashboard numbers from stored day totals: at most 7 reads, however many bills exist. */
export async function computeDailyAggregations(shopId) {
  if (!shopId) return null;

  const today = bizDate();
  const keys = [];
  for (let i = 6; i >= 0; i--) keys.push(dayKey(subDays(today, i)));
  const stats = await readStatsRange(shopId, keys[0], keys[6]);
  const get = (k) => stats.get(k) || emptyStats();

  const t = get(keys[6]);
  const y = get(keys[5]);
  const todayNet = t.rev - t.exp;
  const yestNet = y.rev - y.exp;

  let percentDiff = 0;
  if (yestNet !== 0) percentDiff = ((todayNet - yestNet) / Math.abs(yestNet)) * 100;
  else if (todayNet > 0) percentDiff = 100;

  // Cash staff took from (or paid back into) the drawer today.
  let staffNet = 0;
  let staffCashFailed = false;
  try {
    const start = bizDayStart(today);
    const end = new Date(start.getTime()); end.setDate(end.getDate() + 1);
    const snap = await getDocs(query(collection(db, `shops/${shopId}/staffCash`), where('createdAt', '>=', start), where('createdAt', '<', end), orderBy('createdAt'), limit(100)));
    staffNet = staffCashNet(snap.docs.map((d) => d.data()));
  } catch (err) { console.warn('Staff cash not loaded', err); staffCashFailed = true; }

  const todayCash = t.cash + t.splitCash;
  const todayUpi = t.upi + t.splitUpi;

  return {
    expectedCash: todayCash - t.expCash - staffNet,
    staffCashNet: staffNet,
    staffCashFailed, // true: expected cash is missing the staff-cash entries, so it must not be trusted
    upiInBank: todayUpi,
    netEarnings: todayNet,
    vsYesterday: percentDiff,
    cashSplit: todayCash,
    upiSplit: todayUpi,
    weekData: keys.map((k) => get(k).rev - get(k).exp),
  };
}
