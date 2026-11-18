// Email verification helpers: resend cooldown, typo guard, and the message for each Firebase error.

export const COOLDOWN_MS = 60 * 1000;
const SENT_KEY = 'ledgro_verify_sent_at';
const FAIL_KEY = 'ledgro_verify_send_failed';

/** Where the link in the email lands (the app uses hash routes). */
export const VERIFY_CONTINUE_URL = 'https://ledgro-app.pages.dev/#/setup';

const read = (k) => { try { return sessionStorage.getItem(k) || ''; } catch { return ''; } };
const write = (k, v) => { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch { /* storage blocked */ } };

export const markSent = (now = Date.now()) => { write(SENT_KEY, String(now)); write(FAIL_KEY, ''); };
export const markFailed = (code) => write(FAIL_KEY, code || 'unknown');
export const lastSendFailure = () => read(FAIL_KEY);
export const clearVerifyState = () => { write(SENT_KEY, ''); write(FAIL_KEY, ''); };

/** Seconds left before the next send is allowed (0 = allowed). */
export function cooldownLeft(now = Date.now(), last = Number(read(SENT_KEY)) || 0) {
  return Math.max(0, Math.ceil((last + COOLDOWN_MS - now) / 1000));
}

/** What to tell the user for a failed send or check. Always keeps the Firebase code so it can be reported. */
export function verifyMessage(err) {
  const code = err?.code || '';
  const tag = code ? ` (${code})` : '';
  switch (code) {
    case 'auth/too-many-requests': return 'Too many emails. Wait 30 minutes, or continue with Google.';
    case 'auth/network-request-failed': return 'No internet. Check your connection and try again.';
    case 'auth/user-token-expired': case 'auth/requires-recent-login': return `Sign in again, then retry.${tag}`;
    case 'auth/unauthorized-continue-uri': case 'auth/invalid-continue-uri': return `The email link is not set up for this site yet.${tag}`;
    default: return `Could not complete this step. Try again.${tag}`;
  }
}

const BAD_TLDS = new Set(['con', 'cmo', 'dom', 'coom', 'ocm', 'vom', 'xom', 'cim', 'comm', 'gmail']);
const FIXES = { 'gmial.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'hotmial.com': 'hotmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'outlok.com': 'outlook.com' };

/** A likely typo in the address, or null. { fix } is the corrected address when there is an obvious one. */
export function emailTypo(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 1) return null;
  const domain = e.slice(at + 1);
  const local = e.slice(0, at);
  if (FIXES[domain]) return { fix: `${local}@${FIXES[domain]}` };
  const tld = domain.split('.').pop();
  if (BAD_TLDS.has(tld)) return { fix: null };
  return null;
}
