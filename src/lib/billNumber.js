// Bill numbers must not collide across devices: uid prefix + per-device tag + daily counter.
function getDeviceTag() {
  try {
    let tag = localStorage.getItem('ledgro_device_tag');
    if (!tag) {
      tag = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => (b % 36).toString(36)).join('').toUpperCase();
      localStorage.setItem('ledgro_device_tag', tag);
    }
    return tag;
  } catch {
    return 'ZZ';
  }
}

export function generateBillNumber(uid) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dateKey = `billSeq_${dd}${mm}${now.getFullYear()}`;

  const current = parseInt(localStorage.getItem(dateKey) || '0') + 1;
  localStorage.setItem(dateKey, current.toString());

  const prefix = uid ? uid.slice(0, 2).toUpperCase() : 'XX';
  const seq = String(current).padStart(3, '0');

  return `${prefix}${getDeviceTag()}-${dd}${mm}-${seq}`;
}
