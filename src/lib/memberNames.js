import { useEffect } from 'react';
import { create } from 'zustand';
import { collection, doc, getDocs, limit, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const FORMER_MEMBER = 'Former member';

export const useMemberNames = create((set, get) => ({
  names: {},
  loadedFor: null,
  loading: false,
  load: async (shopId) => {
    const { loadedFor, loading } = get();
    if (!shopId || loading || loadedFor === shopId) return;
    set({ loading: true });
    try {
      const snap = await getDocs(query(collection(db, `shops/${shopId}/memberProfiles`), limit(100)));
      const names = {};
      snap.forEach((d) => { names[d.id] = d.data().name; });
      set({ names, loadedFor: shopId, loading: false });
    } catch (err) {
      console.error('Failed to load member names', err);
      set({ loading: false });
    }
  },
  remember: (uid, name) => set((s) => ({ names: { ...s.names, [uid]: name } })),
}));

export function useNameOf(shopId, selfUid) {
  const names = useMemberNames((s) => s.names);
  const load = useMemberNames((s) => s.load);
  useEffect(() => { load(shopId); }, [load, shopId]);
  return (uid) => {
    if (!uid) return '';
    if (uid === selfUid) return 'You';
    return names[uid] || FORMER_MEMBER;
  };
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
