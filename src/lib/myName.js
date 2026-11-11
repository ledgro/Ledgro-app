import { useEffect } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useMemberNames } from './memberNames';

const cap = (n) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n);
const fromAccount = (user) => (user?.displayName || user?.email?.split('@')[0]?.replace(/[._0-9]+/g, ' ') || '').trim();

/** The name shown on Home and Profile: the saved profile name, else the Google name, else the email name, else the shop name. */
export function useMyName(shopId, user, shopName) {
  const saved = useMemberNames((s) => s.names[user?.uid]);
  const load = useMemberNames((s) => s.load);
  useEffect(() => { load(shopId); }, [load, shopId]);
  return cap((saved || fromAccount(user) || shopName || 'there').trim());
}

/** Save the name to the shop's member profile (the same record the Members page reads). */
export async function saveMyName(shopId, user, name) {
  const clean = name.trim().slice(0, 30);
  if (!shopId || !user?.uid || !clean) return false;
  await setDoc(doc(db, `shops/${shopId}/memberProfiles/${user.uid}`), { name: clean, updatedAt: serverTimestamp() });
  useMemberNames.getState().remember(user.uid, clean);
  // Mark the Google name as already synced so the next sign-in does not overwrite a name the person chose.
  try { localStorage.setItem(`ledgro_profile_${shopId}_${user.uid}`, fromAccount(user).slice(0, 80)); } catch { /* storage blocked */ }
  return true;
}
