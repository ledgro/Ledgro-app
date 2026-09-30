import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';

let testEnv;

describe('Firestore Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'demo-ledgro',
      firestore: {
        rules: readFileSync(resolve('firestore.rules'), 'utf8'),
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  it('cashier cannot promote themselves to admin', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'shops', 'shop1'), {
        members: { alice: 'member' },
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice');
    const db = aliceContext.firestore();

    await assertFails(
      updateDoc(doc(db, 'shops', 'shop1'), {
        'members.alice': 'admin',
      })
    );
  });

  it('cashier cannot edit old bill fields', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'shops', 'shop1'), {
        members: { alice: 'member' },
      });
      await setDoc(doc(db, 'shops', 'shop1', 'bills', 'bill1'), {
        creatorId: 'alice',
        grandTotal: 1000,
        type: 'sale'
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice');
    const db = aliceContext.firestore();

    // Alice tries to update the grandTotal of her own bill (which should fail)
    await assertFails(
      updateDoc(doc(db, 'shops', 'shop1', 'bills', 'bill1'), {
        grandTotal: 500,
      })
    );
  });

  it('allows Malayalam names for products in catalog', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'shops', 'shop1'), {
        members: { alice: 'member' },
      });
    });

    const aliceContext = testEnv.authenticatedContext('alice');
    const db = aliceContext.firestore();

    await assertSucceeds(
      setDoc(doc(db, 'shops', 'shop1', 'catalog', 'prod1'), {
        name: 'അരി', // Malayalam word for rice
        lastUsedPrice: 50,
        unit: 'kg',
        stockCount: 100,
        lowStockAlert: 10,
        category: 'grains',
        description: '',
        isActive: true,
        updatedAt: '2023-10-27T00:00:00Z',
        frequency: 0,
        createdAt: '2023-10-27T00:00:00Z',
      })
    );
  });

  it('non-member cannot read shop data', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'shops', 'shop1'), {
        members: { alice: 'member' },
      });
    });

    const bobContext = testEnv.authenticatedContext('bob');
    const db = bobContext.firestore();

    await assertFails(
      getDoc(doc(db, 'shops', 'shop1'))
    );
  });
});
