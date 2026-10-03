import { startOfDay, endOfDay, subDays, format } from 'date-fns';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export async function computeDailyAggregations(shopId) {
  if (!shopId) return null;

  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const yesterdayStart = subDays(todayStart, 1);
  const weekStart = subDays(todayStart, 6);

  const billsRef = collection(db, `shops/${shopId}/bills`);
  const expRef = collection(db, `shops/${shopId}/expenses`);

  // Only 2 queries to reduce billing: fetch the whole week without limits
  const qWeekBills = query(billsRef, where('createdAt', '>=', weekStart), where('createdAt', '<=', todayEnd));
  const qWeekExp = query(expRef, where('createdAt', '>=', weekStart), where('createdAt', '<=', todayEnd));

  const [weekBSnap, weekESnap] = await Promise.all([
    getDocs(qWeekBills), getDocs(qWeekExp)
  ]);

  // Build voided map to skip returns that belong to voided original bills
  const voidedMap = new Set();
  const allBills = [];
  weekBSnap.forEach(doc => {
    const b = doc.data({ serverTimestamps: 'estimate' });
    if (b.isVoided || b.type === 'reversal') {
       if (b.originalBillId) voidedMap.add(b.originalBillId);
       if (b.id) voidedMap.add(b.id);
    }
    allBills.push({ id: doc.id, ...b });
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

    let mult = b.type === 'return' ? -1 : 1;
    const total = (b.grandTotal || 0) * mult;

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
  weekESnap.forEach(doc => {
    const e = doc.data({ serverTimestamps: 'estimate' });
    const dtStr = e.createdAt ? format(e.createdAt.toDate(), 'yyyy-MM-dd') : null;
    if (!dtStr || dailyExp[dtStr] === undefined) return;

    const amt = Number(e.amount) || 0;

    // Sparkline expenses
    // Exclude Cash Overage/Shortage adjustments created by the lock process from Net Earnings logic
    if (e.description !== 'Cash Shortage' && e.description !== 'Cash Overage') {
       dailyExp[dtStr] += amt;
    }

    if (dtStr === todayStr) {
      if (e.description !== 'Cash Shortage' && e.description !== 'Cash Overage') {
         todayExpAmt += amt;
      }

      // Only reduce expected cash drawer if the expense was explicitly paid via cash.
      // (Older documents without paidVia assumed cash, so we default to cash).
      const pVia = e.paidVia || 'cash';
      if (pVia === 'cash') {
         todayExpectedCashDeduction += amt;
      }
    } else if (dtStr === yestStr) {
      if (e.description !== 'Cash Shortage' && e.description !== 'Cash Overage') {
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