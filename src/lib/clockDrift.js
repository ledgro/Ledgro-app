export async function measureClockDrift() {
  try {
    const start = Date.now();
    const res = await fetch('/', { method: 'HEAD', cache: 'no-store' });
    const end = Date.now();
    const serverDate = res.headers.get('date');

    if (serverDate) {
      const serverTime = new Date(serverDate).getTime();
      const rtt = end - start;
      const estimatedServerTime = serverTime + (rtt / 2);
      const offset = estimatedServerTime - Date.now();

      // If offset > 2 minutes (120000ms), warn
      if (Math.abs(offset) > 120000) {
        window.dispatchEvent(new CustomEvent('clock:drift_detected', { detail: { offset } }));
      }
      return offset;
    }
  } catch (e) {
    console.error("Failed to measure clock drift", e);
  }
  return 0;
}
