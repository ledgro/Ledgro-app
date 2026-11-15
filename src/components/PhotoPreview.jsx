import { useEffect } from 'react';
import { X } from 'lucide-react';

/** Tap a photo to see it big. Closes on the backdrop, X, Escape or the phone Back button. */
export default function PhotoPreview({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Photo" data-state="open" onClick={onClose}>
      <img src={src} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
      <button type="button" onClick={onClose} aria-label="Close" className="press absolute right-4 top-[max(1rem,env(safe-area-inset-top))] rounded-full bg-white/20 p-3 text-white"><X size={22} /></button>
    </div>
  );
}
