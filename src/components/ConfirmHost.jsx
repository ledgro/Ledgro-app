import { useEffect, useState } from 'react';
import { subscribeConfirm } from '../lib/confirm';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { cn } from '../lib/utils';

export default function ConfirmHost() {
  const [req, setReq] = useState(null);

  useEffect(() => subscribeConfirm(setReq), []);

  const close = (v) => {
    req?.resolve(v);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!req) return null;
  const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger } = req;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/50 p-3" style={{ bottom: sheetStyle.bottom }} onClick={() => close(false)} role="presentation">
      <div role="alertdialog" aria-modal="true" aria-label={title || message} className="w-full max-w-sm bg-white rounded-2xl p-5 shadow-xl max-h-full overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
        <p className={cn('text-sm text-slate-600 whitespace-pre-line', title && 'mt-1')}>{message}</p>
        <div className="mt-5 flex gap-3">
          <button type="button" onClick={() => close(false)} className="flex-1 h-12 rounded-xl bg-slate-100 text-slate-700 font-bold active:scale-95 transition-transform">{cancelText}</button>
          <button type="button" autoFocus onClick={() => close(true)} className={cn('flex-1 h-12 rounded-xl text-white font-bold active:scale-95 transition-transform', danger ? 'bg-red-600' : 'bg-blue-600')}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}
