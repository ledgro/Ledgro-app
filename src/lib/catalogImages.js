import { planImages, renderCardPng, safeFileName, defaultImageOptions } from './catalogPng';

export const MAX_SHARE_FILES = 30; // WhatsApp takes at most 30 pictures per send

/**
 * Draws one picture per product colour, one at a time so a big catalog never freezes the phone.
 * Returns { files: [{ blob, name }], failed: [cardName], cancelled }.
 */
export async function makeImages({ items, options, getImage, shopName, onProgress, isCancelled = () => false }) {
  const o = { ...defaultImageOptions, ...options };
  const { cards } = planImages(items, o);
  const files = []; const failed = [];
  const taken = new Set();
  for (let i = 0; i < cards.length; i++) {
    if (isCancelled()) return { files, failed, cancelled: true };
    onProgress?.(i, cards.length);
    try {
      const blob = await renderCardPng(cards[i], o, { getImage, shopName });
      files.push({ blob, name: safeFileName(cards[i].name, 'png', taken) });
    } catch (err) {
      console.error(err);
      failed.push(cards[i].name);
    }
    await new Promise((r) => setTimeout(r, 0)); // let the screen breathe between pictures
  }
  onProgress?.(cards.length, cards.length);
  return { files, failed, cancelled: false };
}

export async function zipFiles(files) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  files.forEach(({ blob, name }) => zip.file(name, blob));
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
}
