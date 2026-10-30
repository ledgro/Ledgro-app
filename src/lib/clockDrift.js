/**
 * Server time, measured fresh on every call (never cached, so changing the phone
 * clock later cannot fool it). Reads the hosting Date header. No fallback to the
 * phone clock: if the server time cannot be read, it throws and nothing is saved.
 */
export async function serverNow() {
  // A path no service worker caches (a cached copy would carry an old Date header). Any status is fine: only the header is read.
  // Two tries: the first request on a slow or waking connection (common on phones) can time out.
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 6000);
    try {
      const start = Date.now();
      const res = await fetch(`/__/time?_t=${start}`, { method: 'GET', cache: 'no-store', signal: controller.signal });
      const end = Date.now();
      const header = res.headers.get('date');
      const rtt = end - start;
      if (!header || rtt > 5000) throw new Error('CLOCK');
      const serverTime = new Date(header).getTime();
      if (Number.isNaN(serverTime)) throw new Error('CLOCK');
      // server time at the moment the response arrived
      return new Date(serverTime + rtt / 2);
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(t);
    }
  }
  console.warn('serverNow failed', last);
  throw new Error('CLOCK');
}

export const CLOCK_MSG = 'Could not read server time. Check internet and try again. Nothing was saved.';
