import { doc, getDoc, getDocFromCache, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// Catalog pictures: small JPEG thumbnails stored as a data URL in shops/{id}/catalogImages/{key}.
// key = groupId for variants (one picture per product), the catalog id otherwise.
// Never used on bills or receipts.
export const MAX_IMAGE_CHARS = 70000;
const MAX_SIDE = 400;

export const imageKey = (item) => item?.groupId || item?.id;

/** Resize and compress a picked file to a small JPEG data URL. */
export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Pick an image file.');
  const bmp = await createImageBitmap(file);
  // Centre-crop to a square so every catalog card and PDF cell lines up.
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const size = Math.min(MAX_SIDE, side);
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, size, size);
  bmp.close?.();
  let q = 0.72;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > MAX_IMAGE_CHARS && q > 0.3) { q -= 0.1; out = canvas.toDataURL('image/jpeg', q); }
  canvas.width = 0; canvas.height = 0;
  if (out.length > MAX_IMAGE_CHARS) throw new Error('Image is too detailed. Try another photo.');
  return out;
}

const cache = new Map(); // key -> Promise<string|null>
const ref = (shopId, key) => doc(db, `shops/${shopId}/catalogImages`, key);

/** Cached read: memory, then Firestore's local cache, then the server. */
export function loadImage(shopId, key) {
  if (!shopId || !key) return Promise.resolve(null);
  const k = `${shopId}/${key}`;
  if (!cache.has(k)) {
    const p = (async () => {
      try {
        let snap;
        try { snap = await getDocFromCache(ref(shopId, key)); } catch { snap = await getDoc(ref(shopId, key)); }
        return snap.exists() ? snap.data().data || null : null;
      } catch { cache.delete(k); return null; }
    })();
    cache.set(k, p);
  }
  return cache.get(k);
}

export async function saveImage(shopId, key, dataUrl, uid) {
  await setDoc(ref(shopId, key), { data: dataUrl, updatedAt: serverTimestamp(), updatedBy: uid });
  cache.set(`${shopId}/${key}`, Promise.resolve(dataUrl));
}

export async function removeImage(shopId, key) {
  await deleteDoc(ref(shopId, key));
  cache.set(`${shopId}/${key}`, Promise.resolve(null));
}
