import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { where } from 'firebase/firestore';
import { fetchAllPaged } from './firestoreUtils';

// Cash adjustments written by the daily lock are not real expenses.
// New docs use category 'cash_adjustment'; legacy docs used a description.
export function isCashAdjustment(e) {
  if (e.category === 'cash_adjustment') return true;
  return e.category === 'other' && (e.description === 'Cash Shortage' || e.description === 'Cash Overage');
}

/** Bill total in paise with the correct sign (returns always negative). */
export function signedBillTotal(b) {
  const g = Number(b.grandTotal) || 0;
  return b.type === 'return' ? -Math.abs(g) : g;
}

export async function computeDailyAggregations(shopId) {
  if (!shopId) return null;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const yesterdayStart = subDays(todayStart, 1);
  const weekStart = subDays(todayStart, 6);

  const range = [where('createdAt', '>=', weekStart), where('createdAt', '<=', todayEnd)];
  // Rules cap list queries at 100 docs, so read in pages.
  const [weekBDocs, weekEDocs] = await Promise.all([
    fetchAllPaged(`shops/${shopId}/bills`, range),
    fetchAllPaged(`shops/${shopId}/expenses`, range),
  ]);

  // Returns that belong to voided originals must not count.
  const voidedMap = new Set();
  const allBills = [];
  weekBDocs.forEach((d) => {
    const b = d.data({ serverTimestamps: 'estimate' });
    if (b.isVoided || b.type === 'reversal') {
      if (b.originalBillId) voidedMap.add(b.originalBillId);
      voidedMap.add(d.id);
    }
    allBills.push({ id: d.id, ...b });
  });

  const todayStr = format(todayStart, 'yyyy-MM-dd');
  const yestStr = format(yesterdayStart, 'yyyy-MM-dd');

  // Sparkline buckets
  const dailyEarn = {};
  const dailyExp = {};
  for(let i = 0; i < 7; i++) {
    const dStr = format(subDays(todayStart, i), 'yyyy-MM-dd');
    dailyEarn[dStr] = 0;
    dailyExp[dStr] = 0;
  }

  // Daily aggregators
  let todayCash = 0, todayUpi = 0, todayRev = 0, todayExpAmt = 0;
  let yestRev = 0, yestExpAmt = 0;
  let todayExpectedCashDeduction = 0;

  // Process Bills
  allBills.forEach(b => {
    if (b.isVoided || b.type === 'reversal') return;
    if (b.type === 'return' && voidedMap.has(b.originalBillId)) return;

    const dtStr = b.createdAt ? format(b.createdAt.toDate(), 'yyyy-MM-dd') : null;
    if (!dtStr || dailyEarn[dtStr] === undefined) return;

    const mult = b.type === 'return' ? -1 : 1;
    const total = signedBillTotal(b);

    // Sparkline revenue (we will subtract expense later to get net earnings)
    dailyEarn[dtStr] += total;

    if (dtStr === todayStr) {
      todayRev += total;

      const method = b.payment?.method || b.paymentMethod || 'cash'; // Unknowns fall into cash, could explicitly track unknownAmt instead
      if (method === 'split' && b.payment?.breakdown) {
         todayCash += (b.payment.breakdown.cash || 0) * mult;
         todayUpi += (b.payment.breakdown.upi || 0) * mult;
      } else if (method === 'upi' || b.refundMethod === 'upi') {
         todayUpi += total;
      } else {
         todayCash += total; // includes 'cash' and 'unknown'
      }
    } else if (dtStr === yestStr) {
      yestRev += total;
    }
  });

  // Process Expenses
  weekEDocs.forEach(d => {
    const e = d.data({ serverTimestamps: 'estimate' });
    const dtStr = e.createdAt ? format(e.createdAt.toDate(), 'yyyy-MM-dd') : null;
    if (!dtStr || dailyExp[dtStr] === undefined) return;

    const amt = Number(e.amount) || 0;

    // Sparkline expenses
    // Exclude Cash Overage/Shortage adjustments created by the lock process from Net Earnings logic
    if (!isCashAdjustment(e)) {
       dailyExp[dtStr] += amt;
    }

    if (dtStr === todayStr) {
      if (!isCashAdjustment(e)) {
         todayExpAmt += amt;
      }

      // Only reduce expected cash drawer if the expense was explicitly paid via cash.
      // (Older documents without paidVia assumed cash, so we default to cash).
      const pVia = e.paidVia || 'cash';
      if (pVia === 'cash' && !isCashAdjustment(e)) {
         todayExpectedCashDeduction += amt;
      }
    } else if (dtStr === yestStr) {
      if (!isCashAdjustment(e)) {
         yestExpAmt += amt;
      }
    }
  });

  const todayNet = todayRev - todayExpAmt;
  const yestNet = yestRev - yestExpAmt;

  let percentDiff = 0;
  if (yestNet !== 0) {
     percentDiff = ((todayNet - yestNet) / Math.abs(yestNet)) * 100;
  } else if (todayNet > 0) {
     percentDiff = 100;
  }

  const sparkData = Object.keys(dailyEarn).sort().map(k => dailyEarn[k] - dailyExp[k]);

  return {
    expectedCash: todayCash - todayExpectedCashDeduction,
    upiInBank: todayUpi,
    netEarnings: todayNet,
    vsYesterday: percentDiff,
    cashSplit: todayCash,
    upiSplit: todayUpi,
    weekData: sparkData
  };
}