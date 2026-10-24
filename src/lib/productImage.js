import { doc, getDoc, getDocFromCache, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { colourOf } from './variants';

// Catalog pictures: small JPEG thumbnails stored as a data URL in shops/{id}/catalogImages/{key}.
// key = groupId~colour for variants with a colour option (one picture per colour),
// groupId for other variants, the catalog id otherwise. Older pictures saved under groupId still show.
// Never used on bills or receipts.
export const MAX_IMAGE_CHARS = 70000;
const MAX_SIDE = 400;

const slug = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
export const imageKey = (item) => {
  if (!item?.groupId) return item?.id;
  const c = colourOf(item);
  return c ? `${item.groupId}~${slug(c) || 'x'}` : item.groupId;
};
/** Picture of an item: its own colour first, then the product-wide one saved earlier. */
export async function loadItemImage(shopId, item) {
  const own = await loadImage(shopId, imageKey(item));
  if (own || !item?.groupId) return own;
  return loadImage(shopId, item.groupId);
}

/** Resize and compress a picked file to a small JPEG data URL. */
export async function compressImage(file) {
  if (!file || !file.type?.startsWith('image/')) throw new Error('Pick an image file.');
  // createImageBitmap is missing on older iOS; fall back to an <img> element.
  const bmp = typeof createImageBitmap === 'function'
    ? await createImageBitmap(file)
    : await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); im.width = im.naturalWidth; im.height = im.naturalHeight; resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')); };
      im.src = url;
    });
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
        const d = snap.exists() ? snap.data().data : null;
        return typeof d === 'string' && d.startsWith('data:image/jpeg;base64,') ? d : null;
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
