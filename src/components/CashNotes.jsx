import { useState } from 'react';

const NOTES = [500, 200, 100, 50, 20, 10, 5, 2, 1];

/** Count by notes and coins. Calls onTotal(rupees) as numbers change; one tap on a row's + or - adjusts it. */
export default function CashNotes({ onTotal }) {
  const [qty, setQty] = useState({});

  const set = (d, n) => {
    const next = { ...qty, [d]: Math.max(0, Math.min(9999, n)) };
    setQty(next);
    onTotal(NOTES.reduce((a, x) => a + x * (next[x] || 0), 0));
  };

  const total = NOTES.reduce((a, d) => a + d * (qty[d] || 0), 0);
  return (
    <div className="space-y-2">
      {NOTES.map((d) => (
        <div key={d} className="flex items-center gap-3">
          <span className="w-14 text-right text-sm font-bold text-slate-700">₹{d}</span>
          <span className="text-slate-400">×</span>
          <button type="button" aria-label={`Less ${d}`} onClick={() => set(d, (qty[d] || 0) - 1)} className="h-10 w-10 rounded-full bg-slate-100 font-black text-slate-600 active:bg-slate-200">-</button>
          <input type="number" inputMode="numeric" min="0" value={qty[d] ?? ''} placeholder="0"
            onChange={(e) => set(d, parseInt(e.target.value, 10) || 0)}
            className="h-10 w-16 rounded-lg border border-slate-200 bg-white text-center text-base font-bold text-slate-900" />
          <button type="button" aria-label={`More ${d}`} onClick={() => set(d, (qty[d] || 0) + 1)} className="h-10 w-10 rounded-full bg-slate-100 font-black text-slate-600 active:bg-slate-200">+</button>
          <span className="ml-auto text-sm font-semibold tabular-nums text-slate-500">{qty[d] ? `₹${(d * qty[d]).toLocaleString('en-IN')}` : ''}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-black text-slate-900">
        <span>Total counted</span><span className="tabular-nums">₹{total.toLocaleString('en-IN')}</span>
      </div>
    </div>
  );
}
