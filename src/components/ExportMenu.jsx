import { useState } from 'react';
import { cn } from '../lib/utils';

// Small PNG / PDF chooser. onPick(format) must return a promise.
export default function ExportMenu({ label = 'Export', onPick, className, disabled }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async (fmt) => {
    setBusy(true);
    try { await onPick(fmt); } finally { setBusy(false); setOpen(false); }
  };

  if (!open) {
    return (
      <button type="button" disabled={disabled || busy} onClick={() => setOpen(true)} className={className}>
        {busy ? 'Working…' : label}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      {['pdf', 'png'].map((f) => (
        <button key={f} type="button" disabled={busy} onClick={() => pick(f)}
          className={cn('px-3 py-1.5 rounded-full text-xs font-black uppercase bg-slate-900 text-white active:scale-95 disabled:opacity-50')}>
          {f}
        </button>
      ))}
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-400 px-1" aria-label="Cancel">✕</button>
    </div>
  );
}
