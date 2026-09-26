import * as admin from "firebase-admin";
import * as functions from "firebase-functions/v2";

admin.initializeApp();
const db = admin.firestore();

// 5. Firestore Aggregation — No Array Anti-Pattern
export const onBillCreated = functions.firestore.onDocumentCreated(
  "shops/{shopId}/bills/{billId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const shopId = event.params.shopId;
    const date = new Date(data.timestamp?.toMillis() || Date.now());
    const dateStr = date.toISOString().split('T')[0];
    const monthStr = dateStr.slice(0, 7);

    const dailyRef = db.doc(`shops/${shopId}/DailySummaries/${dateStr}`);
    const monthlyRef = db.doc(`shops/${shopId}/MonthlySummaries/${monthStr}`);

    const isCreditNote = data.type === 'credit_note';
    const multiplier = isCreditNote ? -1 : 1;
    const amount = (data.grandTotal || 0) * multiplier;
    const tax = (data.tax || 0) * multiplier;

    const incrementCount = admin.firestore.FieldValue.increment(isCreditNote ? 0 : 1);
    const incrementGross = admin.firestore.FieldValue.increment(amount);
    const incrementNet = admin.firestore.FieldValue.increment(amount - tax);
    const incrementTax = admin.firestore.FieldValue.increment(tax);
    const paymentMethodAmount = admin.firestore.FieldValue.increment(amount);

    const updateObj = {
      totalGrossSales: incrementGross,
      totalNetSales: incrementNet,
      totalTax: incrementTax,
      transactionCount: incrementCount,
      [`paymentBreakdown.${data.paymentMethod || 'cash'}`]: paymentMethodAmount,
    };

    const batch = db.batch();
    batch.set(dailyRef, updateObj, { merge: true });
    batch.set(monthlyRef, updateObj, { merge: true });

    // Canonical Invoice Number generation
    const currentSessionId = data.sessionId || 'default';
    if (!data.canonicalInvoiceNo) {
        const counterRef = db.doc(`shops/${shopId}/sessions/${currentSessionId}/counters/invoices`);
        batch.set(counterRef, { count: admin.firestore.FieldValue.increment(1) }, { merge: true });

        // This is a simplified sequential counter.
        // In a real high-throughput system, you'd use a distributed counter or similar.
        batch.update(snap.ref, {
             canonicalInvoiceNo: admin.firestore.FieldValue.serverTimestamp() // Temporary unique id placeholder
        });
    }

    await batch.commit();
  }
);

// 6. Line Item Price Snapshots - Variance check
export const checkPriceVariance = functions.firestore.onDocumentCreated(
  "shops/{shopId}/bills/{billId}",
  async (event) => {
      const snap = event.data;
      if(!snap) return;
      const data = snap.data();
      const shopId = event.params.shopId;
      const items = data.items || [];

      for(const item of items) {
          if (item.unitPriceAtSale && item.productId) {
               const productDoc = await db.doc(`shops/${shopId}/catalog/${item.productId}`).get();
               if(productDoc.exists) {
                   const productData = productDoc.data();
                   if (productData && productData.lastUsedPrice !== item.unitPriceAtSale) {
                        const variance = productData.lastUsedPrice - item.unitPriceAtSale;
                        await db.collection(`shops/${shopId}/priceVarianceLogs`).add({
                            variancePerUnit: variance,
                            totalVariance: variance * item.quantity,
                            cashierId: data.creatorId,
                            reason: 'OFFLINE_STALE_CATALOG_SYNC',
                            timestamp: admin.firestore.FieldValue.serverTimestamp(),
                            billId: event.params.billId,
                            productId: item.productId
                        });
                   }
               }
          }
      }
  }
);

// 12. Invite Flow Upgrade (Pattern B)
export const acceptInviteCallable = functions.https.onCall(async (request) => {
    const { inviteCode } = request.data;
    const uid = request.auth?.uid;

    if(!uid) throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
    if(!inviteCode) throw new functions.https.HttpsError("invalid-argument", "Missing inviteCode.");

    const inviteRef = db.collection('invites').doc(inviteCode);

    try {
        const result = await db.runTransaction(async (t) => {
             const inviteDoc = await t.get(inviteRef);
             if(!inviteDoc.exists) throw new functions.https.HttpsError("not-found", "Invite not found.");

             const inviteData = inviteDoc.data()!;
             if(inviteData.claimedBy) throw new functions.https.HttpsError("failed-precondition", "Invite already used.");
             if(inviteData.expiresAt.toMillis() < Date.now()) throw new functions.https.HttpsError("failed-precondition", "Invite expired.");

             const shopRef = db.doc(`shops/${inviteData.shopId}`);
             t.update(shopRef, {
                 [`members.${uid}`]: 'member'
             });
             t.update(inviteRef, {
                 claimedBy: uid,
                 claimedAt: admin.firestore.FieldValue.serverTimestamp()
             });

             return { shopId: inviteData.shopId };
        });
        return { success: true, shopId: result.shopId };
    } catch (e: any) {
        throw new functions.https.HttpsError("internal", e.message);
    }
});

// 11. IP Rate Limiting via beforeSignIn Blocking Function
// Requires Identity Platform enabled on Firebase
export const beforeSignIn = functions.identity.beforeUserSignedIn(async (event) => {
    // In a real environment with Identity Platform this is valid.
    // Assuming blocking functions are supported and set up correctly.
    const ipAddress = event.ipAddress || 'unknown';
    if (ipAddress === 'unknown') return;

    const ipKey = ipAddress.replace(/\./g, '_');
    const limitRef = db.collection('ip_rate_limits').doc(ipKey);

    await db.runTransaction(async (t) => {
        const doc = await t.get(limitRef);
        const now = Date.now();

        if (!doc.exists) {
            t.set(limitRef, { attempts: 1, windowStart: now });
            return;
        }

        const data = doc.data()!;
        if (now - data.windowStart > 60000) {
            t.set(limitRef, { attempts: 1, windowStart: now });
        } else {
            if (data.attempts >= 5) {
                throw new functions.https.HttpsError('resource-exhausted', 'Too many attempts.');
            }
            t.update(limitRef, { attempts: admin.firestore.FieldValue.increment(1) });
        }
    });
});
