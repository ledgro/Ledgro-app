import { createUserWithEmailAndPassword, deleteUser, signOut as authSignOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, getStaffCreateAuth } from '../firebase';
import { cleanUsername, toLoginEmail, usernameError, passwordError } from './staffLogin';

/**
 * Owner creates a login for a staff member: makes the account on a separate connection (the owner stays
 * signed in), then adds it to the shop as a member. If adding fails the new account is deleted again.
 */
export async function createStaffLogin({ shopId, username, password }) {
  const uErr = usernameError(username);
  if (uErr) throw Object.assign(new Error(uErr), { userFacing: true });
  const pErr = passwordError(password);
  if (pErr) throw Object.assign(new Error(pErr), { userFacing: true });

  const sAuth = getStaffCreateAuth();
  const cred = await createUserWithEmailAndPassword(sAuth, toLoginEmail(cleanUsername(username)), password);
  try {
    await updateDoc(doc(db, 'shops', shopId), { [`members.${cred.user.uid}`]: 'member', updatedAt: serverTimestamp() });
  } catch (err) {
    try { await deleteUser(cred.user); } catch { /* the account stays unused */ }
    throw err;
  } finally {
    try { await authSignOut(sAuth); } catch { /* nothing stored */ }
  }
  return cleanUsername(username);
}
