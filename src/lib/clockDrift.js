let driftWarningFired = false;
let cachedOffset = null;

// Measure clock drift
export async function measureClockDrift() {
  if (cachedOffset !== null) return cachedOffset;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const start = Date.now();
    // Use GET with a cache buster to bypass service worker caching and avoid 405s
    const res = await fetch(`/?_sw_bypass=${start}`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const end = Date.now();
    const serverDate = res.headers.get('date');

    if (serverDate) {
      const serverTime = new Date(serverDate).getTime();
      const rtt = end - start;

      // If the round trip took longer than 3 seconds, the network is too unstable to calculate a reliable offset.
      if (rtt > 3000) {
        console.warn("RTT too high to accurately measure clock drift.");
        return null;
      }

      const estimatedServerTime = serverTime + (rtt / 2);
      const offset = estimatedServerTime - end; // subtract `end`, not `Date.now()` again

      cachedOffset = offset;

      // If offset > 2 minutes (120000ms), warn once per session
      if (Math.abs(offset) > 120000 && !driftWarningFired) {
        driftWarningFired = true;
        window.dispatchEvent(new CustomEvent('clock:drift_detected', { detail: { offset } }));
      }
      return offset;
    }
  } catch (e) {
    clearTimeout(timeoutId);
    console.warn("Failed to measure clock drift", e);
  }
  return null;
}

/** Server-corrected "now". Uses the hosting Date header offset, falls back to the phone clock. No cloud function. */
export async function serverNow() {
  const offset = (await measureClockDrift()) || 0;
  return new Date(Date.now() + offset);
}
