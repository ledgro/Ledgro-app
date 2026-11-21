// Share / save a generated file (PNG or PDF) in a way that also works on iOS.
import { toast } from 'sonner';
import { isNative } from './native';

// Android app: the WebView has no share sheet or downloads, so write the file to the app cache and hand it to Android's own share sheet.
async function nativeShare(blob, filename, title) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const data = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  try {
    await Share.share({ title, files: [uri], dialogTitle: title || 'Share' });
    return 'shared';
  } catch (err) {
    if (/cancel/i.test(`${err?.message || ''}`)) return 'cancelled';
    throw err;
  }
}

// iOS notes:
//  - navigator.share({files}) only works inside a user tap. If we render the
//    image AFTER the tap (html2canvas takes ~1s) iOS rejects it with
//    NotAllowedError. So callers must pre-render the Blob and call this
//    iOS PWA, so on iOS we go through the share sheet (Save to Files / Photos)

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const MIME = { png: 'image/png', pdf: 'application/pdf' };

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function openInViewer(blob) {
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!w;
}

/**
 * Open the OS share sheet with the file.
 * Returns 'shared' | 'cancelled' | 'unsupported'.
 */
export async function shareFile(blob, filename, title = '') {
  if (isNative) {
    try { return await nativeShare(blob, filename, title); } catch (err) { console.error('native share failed', err); return 'unsupported'; }
  }
  const file = new File([blob], filename, { type: blob.type });
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return 'unsupported';
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    return 'unsupported'; // e.g. NotAllowedError when the tap was too long ago
  }
}

/**
 * Save to the device. Android/desktop: normal download.
 * iOS: share sheet ("Save to Files" / "Save Image"), else viewer tab.
 * Returns true when something was handed to the user.
 */
export async function saveFile(blob, filename, title = '') {
  if (isNative) {
    // "Save" in the app = the share sheet, which offers Save to Drive / Files / WhatsApp.
    const r = await shareFile(blob, filename, title);
    if (r === 'unsupported') toast.error('Could not open the share sheet. Please try again.');
    return r !== 'unsupported';
  }
  if (isIOS()) {
    const r = await shareFile(blob, filename, title);
    if (r === 'shared' || r === 'cancelled') return true;
    // The tap that started this is too old (file was built asynchronously), so iOS
    // refused. Ask for a fresh tap, which is allowed to open the share sheet.
    toast.success('File ready', {
      duration: 30000,
      action: {
        label: 'Save / Share',
        onClick: async () => {
          const again = await shareFile(blob, filename, title);
          if (again === 'unsupported') openInViewer(blob);
        },
      },
    });
    return true;
  }
  triggerDownload(blob, filename);
  return true;
}

export const canvasToBlob = (canvas, type = 'image/png') =>
  new Promise((resolve) => canvas.toBlob(resolve, type));

/** Wrap a canvas in a one-page PDF sized to the image (good for receipts). */
export async function canvasToPdfBlob(canvas) {
  const { jsPDF } = await import('jspdf');
  const wMm = 58;
  const hMm = (canvas.height / canvas.width) * wMm;
  const pdf = new jsPDF({ unit: 'mm', format: [wMm, Math.max(hMm, 20)] });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, wMm, hMm);
  return pdf.output('blob');
}

/** Share several files at once (WhatsApp takes up to 30). Returns 'shared' | 'cancelled' | 'unsupported'. */
export async function shareFiles(files, title = '') {
  if (!files.length) return 'cancelled';
  if (isNative) {
    try {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
      const uris = [];
      for (const { blob, name } of files) {
        const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onloadend = () => resolve(String(r.result).split(',')[1]); r.onerror = reject; r.readAsDataURL(blob); });
        const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
        uris.push(uri);
      }
      try { await Share.share({ title, files: uris, dialogTitle: title || 'Share' }); return 'shared'; } catch (err) {
        if (/cancel/i.test(`${err?.message || ''}`)) return 'cancelled';
        throw err;
      }
    } catch (err) { console.error('native share failed', err); return 'unsupported'; }
  }
  const list = files.map(({ blob, name }) => new File([blob], name, { type: blob.type }));
  if (!(navigator.canShare && navigator.canShare({ files: list }))) return 'unsupported';
  try { await navigator.share({ files: list, title }); return 'shared'; } catch (err) {
    if (err?.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
