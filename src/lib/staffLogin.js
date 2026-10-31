// Username + password logins. Firebase signs in with an email, so a username becomes a hidden email.
export const STAFF_DOMAIN = 'staff.getledgro.com';
export const MIN_PASSWORD = 8;

export const cleanUsername = (u) => String(u || '').trim().toLowerCase();
export const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
export const isStaffEmail = (email) => String(email || '').toLowerCase().endsWith(`@${STAFF_DOMAIN}`);

/** Why a username is not allowed, or '' when fine. Letters, digits, dot, dash, underscore; 3 to 20 characters. */
export function usernameError(u) {
  const v = cleanUsername(u);
  if (v.length < 3 || v.length > 20) return 'Username must be 3 to 20 characters.';
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(v)) return 'Use letters, numbers, dot, dash or underscore only.';
  return '';
}

export const passwordError = (p) => (String(p || '').length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : '');

/** What the person typed on the sign-in screen: a real email stays as it is, a username becomes the hidden email. */
export function toLoginEmail(identifier) {
  const v = String(identifier || '').trim();
  return isEmail(v) ? v.toLowerCase() : `${cleanUsername(v)}@${STAFF_DOMAIN}`;
}

/** Username for staff accounts, real email for others. */
export function displayId(user) {
  const email = user?.email || '';
  return isStaffEmail(email) ? email.split('@')[0] : email;
}

export const usesPassword = (user) => !!user?.providerData?.some((p) => p.providerId === 'password');

/** Friendly text for the common Firebase auth errors. */
export function authMessage(err) {
  switch (err?.code) {
    case 'auth/invalid-credential': case 'auth/wrong-password': case 'auth/user-not-found': case 'auth/invalid-email': return 'Wrong username or password.';
    case 'auth/email-already-in-use': return 'That username or email is already taken.';
    case 'auth/weak-password': return `Password must be at least ${MIN_PASSWORD} characters.`;
    case 'auth/too-many-requests': return 'Too many tries. Wait a few minutes and try again.';
    case 'auth/network-request-failed': return 'No internet. Check your connection.';
    case 'auth/operation-not-allowed': return 'Password sign-in is not turned on yet.';
    case 'auth/requires-recent-login': return 'Sign in again, then retry.';
    default: return 'Something went wrong. Please try again.';
  }
}
