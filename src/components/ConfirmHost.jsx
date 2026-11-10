import { useEffect, useState } from 'react';
import { Drawer } from 'vaul';
import { subscribeConfirm } from '../lib/confirm';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { cn } from '../lib/utils';

// Built on the same dialog layer as the other sheets, so it stacks above an open product or
// payment sheet without fighting its focus lock (a plain overlay cannot be tapped there).
export default function ConfirmHost() {
  const [req, setReq] = useState(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  useEffect(() => subscribeConfirm((r) => { setReq(r); setTyped(''); setOpen(true); }), []);

  const answer = (v) => {
    if (!req) return;
    const r = req;
    setOpen(false);
    r.resolve(v);
  };

  const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger, typeToConfirm } = req || {};
  const typedOk = !typeToConfirm || typed.trim().toUpperCase() === String(typeToConfirm).toUpperCase();

  return (
    <Drawer.Root handleOnly repositionInputs={false} open={open} onOpenChange={(o) => { if (!o) answer(false); }} onAnimationEnd={(o) => { if (!o) setReq(null); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="fixed bottom-0 left-0 right-0 z-[101] mx-auto w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] focus:outline-none">
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden="true" />
          <Drawer.Title className="text-center text-lg font-bold text-slate-900">{title || 'Please confirm'}</Drawer.Title>
          <p className="mx-auto mt-2 max-w-xs text-center text-sm text-slate-500 whitespace-pre-line">{message}</p>
          {typeToConfirm && (
            <div className="mt-4">
              <label htmlFor="confirm-typed" className="block text-center text-sm font-bold text-slate-700">Type {typeToConfirm} to confirm</label>
              <input maxLength={40} id="confirm-typed" type="text" autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
                value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={typeToConfirm}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 px-4 text-center font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-red-500" />
            </div>
          )}
          <div className="mt-6 space-y-2">
            <button type="button" disabled={!typedOk} onClick={() => answer(true)} className={cn('press h-14 w-full rounded-2xl font-bold text-white disabled:opacity-40', danger ? 'bg-red-600' : 'bg-blue-600')}>{confirmText}</button>
            <button type="button" onClick={() => answer(false)} className="press glass-btn-flat h-14 w-full rounded-2xl font-bold">{cancelText}</button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
