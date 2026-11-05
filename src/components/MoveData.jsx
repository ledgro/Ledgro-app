import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { ArrowRightLeft } from 'lucide-react';
import { db } from '../firebase';
import { useCatalogStore } from '../store/catalogStore';
import { saveFile } from '../lib/shareFile';
import { buildProductsExport, parseProductsExport, planImport, toPayload } from '../lib/moveData';
import { logActivity } from '../lib/audit';

const BATCH = 400;
const btn = 'w-full h-12 rounded-xl font-bold';

/** Owner only. Move products to another shop through a file, with a preview before anything is written. */
export default function MoveData({ shopId, uid }) {
  const items = useCatalogStore((s) => s.items);
  const addItem = useCatalogStore((s) => s.addItem);
  const [stock, setStock] = useState(false);
  const [cost, setCost] = useState(false);
  const [plan, setPlan] = useState(null);
  const [mode, setMode] = useState('skip');
  const [busy, setBusy] = useState('');
  const fileRef = useRef(null);

  const doExport = async () => {
    const data = buildProductsExport(items, { stock, cost });
    if (!data.count) { toast.error('No products to export.'); return; }
    try {
      await saveFile(new Blob([JSON.stringify(data)], { type: 'application/json' }), `ledgro-products-${Date.now()}.json`, 'Ledgro products');
      toast.success(`${data.count} products exported.`);
    } catch (err) {
      console.error(err);
      toast.error('Export failed.');
    }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) { toast.error('File is too large.'); return; }
    const { items: incoming, error } = parseProductsExport(await f.text());
    if (error) { toast.error(error); return; }
    setPlan(planImport(items, incoming));
  };

  const doImport = async () => {
    if (!plan || busy) return;
    if (!navigator.onLine) { toast.error('You are offline. Nothing was imported.'); return; }
    setBusy('Importing...');
    try {
      const groups = new Map();
      const groupFor = (old) => {
        if (!groups.has(old)) groups.set(old, doc(collection(db, `shops/${shopId}/catalog`)).id.slice(0, 20));
        return groups.get(old);
      };
      const created = [];
      let wrote = 0;
      const ops = [
        ...plan.fresh.map((it) => ['new', it]),
        ...(mode === 'update' ? plan.dupes.map((d) => ['upd', d]) : []),
      ];
      for (let i = 0; i < ops.length; i += BATCH) {
        const batch = writeBatch(db);
        for (const [kind, x] of ops.slice(i, i + BATCH)) {
          if (kind === 'new') {
            const ref = doc(collection(db, `shops/${shopId}/catalog`));
            batch.set(ref, toPayload(x, { groupFor, uid, serverTimestamp }));
            created.push({ ...toPayload(x, { groupFor, uid, serverTimestamp: () => new Date() }), id: ref.id });
          } else {
            batch.update(doc(db, `shops/${shopId}/catalog`, x.existing.id), { lastUsedPrice: x.incoming.price, updatedBy: uid, updatedAt: serverTimestamp() });
          }
          wrote += 1;
        }
        if (i + BATCH >= ops.length) logActivity(batch, shopId, uid, { action: 'import', amount: wrote, note: `${plan.fresh.length} new products` });
        await batch.commit();
        setBusy(`Importing... ${Math.min(i + BATCH, ops.length)} of ${ops.length}`);
      }
      created.forEach((c) => addItem(c));
      toast.success(`Imported ${plan.fresh.length} new products${mode === 'update' ? ` and updated ${plan.dupes.length} prices` : ''}.`);
      setPlan(null);
    } catch (err) {
      console.error(err);
      toast.error(`Import stopped (${err.code || 'error'}). Products already written stay; run it again to add the rest.`);
    } finally { setBusy(''); }
  };

  return (
    <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 space-y-3">
      <div className="flex items-center gap-2 text-slate-900 font-bold"><ArrowRightLeft size={20} className="text-blue-600" /><h2>Move products to another shop</h2></div>
      <p className="text-xs text-slate-500">Export a file here, then open it in the other shop. Photos, bills and staff are not included.</p>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={stock} onChange={(e) => setStock(e.target.checked)} /> Include stock counts</label>
      <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={cost} onChange={(e) => setCost(e.target.checked)} /> Include cost prices</label>
      <button type="button" onClick={doExport} className={`${btn} bg-slate-100 text-slate-800`}>Export products</button>
      <button type="button" onClick={() => fileRef.current?.click()} className={`${btn} bg-blue-600 text-white`}>Import products from a file</button>
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={pick} />
      {plan && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <p className="text-sm font-semibold text-slate-900">{plan.fresh.length} new products. {plan.dupes.length} already in this shop.</p>
          {plan.dupes.length > 0 && (
            <div className="flex gap-2" role="radiogroup" aria-label="Existing products">
              {[['skip', 'Skip existing'], ['update', 'Update their prices']].map(([v, l]) => (
                <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={`flex-1 h-10 rounded-lg text-sm font-bold ${mode === v ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{l}</button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPlan(null)} className="flex-1 h-11 rounded-xl bg-slate-100 font-bold text-slate-700">Cancel</button>
            <button type="button" disabled={!!busy || (!plan.fresh.length && mode !== 'update')} onClick={doImport} className="flex-1 h-11 rounded-xl bg-slate-900 font-bold text-white disabled:opacity-40">{busy || 'Import'}</button>
          </div>
        </div>
      )}
    </section>
  );
}
