import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

// We mock firebase to prevent actual initialization and network calls during tests
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn((auth, cb) => {
    // immediately invoke the callback with null (no user logged in)
    cb(null);
    return vi.fn(); // return an unsubscribe function
  }),
  signInWithPopup: vi.fn(),
  signOut: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  initializeFirestore: vi.fn(),
  persistentLocalCache: vi.fn(),
  persistentMultipleTabManager: vi.fn(),
  CACHE_SIZE_UNLIMITED: 'CACHE_SIZE_UNLIMITED',
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  PersistentCacheIndexManager: vi.fn(),
  enablePersistentCacheIndexAutoCreation: vi.fn()
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({}))
}));

describe('App', () => {
  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeDefined();
  });
});
