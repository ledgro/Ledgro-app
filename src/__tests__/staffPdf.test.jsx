import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, test, expect, beforeEach } from 'vitest';

// ---- browser API stubs missing in jsdom (set before pages are imported) ----
window.matchMedia = window.matchMedia || ((q) => ({
  matches: false, media: q, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; },
}));
globalThis.IntersectionObserver = globalThis.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };

// ---- mocks ----
vi.mock('../firebase', () => ({ db: {}, auth: {}, googleProvider: {} }));

vi.mock('firebase/firestore', () => {
  const batch = { set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => {}) };
  const emptySnap = () => ({ docs: [], empty: true, forEach() {} });
  return {
    collection: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(),
    getDocs: vi.fn(async () => emptySnap()),
    getDoc: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
    addDoc: vi.fn(async () => ({ id: 'new-id' })), setDoc: vi.fn(async () => {}), updateDoc: vi.fn(async () => {}), deleteDoc: vi.fn(async () => {}),
    doc: vi.fn(() => ({})), writeBatch: vi.fn(() => batch),
    serverTimestamp: vi.fn(() => ({ _sentinel: 'serverTimestamp' })), increment: vi.fn((n) => ({ _increment: n })),
    getDocFromCache: vi.fn(async () => { throw new Error('no cache'); }), onSnapshot: vi.fn(() => () => {}),
    waitForPendingWrites: vi.fn(async () => {}), deleteField: vi.fn(() => ({ _delete: true })),
    Timestamp: { fromMillis: (n) => ({ ms: n }) },
    runTransaction: vi.fn(async (_db, fn) => fn({
      get: async (ref) => ({ exists: () => true, ref, data: () => ({ name: 'x', stockCount: null, frequency: 0 }) }),
      set: (...a) => batch.set(...a), update: (...a) => batch.update(...a),
    })),
    __batch: batch,
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'owner@example.com' }, shopId: 's1', shopName: 'Test Shop', shopAdminId: 'someone-else',
    signOut: vi.fn(), deleteAccount: vi.fn(), beginVoluntaryExit: vi.fn(), shopProfile: null,
  }),
}));

vi.mock('../lib/clockDrift', () => ({ serverNow: async () => new Date(), CLOCK_MSG: 'clock' }));


const { useCatalogStore } = await import('../store/catalogStore');
void useCatalogStore;

describe('staff access', () => {
  test('a staff member (not the owner) still sees Catalog PDF', async () => {
    const Products = (await import('../pages/Products')).default;
    render(<MemoryRouter><Products /></MemoryRouter>);
    expect(await screen.findByRole('button', { name: /Catalog PDF/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Import \/ export/ })).toBeNull();
  });
});
