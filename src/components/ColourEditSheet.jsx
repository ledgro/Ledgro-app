import { useMemo, useState } from 'react';
import { Drawer } from 'vaul';
import { toast } from 'sonner';
import { Trash2, Undo2 } from 'lucide-react';
import { doc, collection, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useCatalogStore } from '../store/catalogStore';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { planColourEdit, axesOf } from '../lib/colourEdit';
import { sizeLabelOf, parseValues } from '../lib/variants';
import { loadImage, saveImage, removeImage, imageKey } from '../lib/productImage';
import { confirm } from '../lib/confirm';

const field = 'w-full px-4 h-12 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-medium text-slate-900';
const toText = (paise) => (paise == null ? '' : String(paise / 100));

/** Edit one product in one colour as a whole: details, colour name and sizes (add, restock, remove) in one place. */
export default function ColourEditSheet({ entry, groupItems, isAdmin, onClose }) {
  const { shopId, user } = useAuth();
  const catalog = useCatalogStore((s) => s.items);
  const addItem = useCatalogStore((s) => s.addItem);
  const removeItem = useCatalogStore((s) => s.removeItem);
  const rep = entry.rep;
  const { colourAxis, sizeAxis } = useMemo(() => axesOf(entry.items), [entry.items]);
  const [f, setF] = useState(() => ({
    base: entry.name, colour: entry.colour, price: toText(rep.lastUsedPrice), cost: toText(rep.costPrice), category: rep.category || '',
    lowStock: rep.lowStockAlert != null ? String(rep.lowStockAlert) : '', active: rep.isActive !== false, newSizes: '',
  }));
  const [rows, setRows] = useState(() => entry.items.map((i) => ({ id: i.id, stock: i.stockCount == null ? '' : String(i.stockCount), remove: false })));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const patchRow = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const adding = parseValues(f.newSizes);

  const save = async () => {
    if (busy) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const plan = planColourEdit({ entry, groupItems, allItems: catalog, form: { ...f, rows } });
    if (plan.error) { toast.error(plan.error); return; }
    if (plan.removes.length) {
      const names = entry.items.filter((i) => plan.removes.includes(i.id)).map(sizeLabelOf).join(', ');
      const ok = await confirm({
        title: `Remove size ${names}?`,
        message: isAdmin ? 'These sizes are deleted from the catalog. Old bills keep them.' : 'Only an admin can delete, so these sizes are hidden instead.',
        confirmText: 'Remove', danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const col = (id) => doc(db, `shops/${shopId}/catalog`, id);
      const ops = [];
      const mirror = [];
      plan.updates.forEach((u) => {
        const data = { ...u.data, updatedBy: user.uid, updatedAt: serverTimestamp() };
        if (u.stockDiff) data.stockCount = increment(u.stockDiff);
        else if (u.stockSet !== undefined) data.stockCount = u.stockSet;
        ops.push((b) => b.update(col(u.id), data));
        const cur = catalog.find((i) => i.id === u.id);
        if (cur) mirror.push(() => addItem({ ...cur, ...u.data, stockCount: u.stockAfter, updatedBy: user.uid }));
      });
      plan.removes.forEach((id) => {
        ops.push((b) => b.update(col(id), isAdmin ? { deleted: true, isActive: false, updatedBy: user.uid, updatedAt: serverTimestamp() } : { isActive: false, updatedBy: user.uid, updatedAt: serverTimestamp() }));
        const cur = catalog.find((i) => i.id === id);
        mirror.push(() => (isAdmin ? removeItem(id) : cur && addItem({ ...cur, isActive: false })));
      });
      plan.creates.forEach((c) => {
        const ref = doc(collection(db, `shops/${shopId}/catalog`));
        ops.push((b) => b.set(ref, { ...c, createdBy: user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
        mirror.push(() => addItem({ ...c, id: ref.id, createdBy: user.uid, createdAt: new Date(), updatedAt: new Date() }));
      });
      for (let i = 0; i < ops.length; i += 15) {
        const batch = writeBatch(db);
        ops.slice(i, i + 15).forEach((op) => op(batch));
        await batch.commit();
      }
      mirror.forEach((m) => m());
      // The colour's photo is stored under its colour name, so a renamed colour takes it along.
      if (plan.colourChanged && !plan.merged && entry.items.some((i) => i.hasImage)) {
        try {
          const oldKey = imageKey(rep);
          const newKey = imageKey({ ...rep, options: plan.updates[0]?.data.options || rep.options });
          const img = await loadImage(shopId, oldKey);
          if (img && newKey !== oldKey) { await saveImage(shopId, newKey, img, user.uid); if (entry.colour) await removeImage(shopId, oldKey); }
        } catch (err) { console.error(err); toast.error('Saved, but the photo could not move to the new colour name.'); }
      }
      toast.success('Product updated');
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(`Could not save everything (${err?.code || 'error'}). Open the product again to check.`);
    } finally { setBusy(false); }
  };

  return (
    <Drawer.Root handleOnly repositionInputs={false} open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
        <Drawer.Content style={sheetStyle} className="bg-white flex flex-col rounded-t-[20px] mt-24 max-h-[85vh] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none overflow-hidden">
          <div className="p-4 flex-shrink-0 border-b border-slate-100 flex items-center justify-between">
            <Drawer.Title className="font-bold text-slate-900 text-xl truncate">{entry.name}{entry.colour ? ` - ${entry.colour}` : ''}</Drawer.Title>
            <button aria-label="Close" onClick={() => !busy && onClose()} className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-full text-slate-500">✕</button>
          </div>
          <Drawer.Description className="sr-only">Edit this product and its sizes</Drawer.Description>

          <div className="flex-1 overflow-y-auto p-4 pb-[200px] space-y-5">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Product name (all colours)</label>
                <input className={field} value={f.base} maxLength={90} onChange={set('base')} />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Colour{colourAxis ? '' : ' (none yet, type one to add it)'}</label>
                <input className={field} value={f.colour} maxLength={30} onChange={set('colour')} placeholder="e.g. Black" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Price (all sizes)</label>
                  <input className={field} type="number" inputMode="decimal" step="0.01" value={f.price} onChange={set('price')} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Cost price</label>
                  <input className={field} type="number" inputMode="decimal" step="0.01" value={f.cost} onChange={set('cost')} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                  <input className={field} value={f.category} maxLength={40} onChange={set('category')} placeholder="Men, Ladies, Kids" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Low stock alert</label>
                  <input className={field} type="number" inputMode="numeric" value={f.lowStock} onChange={set('lowStock')} />
                </div>
              </div>
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                <input type="checkbox" checked={f.active} onChange={(e) => setF((p) => ({ ...p, active: e.target.checked }))} className="w-5 h-5 rounded border-slate-300" />
                Active (shows in billing)
              </label>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Sizes and stock</h3>
              {entry.items.map((it) => {
                const r = rows.find((x) => x.id === it.id);
                return (
                  <div key={it.id} className={`flex items-center gap-3 rounded-xl border p-2 ${r.remove ? 'border-red-200 bg-red-50' : 'border-slate-200'}`}>
                    <span className={`w-16 text-center text-base font-bold ${r.remove ? 'text-red-600 line-through' : 'text-slate-900'}`}>{sizeLabelOf(it) || '-'}</span>
                    {r.remove ? (
                      <span className="flex-1 text-xs font-semibold text-red-600">Will be removed when you save</span>
                    ) : (
                      <input aria-label={`Stock for ${sizeLabelOf(it)}`} className="h-11 flex-1 rounded-lg border border-slate-200 px-3 font-bold" type="number" inputMode="numeric" min="0" placeholder="Stock" value={r.stock} onChange={(e) => patchRow(it.id, { stock: e.target.value.slice(0, 7) })} />
                    )}
                    <button type="button" aria-label={r.remove ? 'Keep this size' : 'Remove this size'} onClick={() => patchRow(it.id, { remove: !r.remove })}
                      className={`flex h-11 w-11 items-center justify-center rounded-lg ${r.remove ? 'bg-white text-slate-700' : 'bg-slate-100 text-red-600'}`}>
                      {r.remove ? <Undo2 size={18} /> : <Trash2 size={18} />}
                    </button>
                  </div>
                );
              })}
              {sizeAxis && (
                <div className="pt-2">
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Add sizes</label>
                  <input className={field} value={f.newSizes} onChange={set('newSizes')} placeholder="e.g. 39, 40, 41" />
                  {adding.length > 0 && <p className="mt-1 text-xs font-semibold text-slate-500">Will add {adding.join(', ')} to {entry.colour || 'this product'}. Set their stock after saving.</p>}
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 border-t border-slate-100 bg-white p-4 pb-safe">
            <button type="button" disabled={busy} onClick={save} className="h-14 w-full rounded-xl bg-blue-600 font-bold text-white active:bg-blue-700 disabled:opacity-50">{busy ? 'Saving...' : 'Save'}</button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
