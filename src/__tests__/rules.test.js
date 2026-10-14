// @vitest-environment node
// Firestore security-rule tests. They need the emulator, so they only run via
//   npm run test:rules     (wraps `firebase emulators:exec`)
// and are skipped by plain `npm test`.
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs, collection, query, limit, serverTimestamp, deleteField, Timestamp, writeBatch } from 'firebase/firestore';

const HAS_EMULATOR = !!globalThis.process.env.FIRESTORE_EMULATOR_HOST;
const d = HAS_EMULATOR ? describe : describe.skip;

const SHOP = 'shop1';
const ADMIN = 'adminUid';
const MEMBER = 'memberUid';
const OUTSIDER = 'outsiderUid';

const bizDate = (offsetDays = 0) => new Date(Date.now() + 60 * 60 * 1000 + offsetDays * 86400000).toISOString().slice(0, 10);

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
      const origRef = () => doc(as(MEMBER), `shops/${SHOP}/bills/orig`);
      const returnBatch = (id, amount, newReturnedAmt, extra = {}) => {
        const db = as(MEMBER);
        const b = writeBatch(db);
        b.set(doc(db, `shops/${SHOP}/bills/${id}`), ret({ subtotal: -amount, grandTotal: -amount, ...extra }));
        if (newReturnedAmt !== null) b.update(doc(db, `shops/${SHOP}/bills/orig`), { returnedAmt: newReturnedAmt });
        return b.commit();
      };
      it('valid return succeeds when returnedAmt is updated in the same batch', async () => {
        await assertSucceeds(returnBatch('r1', 5000, 5000));
      });
      it('return without updating returnedAmt fails', async () => {
        await assertFails(returnBatch('r1', 5000, null));
        await assertFails(setDoc(doc(as(MEMBER), `shops/${SHOP}/bills/r1`), ret()));
      });
      it('return with a mismatched returnedAmt fails', async () => {
        await assertFails(returnBatch('r1', 5000, 4000));
        await assertFails(returnBatch('r1', 5000, 6000));
      });
      it('return cannot exceed the original total', async () => {
        await assertFails(returnBatch('r1', 20000, 20000));
      });
      it('returns cannot add up to more than the original total', async () => {
        await assertSucceeds(returnBatch('r1', 6000, 6000));
        await assertFails(returnBatch('r2', 6000, 12000));
        await assertSucceeds(returnBatch('r3', 4000, 10000));
        await assertFails(returnBatch('r4', 1, 10001));
      });
      it('zero-value return fails', async () => {
        await assertFails(returnBatch('r1', 0, 0));
      });
      it('return of a missing bill fails', async () => {
        await assertFails(returnBatch('r1', 5000, null, { originalBillId: 'nope' }));
      });
      it('return against a voided sale fails', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
          await updateDoc(doc(ctx.firestore(), `shops/${SHOP}/bills/orig`), { type: 'reversal' });
        });
        await assertFails(returnBatch('r1', 5000, 5000));
      });
      it('return against another return fails', async () => {
        await assertSucceeds(returnBatch('r1', 5000, 5000));
        const db = as(MEMBER);
        await assertFails(setDoc(doc(db, `shops/${SHOP}/bills/r2`), ret({ originalBillId: 'r1', subtotal: -100, grandTotal: -100 })));
      });
      it('returnedAmt cannot be changed on its own to lower or exceed limits', async () => {
        await assertFails(updateDoc(origRef(), { returnedAmt: 20000 }));
        await assertSucceeds(returnBatch('r1', 5000, 5000));
        await assertFails(updateDoc(origRef(), { returnedAmt: 1000 }));
      });
      it('a sale with returns cannot be voided', async () => {
        await assertSucceeds(returnBatch('r1', 5000, 5000));
        await assertFails(updateDoc(origRef(), {
          type: 'reversal', originalBillId: 'orig', reversedBy: MEMBER, reversedAt: serverTimestamp(),
        }));
      });
      it('realistic return batch (5 stock updates + day stats) stays within rule limits', async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
          for (let i = 0; i < 5; i++) await setDoc(doc(ctx.firestore(), `shops/${SHOP}/catalog/p${i}`), { name: `P${i}`, stockCount: 10, unit: 'pcs' });
        });
        const db = as(MEMBER);
        const b = writeBatch(db);
        b.set(doc(db, `shops/${SHOP}/bills/r1`), ret());
        b.update(doc(db, `shops/${SHOP}/bills/orig`), { returnedAmt: 5000 });
        for (let i = 0; i < 5; i++) b.update(doc(db, `shops/${SHOP}/catalog/p${i}`), { stockCount: 11, updatedAt: serverTimestamp() });
        const day = bizDate(0);
        b.set(doc(db, `shops/${SHOP}/dailyStats/${day}`), { date: day, rev: -5000, cash: -5000, upi: 0, splitCash: 0, splitUpi: 0, bills: 0, exp: 0, expCash: 0, cats: {} });
        await assertSucceeds(b.commit());
      });
      it('return with disallowed keys (shopId/status) fails', async () => {
        await assertFails(returnBatch('r1', 5000, 5000, { shopId: SHOP, status: 'active' }));
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
    const clo = (uid, day, extra = {}) => ({ expectedCash: 100, actualCash: 90, difference: -10, creatorId: uid, createdAt: serverTimestamp(), date: day, ...extra });
    const path = (day) => `shops/${SHOP}/dailyClosures/${day}`;
    it('cash count can be re-saved; only own uid, correct date', async () => {
      const today = bizDate(0);
      await assertSucceeds(setDoc(doc(as(MEMBER), path(today)), clo(MEMBER, today)));
      await assertSucceeds(setDoc(doc(as(MEMBER), path(today)), clo(MEMBER, today, { actualCash: 100, difference: 0 })));
      await assertFails(setDoc(doc(as(MEMBER), path(today)), clo(ADMIN, today)));
      await assertFails(setDoc(doc(as(MEMBER), path(today)), clo(MEMBER, bizDate(-1))));
    });
    it('member can write yesterday but not older or future days', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), path(bizDate(-1))), clo(MEMBER, bizDate(-1))));
      await assertFails(setDoc(doc(as(MEMBER), path(bizDate(-5))), clo(MEMBER, bizDate(-5))));
      await assertFails(setDoc(doc(as(MEMBER), path(bizDate(3))), clo(MEMBER, bizDate(3))));
    });
    it('admin can write older days but not future days', async () => {
      await assertSucceeds(setDoc(doc(as(ADMIN), path(bizDate(-30))), clo(ADMIN, bizDate(-30))));
      await assertFails(setDoc(doc(as(ADMIN), path(bizDate(3))), clo(ADMIN, bizDate(3))));
    });
  });

  describe('catalog', () => {
    const item = { name: 'Rice', lastUsedPrice: 5000, unit: 'kg', stockCount: null, isActive: true, frequency: 0, createdBy: MEMBER, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
    const ref = (uid, id) => doc(as(uid), `shops/${SHOP}/catalog/${id}`);
    const touch = (extra) => ({ ...extra, updatedAt: serverTimestamp() });
    it('member creates and adjusts stock; nobody hard-deletes', async () => {
      await assertSucceeds(setDoc(ref(MEMBER, 'c1'), item));
      await assertSucceeds(updateDoc(ref(MEMBER, 'c1'), touch({ stockCount: 10 })));
      await assertSucceeds(updateDoc(ref(MEMBER, 'c1'), touch({ stockCount: 12 })));
      await assertFails(updateDoc(ref(MEMBER, 'c1'), touch({ stockCount: -1 })));
      await assertFails(deleteDoc(ref(MEMBER, 'c1')));
      await assertFails(deleteDoc(ref(ADMIN, 'c1')));
    });
    it('every write must stamp updatedAt with server time (delta sync depends on it)', async () => {
      await assertFails(setDoc(ref(MEMBER, 'c1'), { ...item, updatedAt: undefined }));
      await assertFails(setDoc(ref(MEMBER, 'c1'), { ...item, updatedAt: Timestamp.fromMillis(1000) }));
      await assertSucceeds(setDoc(ref(MEMBER, 'c1'), item));
      await assertFails(updateDoc(ref(MEMBER, 'c1'), { stockCount: 5 }));
      await assertFails(updateDoc(ref(MEMBER, 'c1'), { stockCount: 5, updatedAt: Timestamp.fromMillis(1000) }));
    });
    it('only an admin can remove a product, by flagging it deleted', async () => {
      await assertSucceeds(setDoc(ref(MEMBER, 'c1'), item));
      await assertFails(updateDoc(ref(MEMBER, 'c1'), touch({ deleted: true, isActive: false })));
      await assertFails(updateDoc(ref(ADMIN, 'c1'), touch({ deleted: false })));
      await assertSucceeds(updateDoc(ref(ADMIN, 'c1'), touch({ deleted: true, isActive: false })));
    });
    it('source and cost price accepted with limits', async () => {
      await assertSucceeds(setDoc(ref(MEMBER, 'c2'), { ...item, source: 'VIBBRO', costPrice: 58000 }));
      await assertSucceeds(updateDoc(ref(MEMBER, 'c2'), touch({ costPrice: null, source: '' })));
      await assertFails(updateDoc(ref(MEMBER, 'c2'), touch({ costPrice: -5 })));
      await assertFails(updateDoc(ref(MEMBER, 'c2'), touch({ source: 'x'.repeat(61) })));
    });
  });

  describe('transfers', () => {
    const tr = (uid, extra = {}) => ({ direction: 'in', party: 'VIBBRO', productId: 'c1', name: 'Heels shoe', qty: 3, unitPrice: 58000, creatorId: uid, createdAt: serverTimestamp(), ...extra });
    const col = `shops/${SHOP}/transfers`;
    it('member creates own valid transfer; outsider cannot', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `${col}/t1`), tr(MEMBER)));
      await assertSucceeds(setDoc(doc(as(MEMBER), `${col}/t2`), tr(MEMBER, { direction: 'out', unitPrice: null })));
      await assertFails(setDoc(doc(as(OUTSIDER), `${col}/t3`), tr(OUTSIDER)));
    });
    it('rejects other uid, bad direction, zero qty, extra key, edits and member delete', async () => {
      await assertFails(setDoc(doc(as(MEMBER), `${col}/t4`), tr(ADMIN)));
      await assertFails(setDoc(doc(as(MEMBER), `${col}/t5`), tr(MEMBER, { direction: 'sideways' })));
      await assertFails(setDoc(doc(as(MEMBER), `${col}/t6`), tr(MEMBER, { qty: 0 })));
      await assertFails(setDoc(doc(as(MEMBER), `${col}/t7`), tr(MEMBER, { extra: 1 })));
      await assertSucceeds(setDoc(doc(as(MEMBER), `${col}/t8`), tr(MEMBER)));
      await assertFails(updateDoc(doc(as(MEMBER), `${col}/t8`), { qty: 99 }));
      await assertFails(deleteDoc(doc(as(ADMIN), `${col}/t8`)));
    });
    it('members read', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `${col}/t9`), tr(MEMBER)));
      await assertSucceeds(getDocs(query(collection(as(ADMIN), col), limit(10))));
      await assertFails(getDocs(query(collection(as(OUTSIDER), col), limit(10))));
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
    it('admin sets day start within 0..330 minutes; member cannot', async () => {
      await assertSucceeds(updateDoc(doc(as(ADMIN), 'shops', SHOP), { dayCutoffMin: 0, updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(doc(as(ADMIN), 'shops', SHOP), { dayCutoffMin: 400 }));
      await assertFails(updateDoc(doc(as(ADMIN), 'shops', SHOP), { dayCutoffMin: -1 }));
      await assertFails(updateDoc(doc(as(ADMIN), 'shops', SHOP), { dayCutoffMin: 'x' }));
      await assertFails(updateDoc(doc(as(MEMBER), 'shops', SHOP), { dayCutoffMin: 120 }));
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

  describe('dailyStats', () => {
    const st = (day, extra = {}) => ({ date: day, rev: 100, cash: 100, upi: 0, splitCash: 0, splitUpi: 0, bills: 1, exp: 0, expCash: 0, cats: {}, ...extra });
    const biz = (offsetDays = 0) => {
      const d = new Date(Date.now() + 60 * 60 * 1000 + offsetDays * 86400000);
      return d.toISOString().slice(0, 10);
    };
    const path = (day) => `shops/${SHOP}/dailyStats/${day}`;
    it('admin writes valid day; outsider cannot', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), path(biz(0))), st(biz(0))));
      await assertFails(setDoc(doc(as(OUTSIDER), path(biz(0))), st(biz(0))));
    });
    it('rejects bad id, mismatched date, extra key, non-number', async () => {
      await assertFails(setDoc(doc(as(ADMIN), path('bad')), st('bad')));
      await assertFails(setDoc(doc(as(MEMBER), path(biz(0))), st(biz(1))));
      await assertFails(setDoc(doc(as(MEMBER), path(biz(0))), st(biz(0), { extra: 1 })));
      await assertFails(setDoc(doc(as(MEMBER), path(biz(0))), st(biz(0), { rev: 'x' })));
    });
    it('member: today and yesterday ok, older and future rejected', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), path(biz(0))), st(biz(0))));
      await assertSucceeds(setDoc(doc(as(MEMBER), path(biz(-1))), st(biz(-1))));
      await assertFails(setDoc(doc(as(MEMBER), path(biz(-5))), st(biz(-5))));
      await assertFails(setDoc(doc(as(MEMBER), path(biz(3))), st(biz(3))));
    });
    it('admin may write older days (rebuild, old expense delete), not future', async () => {
      await assertSucceeds(setDoc(doc(as(ADMIN), path(biz(-30))), st(biz(-30))));
      await assertFails(setDoc(doc(as(ADMIN), path(biz(3))), st(biz(3))));
    });
    it('no future days; members only today or yesterday; admin may fix older days', async () => {
      const biz = (offsetMs) => {
        const b = new Date(Date.now() + offsetMs + 3600 * 1000); // UTC+1h = India time minus 04:30
        return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, '0')}-${String(b.getUTCDate()).padStart(2, '0')}`;
      };
      const today = biz(0), yest = biz(-86400000), old = biz(-5 * 86400000), future = biz(2 * 86400000);
      await assertSucceeds(setDoc(doc(as(MEMBER), path(today)), st(today)));
      await assertSucceeds(setDoc(doc(as(MEMBER), path(yest)), st(yest)));
      await assertFails(setDoc(doc(as(MEMBER), path(old)), st(old)));
      await assertFails(setDoc(doc(as(MEMBER), path(future)), st(future)));
      await assertSucceeds(setDoc(doc(as(ADMIN), path(old)), st(old)));
      await assertFails(setDoc(doc(as(ADMIN), path(future)), st(future)));
    });
    it('members read; member cannot delete', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), path(biz(0))), st(biz(0))));
      await assertSucceeds(getDoc(doc(as(MEMBER), path(biz(0)))));
      await assertFails(deleteDoc(doc(as(MEMBER), path(biz(0)))));
    });
  });

  describe('memberProfiles', () => {
    const path = (uid) => `shops/${SHOP}/memberProfiles/${uid}`;
    it('member writes only own profile; everyone in the shop can read', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), path(MEMBER)), { name: 'Asha', updatedAt: serverTimestamp() }));
      await assertFails(setDoc(doc(as(MEMBER), path(ADMIN)), { name: 'Fake', updatedAt: serverTimestamp() }));
      await assertSucceeds(getDoc(doc(as(ADMIN), path(MEMBER))));
      await assertFails(getDoc(doc(as(OUTSIDER), path(MEMBER))));
    });
    it('rejects empty, long and extra fields', async () => {
      await assertFails(setDoc(doc(as(MEMBER), path(MEMBER)), { name: '', updatedAt: serverTimestamp() }));
      await assertFails(setDoc(doc(as(MEMBER), path(MEMBER)), { name: 'x'.repeat(81), updatedAt: serverTimestamp() }));
      await assertFails(setDoc(doc(as(MEMBER), path(MEMBER)), { name: 'Asha', role: 'admin', updatedAt: serverTimestamp() }));
    });
    it('user can delete own profile only', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), path(MEMBER)), { name: 'Asha', updatedAt: serverTimestamp() }));
      await assertFails(deleteDoc(doc(as(ADMIN), path(MEMBER))));
      await assertSucceeds(deleteDoc(doc(as(MEMBER), path(MEMBER))));
    });
  });

  describe('errorLogs', () => {
    const log = (uid, extra = {}) => ({ msg: 'boom', stack: 'at x', screen: '/pos', uid, createdAt: serverTimestamp(), ...extra });
    const col = `shops/${SHOP}/errorLogs`;
    it('member can create with own uid; outsider and spoofed uid cannot', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `${col}/e1`), log(MEMBER)));
      await assertFails(setDoc(doc(as(MEMBER), `${col}/e2`), log(ADMIN)));
      await assertFails(setDoc(doc(as(OUTSIDER), `${col}/e3`), log(OUTSIDER)));
    });
    it('rejects oversized and unknown fields', async () => {
      await assertFails(setDoc(doc(as(MEMBER), `${col}/e1`), log(MEMBER, { msg: 'x'.repeat(301) })));
      await assertFails(setDoc(doc(as(MEMBER), `${col}/e1`), log(MEMBER, { stack: 'x'.repeat(1501) })));
      await assertFails(setDoc(doc(as(MEMBER), `${col}/e1`), log(MEMBER, { extra: 1 })));
    });
    it('only the admin reads and clears; entries are never edited', async () => {
      await assertSucceeds(setDoc(doc(as(MEMBER), `${col}/e1`), log(MEMBER)));
      await assertFails(getDoc(doc(as(MEMBER), `${col}/e1`)));
      await assertSucceeds(getDocs(query(collection(as(ADMIN), col), limit(20))));
      await assertFails(updateDoc(doc(as(ADMIN), `${col}/e1`), { msg: 'changed' }));
      await assertSucceeds(deleteDoc(doc(as(ADMIN), `${col}/e1`)));
    });
  });

  describe('catalog updatedBy', () => {
    const ref = (uid) => doc(as(uid), `shops/${SHOP}/catalog/p1`);
    it('updatedBy must be the signed-in user', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `shops/${SHOP}/catalog/p1`), { name: 'Rice', lastUsedPrice: 100, unit: 'kg' });
      });
      await assertSucceeds(updateDoc(ref(MEMBER), { name: 'Rice 2', updatedBy: MEMBER, updatedAt: serverTimestamp() }));
      await assertFails(updateDoc(ref(MEMBER), { name: 'Rice 3', updatedBy: ADMIN, updatedAt: serverTimestamp() }));
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
