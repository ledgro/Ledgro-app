import { useEffect } from 'react';
import { create } from 'zustand';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { memberLabel } from './memberLabel';

export { FORMER_MEMBER, NEW_MEMBER } from './memberLabel';

// Names are read again when a screen opens and they are older than this, so a person who joined
// after the app started gets a name without restarting the app.
const NAMES_TTL_MS = 60 * 1000;

export const useMemberNames = create((set, get) => ({
  names: {},
  current: null, // Set of uids that are members of the shop right now (from the live shop listener)
  loadedFor: null,
  loadedAt: 0,
  loading: false,
  load: async (shopId, { force = false } = {}) => {
    const { loadedFor, loadedAt, loading } = get();
    if (!shopId || loading) return;
    if (!force && loadedFor === shopId && Date.now() - loadedAt < NAMES_TTL_MS) return;
    set({ loading: true });
    try {
      const snap = await getDocs(query(collection(db, `shops/${shopId}/memberProfiles`), limit(100)));
      const names = {};
      snap.forEach((d) => { names[d.id] = d.data().name; });
      set({ names, loadedFor: shopId, loadedAt: Date.now(), loading: false });
    } catch (err) {
      console.error('Failed to load member names', err);
      set({ loading: false });
    }
  },
  setAll: (shopId, names) => set({ names, loadedFor: shopId, loadedAt: Date.now() }),
  setCurrent: (uids) => set({ current: new Set(uids) }),
  remember: (uid, name) => set((s) => ({ names: { ...s.names, [uid]: name } })),
}));

export function useNameOf(shopId, selfUid) {
  const names = useMemberNames((s) => s.names);
  const current = useMemberNames((s) => s.current);
  const load = useMemberNames((s) => s.load);
  useEffect(() => { load(shopId); }, [load, shopId]);
  return (uid) => memberLabel(uid, { selfUid, names, current });
}

export async function syncMyProfile(shopId, user) {
  const name = (user.displayName || user.email?.split('@')[0] || '').trim().slice(0, 80);
  if (!name) return;
  const key = `ledgro_profile_${shopId}_${user.uid}`;
  try { if (localStorage.getItem(key) === name) return; } catch { /* storage blocked */ }
  try {
    await setDoc(doc(db, `shops/${shopId}/memberProfiles/${user.uid}`), { name, updatedAt: serverTimestamp() });
    useMemberNames.getState().remember(user.uid, name);
    try { localStorage.setItem(key, name); } catch { /* storage blocked */ }
  } catch (err) {
    console.warn('Could not save member name', err);
  }
}
