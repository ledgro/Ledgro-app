// In-app confirm dialog. `await confirm({...})` resolves true or false.
// Rendered by <ConfirmHost /> (mounted once in App). Falls back to false if no host is mounted.
let listener = null;

export function confirm(opts) {
  const o = typeof opts === 'string' ? { message: opts } : opts;
  return new Promise((resolve) => {
    if (!listener) { resolve(false); return; }
    listener({ ...o, resolve });
  });
}

export function subscribeConfirm(fn) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}
