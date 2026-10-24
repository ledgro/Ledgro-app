import { useState } from 'react';
import { formatCurrency } from '../lib/utils';

const METHODS = ['cash', 'upi', 'split'];

/** Change how a bill was paid. total and the saved parts are in paise. */
export default function PaymentEditor({ method, cash, total, saving, onSave, onCancel }) {
  const [pick, setPick] = useState(method);
  const [splitCash, setSplitCash] = useState(method === 'split' && cash ? String(cash / 100) : '');

  const cashPaise = Math.round((parseFloat(splitCash) || 0) * 100);
  const splitOk = cashPaise > 0 && cashPaise < total;
  const unchanged = pick === method && pick !== 'split';
  const disabled = saving || unchanged || (pick === 'split' && !splitOk);

  return (
    <div className="space-y-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Paid via</p>
      <div className="flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Payment method">
        {METHODS.map((m) => (
          <button key={m} type="button" onClick={() => setPick(m)}
            className={`flex-1 rounded-lg py-2 text-sm font-bold uppercase tracking-wider transition-all ${pick === m ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>
            {m}
          </button>
        ))}
      </div>
      {pick === 'split' && (
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-500">Cash received</label>
          <input type="number" inputMode="decimal" min="0" value={splitCash} onChange={(e) => setSplitCash(e.target.value)}
            className="h-12 w-full rounded-xl border border-slate-200 px-3 font-bold focus:outline-none focus:ring-2 focus:ring-slate-900" />
          <p className="mt-1 text-xs text-slate-500">
            UPI: {formatCurrency(splitOk ? total - cashPaise : 0)} of {formatCurrency(total)}
          </p>
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="h-12 flex-1 rounded-xl bg-slate-100 font-bold text-slate-600">Cancel</button>
        <button type="button" disabled={disabled} onClick={() => onSave(pick, cashPaise)}
          className="h-12 flex-1 rounded-xl bg-blue-600 font-bold text-white disabled:opacity-40">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
