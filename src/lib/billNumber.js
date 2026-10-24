// Short bill number: DDMM-TT-NN, e.g. 1510-K7-07.
// TT = random 2-char tag per device, NN = that device's count for the day, so two phones never clash.
let memTag = null;
let memSeq = 0;
function getDeviceTag() {
  try {
    let tag = localStorage.getItem('ledgro_device_tag');
    if (!tag || tag.length !== 2) {
      tag = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => (b % 36).toString(36)).join('').toUpperCase();
      localStorage.setItem('ledgro_device_tag', tag);
    }
    return tag;
  } catch {
    // Storage blocked: keep a random tag for this session so two phones still differ.
    if (!memTag) memTag = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => (b % 36).toString(36)).join('').toUpperCase();
    return memTag;
  }
}

export function generateBillNumber() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dateKey = `billSeq_${dd}${mm}${now.getFullYear()}`;
  let current = 1;
  try {
    current = parseInt(localStorage.getItem(dateKey) || '0', 10) + 1;
    localStorage.setItem(dateKey, String(current));
  } catch { current = ++memSeq; }
  return `${dd}${mm}-${getDeviceTag()}-${String(current).padStart(2, '0')}`;
}
