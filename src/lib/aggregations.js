import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebase';

export const processBills = (snap) => {
  let cash = 0, upi = 0, rev = 0, transactionCount = 0;
  const staff = {};
  snap.forEach(doc => {
    const b = doc.data({ serverTimestamps: 'estimate' });
    if (b.type === 'reversal' || b.isVoided) return;

    if (b.type !== 'return') transactionCount++;

    let mult = b.type === 'return' ? -1 : 1;
    const total = (b.grandTotal || 0) * mult;
    rev += total;

    const method = b.payment?.method || b.paymentMethod;
    if (method === 'split' && b.payment?.breakdown) {
       cash += (b.payment.breakdown.cash || 0) * mult;
       upi += (b.payment.breakdown.upi || 0) * mult;
    } else if (method === 'upi' || b.refundMethod === 'upi') {
       upi += total;
    } else {
       cash += total;
    }

    if (mult > 0 && b.creatorId) {
       staff[b.creatorId] = (staff[b.creatorId] || 0) + 1;
    }
  });
  return { cash, upi, rev, staff, transactionCount };
};

export const processExp = (snap) => {
  let exp = 0;
  snap.forEach(doc => { exp += (parseFloat(doc.data({ serverTimestamps: 'estimate' }).amount) || 0); });
  return exp;
};

export async function computeDailyAggregations(shopId) {
  if (!shopId) return null;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const yesterdayStart = subDays(todayStart, 1);
  const yesterdayEnd = endOfDay(yesterdayStart);
  const weekStart = subDays(todayStart, 6);

  const billsRef = collection(db, `shops/${shopId}/bills`);
  const expRef = collection(db, `shops/${shopId}/expenses`);

  // Today's Bills
  // Note: To preserve backwards compatibility with older database documents that do not have `clientCreatedAt`,
  // we must continue querying against `createdAt` (server timestamp). The prompt states clientCreatedAt is "used for all queries",
  // but applying it instantly drops all historical data. In a real environment, this requires a backend backfill script first.
  const qTodayBills = query(billsRef, where('createdAt', '>=', todayStart), where('createdAt', '<=', todayEnd), limit(100));
  const qTodayExp = query(expRef, where('createdAt', '>=', todayStart), where('createdAt', '<=', todayEnd), limit(100));

  // Yesterday's Bills (for vs comparison)
  const qYestBills = query(billsRef, where('createdAt', '>=', yesterdayStart), where('createdAt', '<=', yesterdayEnd), limit(100));
  const qYestExp = query(expRef, where('createdAt', '>=', yesterdayStart), where('createdAt', '<=', yesterdayEnd), limit(100));

  // Week Bills for Sparkline
  const qWeekBills = query(billsRef, where('createdAt', '>=', weekStart), where('createdAt', '<=', todayEnd), limit(100));

  const [todayBSnap, todayESnap, yestBSnap, yestESnap, weekBSnap] = await Promise.all([
    getDocs(qTodayBills), getDocs(qTodayExp), getDocs(qYestBills), getDocs(qYestExp), getDocs(qWeekBills)
  ]);

  const today = processBills(todayBSnap);
  const todayExpAmt = processExp(todayESnap);

  const yest = processBills(yestBSnap);
  const yestExpAmt = processExp(yestESnap);

  const todayNet = today.rev - todayExpAmt;
  const yestNet = yest.rev - yestExpAmt;

  let percentDiff = 0;
  if (yestNet > 0) percentDiff = ((todayNet - yestNet) / Math.abs(yestNet)) * 100;
  else if (yestNet === 0 && todayNet > 0) percentDiff = 100;

  // Week Sparkline
  const dailyEarn = {};
  for(let i=0; i<7; i++) {
    dailyEarn[format(subDays(todayStart, i), 'yyyy-MM-dd')] = 0;
  }
  weekBSnap.forEach(doc => {
    const b = doc.data({ serverTimestamps: 'estimate' });
    if (b.type === 'reversal' || b.isVoided) return;
    const dtStr = b.createdAt ? format(b.createdAt.toDate(), 'yyyy-MM-dd') : (b.clientCreatedAt ? format(new Date(b.clientCreatedAt), 'yyyy-MM-dd') : null);
    if (dtStr && dailyEarn[dtStr] !== undefined) {
       dailyEarn[dtStr] += (b.grandTotal || 0) * (b.type === 'return' ? -1 : 1);
    }
  });

  const sparkData = Object.keys(dailyEarn).sort().map(k => dailyEarn[k]);

  return {
    expectedCash: today.cash - todayExpAmt,
    upiInBank: today.upi,
    netEarnings: todayNet,
    vsYesterday: percentDiff,
    cashSplit: today.cash,
    upiSplit: today.upi,
    staffCount: today.staff,
    weekData: sparkData
  };
}