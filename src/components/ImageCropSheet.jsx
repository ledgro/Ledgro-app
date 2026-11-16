import { useCallback, useEffect, useMemo, useState } from 'react';
import Cropper from 'react-easy-crop';
import { RotateCw, ZoomIn } from 'lucide-react';

const loadImg = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

/** Draw the chosen square (after rotation) into a JPEG file. */
async function cropToFile(url, area, rotation, name) {
  const img = await loadImg(url);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad)); const cos = Math.abs(Math.cos(rad));
  const bw = img.width * cos + img.height * sin; const bh = img.width * sin + img.height * cos;
  // Draw only the chosen square, already scaled down (the final photo is at most 400 px), so a 12 MP photo never becomes a huge canvas.
  const k = Math.min(1, 1024 / area.width);
  const out = document.createElement('canvas'); out.width = Math.round(area.width * k); out.height = Math.round(area.height * k);
  const ox = out.getContext('2d');
  ox.imageSmoothingQuality = 'high';
  ox.scale(k, k); ox.translate(-area.x, -area.y); ox.translate(bw / 2, bh / 2); ox.rotate(rad);
  ox.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.92));
  out.width = 0; out.height = 0;
  return new File([blob], name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

/** Full-screen crop step after picking or taking a photo: drag to move, pinch or slide to zoom, rotate. Square, like the catalog. */
export default function ImageCropSheet({ file, onDone, onCancel }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [area, setArea] = useState(null);
  const [busy, setBusy] = useState(false);
  const onComplete = useCallback((_, px) => setArea(px), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const use = async () => {
    if (!area || busy) return;
    setBusy(true);
    try { onDone(await cropToFile(url, area, rotation, file.name || 'photo')); } catch { onCancel(); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label="Crop photo" data-state="open">
      <div className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 text-center text-sm font-bold text-white">Move and zoom to crop</div>
      <div className="relative flex-1">
        <Cropper image={url} crop={crop} zoom={zoom} rotation={rotation} aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} />
      </div>
      <div className="space-y-4 bg-black px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex items-center gap-3 text-white">
          <ZoomIn size={20} aria-hidden="true" />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label="Zoom" className="flex-1" />
          <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Rotate" className="press rounded-full bg-white/15 p-3"><RotateCw size={20} /></button>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="h-14 flex-1 rounded-xl bg-white/15 font-bold text-white">Cancel</button>
          <button type="button" onClick={use} disabled={busy || !area} className="h-14 flex-[2] rounded-xl bg-blue-600 font-bold text-white disabled:opacity-50">{busy ? 'Please wait...' : 'Use photo'}</button>
        </div>
      </div>
    </div>
  );
}
