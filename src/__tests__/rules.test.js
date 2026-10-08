// @vitest-environment node
// Firestore security-rule tests. They need the emulator, so they only run via
//   npm run test:rules     (wraps `firebase emulators:exec`)
// and are skipped by plain `npm test`.
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, limit, serverTimestamp, deleteField, Timestamp } from 'firebase/firestore';

const HAS_EMULATOR = !!globalThis.process.env.FIRESTORE_EMULATOR_HOST;
const d = HAS_EMULATOR ? describe : describe.skip;

const SHOP = 'shop1';
const ADMIN = 'adminUid';
const MEMBER = 'memberUid';
const OUTSIDER = 'outsiderUid';

d('firestore.rules', () => {
  let env;
  const as = (uid) => env.authenticatedContext(uid).firestore();

  beforeAll(async () => {
    const [host, port] = globalThis.process.env.FIRESTORE_EMULATOR_HOST.split(':');
    env = await initializeTestEnvironment({
      projectId: 'ledgro-rules-test',
      firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
    });
  });
  afterAll(async () => { await env?.cleanup(); });

  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'shops', SHOP), { name: 'Test', ownerId: ADMIN, members: { [ADMIN]: 'admin', [MEMBER]: 'member' } });
    });
  });

  const sale = (uid, extra = {}) => ({
    creatorId: uid,
    items: [{ name: 'Rice', catalogId: 'c1', unit: 'kg', unitPrice: 5000, qty: 2, rawTotal: 10000, lineDiscount: 0, finalLineTotal: 10000 }],
    subtotal: 10000, globalDiscount: null, globalDiscountAmt: 0, grandTotal: 10000,
    paymentMethod: 'cash', payment: { method: 'cash' }, shopName: 'Test', billNo: 'A-1',
    clientCreatedAt: new Date().toISOString(), createdAt: serverTimestamp(), ...extra,
  });

  describe('bills', () => {
    it('member can create a valid sale', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/b1`), sale(MEMBER)));
    });
    it('outsider cannot create', async () => {
      await assertFails(setDoc(doc(as(OUTSIDER), `shops/${SHOP}/bills/b1`), sale(OUTSIDER)));
    });
    it('rejects creatorId spoof', async () => {
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/b1`), sale(ADMIN)));
    });
    it('rejects total that ignores discount', async () => {
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/b1`), sale(MEMBER, { globalDiscountAmt: 1000, grandTotal: 10000 })));
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/b2`), sale(MEMBER, { globalDiscountAmt: 1000, grandTotal: 9000 })));
    });
    it('rejects negative sale and unknown fields', async () => {
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/b1`), sale(MEMBER, { subtotal: -5, grandTotal: -5 })));
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/b1`), sale(MEMBER, { hacked: true })));
    });
    it('list needs limit <= 100', async () => {
      await assertSucceeds(getDocs(query(collection(as(MEMBER), `shops/${SHOP}/bills`), limit(100))));
      await assertFails(getDocs(collection(as(MEMBER), `shops/${SHOP}/bills`)));
    });

    describe('returns and voids', () => {
      beforeEach(async () => {
        await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/orig`), sale(MEMBER)));
      });
      const ret = (extra = {}) => ({
        type: 'return', originalBillId: 'orig', creatorId: MEMBER,
        items: [{ idx: 0, name: 'Rice', qty: 1, lineTotal: 5000 }],
        subtotal: -5000, grandTotal: -5000, paymentMethod: 'cash', refundMethod: 'cash',
        billNo: 'R-A-1', clientCreatedAt: Date.now(), createdAt: serverTimestamp(), ...extra,
      });
      it('valid return succeeds', async () => {
        await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/r1`), ret()));
      });
      it('return cannot exceed the original total', async () => {
        await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/r1`), ret({ subtotal: -20000, grandTotal: -20000 })));
      });
      it('return of a missing bill fails', async () => {
        await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/r1`), ret({ originalBillId: 'nope' })));
      });
      it('return with disallowed keys (shopId/status) fails', async () => {
        await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/r1`), ret({ shopId: SHOP, status: 'active' })));
      });
      it('creator can void own sale (sale -> reversal)', async () => {
        await assertSucceeds(updateDoc(doc(as(MEMBER), `shops/${SHOP}/bills/orig`), {
          type: 'reversal', originalBillId: 'orig', reversedBy: MEMBER, reversedAt: serverTimestamp(),
        }));
      });
      it('other plain member cannot void', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'shops', SHOP), { name: 'Test', ownerId: ADMIN, members: { [ADMIN]: 'admin', [MEMBER]: 'member', other: 'member' } });
        });
        await assertFails(updateDoc(doc(as('other'), `shops/${SHOP}/bills/orig`), {
          type: 'reversal', originalBillId: 'orig', reversedBy: 'other', reversedAt: serverTimestamp(),
        }));
      });
      it('old isVoided-style update is rejected', async () => {
        await assertFails(updateDoc(doc(as(MEMBER), `shops/${SHOP}/bills/orig`), { isVoided: true }));
      });
      it('cannot change amounts', async () => {
        await assertFails(updateDoc(doc(as(MEMBER), `shops/${SHOP}/bills/orig`), { grandTotal: 1 }));
      });
      it('bills cannot be deleted while shop has >1 member', async () => {
        await assertFails(deleteDoc(doc(as(ADMIN), `shops/${SHOP}/bills/orig`)));
      });
    });
  });

  describe('expenses', () => {
    const exp = (uid, extra = {}) => ({ amount: 5000, category: 'rent', description: 'x', paidVia: 'cash', creatorId: uid, createdAt: serverTimestamp(), ...extra });
    it('member creates; bad paidVia rejected; cash_adjustment ok', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/expenses/e1`), exp(MEMBER)));
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/expenses/e2`), exp(MEMBER, { paidVia: 'crypto' })));
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/expenses/e3`), exp(MEMBER, { category: 'cash_adjustment', description: 'Cash Shortage' })));
    });
    it('only admin deletes', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/expenses/e1`), exp(MEMBER)));
      await assertFails(deleteDoc(doc(as(MEMBER), `shops/${SHOP}/expenses/e1`)));
      await assertSucceeds(deleteDoc(doc(as(ADMIN), `shops/${SHOP}/expenses/e1`)));
    });
  });

  describe('dailyClosures', () => {
    const clo = (uid) => ({ expectedCash: 100, actualCash: 90, difference: -10, creatorId: uid, createdAt: serverTimestamp(), date: '2026-01-02' });
    it('cash count can be re-saved; only own uid, correct date', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/dailyClosures/2026-01-02`), clo(MEMBER)));
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/dailyClosures/2026-01-02`), { ...clo(MEMBER), actualCash: 100, difference: 0 }));
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/dailyClosures/2026-01-02`), clo(ADMIN)));
      await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/dailyClosures/2026-01-03`), clo(MEMBER)));
    });
  });

  describe('catalog', () => {
    const item = { name: 'Rice', lastUsedPrice: 5000, unit: 'kg', stockCount: null, isActive: true, frequency: 0, createdBy: MEMBER, createdAt: serverTimestamp() };
    it('member creates, adjusts stock, cannot delete; admin deletes', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `shops/${SHOP}/catalog/c1`), item));
      await assertSucceeds(updateDoc(doc(as(MEMBER), `shops/${SHOP}/catalog/c1`), { stockCount: 10 }));
      await assertSucceeds(updateDoc(doc(as(MEMBER), `shops/${SHOP}/catalog/c1`), { stockCount: 12 }));
      await assertFails(updateDoc(doc(as(MEMBER), `shops/${SHOP}/catalog/c1`), { stockCount: -1 }));
      await assertFails(deleteDoc(doc(as(MEMBER), `shops/${SHOP}/catalog/c1`)));
      await assertSucceeds(deleteDoc(doc(as(ADMIN), `shops/${SHOP}/catalog/c1`)));
    });
  });

  describe('shops', () => {
    it('outsider cannot read', async () => {
      await assertFails(getDoc(doc(as(OUTSIDER), 'shops', SHOP)));
      await assertSucceeds(getDoc(doc(as(MEMBER), 'shops', SHOP)));
    });
    it('admin updates profile within limits', async () => {
      await assertSucceeds(updateDoc(doc(as(ADMIN), 'shops', SHOP), { phone: '123', address: 'a', tagline: 't', updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(as(ADMIN), 'shops', SHOP), { tagline: 'x'.repeat(101) }));
    });
    it('member cannot edit profile but can leave', async () => {
      await assertFails(updateDoc(doc(as(MEMBER), 'shops', SHOP), { name: 'Hacked' }));
      await assertSucceeds(updateDoc(doc(as(MEMBER), 'shops', SHOP), { [`members.${MEMBER}`]: deleteField() }));
    });
    it('admin cannot leave as last admin; can transfer ownership', async () => {
      await assertFails(updateDoc(doc(as(ADMIN), 'shops', SHOP), { [`members.${ADMIN}`]: deleteField() }));
      await assertSucceeds(updateDoc(doc(as(ADMIN), 'shops', SHOP), { [`members.${MEMBER}`]: 'admin', [`members.${ADMIN}`]: 'member', ownerId: MEMBER }));
    });
    it('shop delete only when sole member', async () => {
      await assertFails(deleteDoc(doc(as(ADMIN), 'shops', SHOP)));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'shops', SHOP), { name: 'Test', ownerId: ADMIN, members: { [ADMIN]: 'admin' } });
      });
      await assertSucceeds(deleteDoc(doc(as(ADMIN), 'shops', SHOP)));
    });
    it('create a shop as yourself only', async () => {
      await assertSucceeds(setDoc(doc(as('newOwner'), 'shops', 's2'), { name: 'S2', ownerId: 'newOwner', members: { newOwner: 'admin' } }));
      await assertFails(setDoc(doc(as('newOwner'), 'shops', 's3'), { name: 'S3', ownerId: 'someoneElse', members: { someoneElse: 'admin' } }));
    });
  });

  describe('invites', () => {
    it('admin creates; list is blocked', async () => {
      const exp = Timestamp.fromMillis(Date.now() + 30 * 60 * 1000);
      await assertSucceeds(setDoc(doc(as(ADMIN), 'invites', 'CODE1'), { shopId: SHOP, expiresAt: exp, claimedBy: null, claimedAt: null, createdBy: ADMIN }));
      await assertFails(setDoc(doc(as(MEMBER), 'invites', 'CODE2'), { shopId: SHOP, expiresAt: exp, claimedBy: null, claimedAt: null, createdBy: MEMBER }));
      await assertFails(getDocs(collection(as(ADMIN), 'invites')));
    });
  });
});
