import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
  const rows = [
    { id: 'e1', description: 'Tea cash', amount: 5000, category: 'other', paidVia: 'cash', createdAt: { toDate: () => new Date() }, createdBy: 'u1' },
    { id: 'e2', description: 'Rent unpaid', amount: 900000, category: 'rent', paidVia: 'unpaid', createdAt: { toDate: () => new Date() }, createdBy: 'u1' },
    { id: 'e3', description: 'Auto staff pocket', amount: 12000, category: 'other', paidVia: 'staff', createdAt: { toDate: () => new Date() }, createdBy: 'u1' },
  ];
  const mkSnap = () => ({ docs: rows.map((r) => ({ id: r.id, data: () => { const rest = { ...r }; delete rest.id; return rest; } })), empty: false, forEach() {} });
  return {
    collection: vi.fn(() => ({})), query: vi.fn(() => ({})), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn(), startAfter: vi.fn(),
    getDocs: vi.fn(async () => mkSnap()),
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
    user: { uid: 'u1', email: 'owner@example.com' }, shopId: 's1', shopName: 'Test Shop', shopAdminId: 'u1',
    signOut: vi.fn(), deleteAccount: vi.fn(), beginVoluntaryExit: vi.fn(), shopProfile: null,
  }),
}));

vi.mock('../lib/clockDrift', () => ({ serverNow: async () => new Date(), CLOCK_MSG: 'clock' }));


const { default: Expenses } = await import('../pages/Expenses');
const chip = (name) => within(screen.getByRole('group', { name: 'Filter' })).getByRole('button', { name });

describe('Expenses filter chips', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('All, Unpaid and Paid each render without crashing and show the right rows', async () => {
    render(<MemoryRouter><Expenses /></MemoryRouter>);
    await screen.findByText('Tea cash');
    expect(screen.getByText('Rent unpaid')).toBeTruthy();
    expect(screen.getByText('Auto staff pocket')).toBeTruthy();

    fireEvent.click(chip('Unpaid'));
    await waitFor(() => expect(screen.queryByText('Tea cash')).toBeNull());
    expect(screen.getByText('Rent unpaid')).toBeTruthy();
    expect(screen.getByText('Auto staff pocket')).toBeTruthy();

    fireEvent.click(chip('Paid'));
    await screen.findByText('Tea cash');
    expect(screen.queryByText('Rent unpaid')).toBeNull();
    expect(screen.queryByText('Auto staff pocket')).toBeNull();

    fireEvent.click(chip('All'));
    await screen.findByText('Rent unpaid');
    expect(screen.getByText('Tea cash')).toBeTruthy();
  });
});
