import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

const MAX_PER_SESSION = 5;
let ctx = null;
let sent = 0;
const seen = new Set();

export function setLogContext(next) {
  ctx = next;
}

export function logError(err) {
  if (!ctx || !navigator.onLine || sent >= MAX_PER_SESSION) return;
  const msg = String(err?.message || err || 'Unknown error').slice(0, 300);
  if (seen.has(msg)) return;
  seen.add(msg);
  sent += 1;
  addDoc(collection(db, `shops/${ctx.shopId}/errorLogs`), {
    msg,
    stack: String(err?.stack || '').slice(0, 1500),
    screen: window.location.pathname.slice(0, 100),
    uid: ctx.uid,
    createdAt: serverTimestamp(),
  }).catch(() => {});
}
