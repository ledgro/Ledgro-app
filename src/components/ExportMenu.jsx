import { useState } from 'react';

// One-tap PDF export. onPick('pdf') must return a promise.
export default function ExportMenu({ label = 'Export PDF', onPick, className, disabled }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try { await onPick('pdf'); } finally { setBusy(false); }
  };

  return (
    <button type="button" disabled={disabled || busy} onClick={run} className={className}>
      {busy ? 'Working…' : label}
    </button>
  );
}
