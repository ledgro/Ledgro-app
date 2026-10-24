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

  useEffect(() => subscribeConfirm((r) => { setReq(r); setOpen(true); }), []);

  const answer = (v) => {
    if (!req) return;
    const r = req;
    setOpen(false);
    r.resolve(v);
  };

  const { title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger } = req || {};

  return (
    <Drawer.Root handleOnly repositionInputs={false} open={open} onOpenChange={(o) => { if (!o) answer(false); }} onAnimationEnd={(o) => { if (!o) setReq(null); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[100] bg-black/50" />
        <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="fixed bottom-0 left-0 right-0 z-[101] mx-auto w-full max-w-md rounded-t-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] focus:outline-none">
          <Drawer.Title className="text-lg font-bold text-slate-900">{title || 'Please confirm'}</Drawer.Title>
          <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{message}</p>
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={() => answer(false)} className="h-12 flex-1 rounded-xl bg-slate-100 font-bold text-slate-700 active:scale-95 transition-transform">{cancelText}</button>
            <button type="button" onClick={() => answer(true)} className={cn('h-12 flex-1 rounded-xl font-bold text-white active:scale-95 transition-transform', danger ? 'bg-red-600' : 'bg-blue-600')}>{confirmText}</button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
