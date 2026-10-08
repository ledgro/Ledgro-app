import { subDays } from 'date-fns';
import { readStatsRange } from './dayStats';
import { dayKey, emptyStats } from './statsMath';

export { isCashAdjustment, signedBillTotal } from './statsMath';

/** Dashboard numbers from stored day totals: at most 7 reads, however many bills exist. */
export async function computeDailyAggregations(shopId) {
  if (!shopId) return null;

  const today = new Date();
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

  const todayCash = t.cash + t.splitCash;
  const todayUpi = t.upi + t.splitUpi;

  return {
    expectedCash: todayCash - t.expCash,
    upiInBank: todayUpi,
    netEarnings: todayNet,
    vsYesterday: percentDiff,
    cashSplit: todayCash,
    upiSplit: todayUpi,
    weekData: keys.map((k) => get(k).rev - get(k).exp),
  };
}
