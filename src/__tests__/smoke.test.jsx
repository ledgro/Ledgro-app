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
    __batch: batch,
  };
});

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'owner@example.com' }, shopId: 's1', shopName: 'Test Shop', shopAdminId: 'u1',
    signOut: vi.fn(), deleteAccount: vi.fn(),
  }),
}));

// chart.js needs a real canvas; jsdom has none
vi.mock('react-chartjs-2', () => ({ Bar: () => null }));

const firestore = await import('firebase/firestore');
const { useCatalogStore } = await import('../store/catalogStore');

const pages = [
  ['POS', () => import('../pages/POS')],
  ['Expenses', () => import('../pages/Expenses')],
  ['Ledger', () => import('../pages/Ledger')],
  ['Dashboard', () => import('../pages/Dashboard')],
  ['Settings', () => import('../pages/Settings')],
  ['PLScreen', () => import('../pages/PLScreen')],
  ['Products', () => import('../pages/Products')],
];

function findUndefined(value, path = '') {
  if (value === undefined) return path || '(root)';
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const hit = findUndefined(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  useCatalogStore.getState().reset();
});

describe('page smoke tests (render + settle, must not throw)', () => {
  test.each(pages)('%s renders without throwing', async (_name, load) => {
    const { default: Page } = await load();
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);
    // let effects + async data loads finish; a post-load render error fails the test here
    await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });
});

describe('POS checkout', () => {
  test('writes a bill with no undefined fields and shows success', async () => {
    firestore.getDocs.mockResolvedValueOnce({
      docs: [{ id: 'c1', data: () => ({ name: 'Rice', lastUsedPrice: 5000, unit: 'kg', frequency: 3 }) }],
      empty: false,
      forEach() {},
    });

    const { default: POS } = await import('../pages/POS');
    render(<MemoryRouter><POS /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Rice'));
    fireEvent.click(await screen.findByText(/Confirm Checkout/i));

    await waitFor(() => expect(firestore.__batch.set).toHaveBeenCalled());
    const [, payload] = firestore.__batch.set.mock.calls[0];

    expect(findUndefined(payload)).toBeNull();
    expect(payload.items[0].unitPrice).toBe(5000);
    expect(payload.grandTotal).toBe(5000);
    expect(await screen.findByText(/Checkout Successful/i)).toBeTruthy();
  });
});
