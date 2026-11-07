import { collection, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Adds an activity-log entry to a batch or transaction, so it is saved together with the action it records.
 * Entries can be created by any member but never edited or deleted (see firestore.rules).
 * action: 'void' | 'payment_change' | 'return' | 'discount' | 'expense_delete' | 'import' | 'staff_edit' | 'staff_delete' | 'staff_settle' | 'staff_loan_close'
 */
export function logActivity(w, shopId, uid, { action, billNo = '', billId = '', amount = 0, note = '' }) {
  w.set(doc(collection(db, `shops/${shopId}/auditLogs`)), {
    action,
    uid,
    billNo: String(billNo || '').slice(0, 40),
    billId: String(billId || '').slice(0, 128),
    amount: Math.round(Number(amount) || 0),
    note: String(note || '').slice(0, 200),
    createdAt: serverTimestamp(),
  });
}
