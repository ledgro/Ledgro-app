/** Forgiving phone input: "+91 98765-43210", "098765 43210", "(98765) 43210" all become 9876543210. Anything else is only tidied, never rejected. */
export function normalizePhone(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let d = s.replace(/[^\d+]/g, '');
  const plus = d.startsWith('+');
  d = d.replace(/\+/g, '');
  if (!plus && d.startsWith('00')) d = d.slice(2);
  // Indian mobile numbers (start 6-9) lose a +91 / 91 / 0 prefix; landlines with an STD code are left as typed.
  const m = d.match(/^(?:91|0)?([6-9]\d{9})$/);
  if (m) return m[1];
  return plus ? `+${d}` : d;
}
