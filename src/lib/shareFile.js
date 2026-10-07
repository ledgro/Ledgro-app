// Share / save a generated file (PNG or PDF) in a way that also works on iOS.
//
import { toast } from 'sonner';

// iOS notes:
//  - navigator.share({files}) only works inside a user tap. If we render the
//    image AFTER the tap (html2canvas takes ~1s) iOS rejects it with
//    NotAllowedError. So callers must pre-render the Blob and call this
//    synchronously from the click handler.
//  - <a download> on a blob does nothing useful in an installed (standalone)
//    iOS PWA, so on iOS we go through the share sheet (Save to Files / Photos)
//    and fall back to opening the file in a viewer tab.

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
  const wMm = 80; // receipt roll width
  const hMm = (canvas.height / canvas.width) * wMm;
  const pdf = new jsPDF({ unit: 'mm', format: [wMm, Math.max(hMm, 20)] });
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, wMm, hMm);
  return pdf.output('blob');
}
