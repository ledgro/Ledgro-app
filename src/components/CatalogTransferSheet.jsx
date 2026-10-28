import { useState } from 'react';
import { Drawer } from 'vaul';
import { toast } from 'sonner';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { saveFile } from '../lib/shareFile';
import { buildCatalogCsv, buildCatalogBackup, parseCatalogFile, planImport } from '../lib/catalogTransfer';
import { loadItemImage, saveImage, imageKey } from '../lib/productImage';

const day = () => new Date().toISOString().slice(0, 10);
const slug = (s) => String(s || 'shop').replace(/[^\w-]+/g, '-');

/** Admin: download all products as a file, or import a file into this shop (never overwrites). */
export default function CatalogTransferSheet({ open, onClose, items, shopId, shopName, uid, onAdded }) {
  const [busy, setBusy] = useState('');
  const [plan, setPlan] = useState(null);

  const close = () => { setPlan(null); onClose(); };
  const live = items.filter((i) => !i.deleted);

  const downloadCsv = async () => {
    setBusy('csv');
    try {
      await saveFile(new Blob([buildCatalogCsv(live)], { type: 'text/csv;charset=utf-8' }), `Products-${slug(shopName)}-${day()}.csv`, 'Products');
    } catch (e) {
      console.error(e);
      toast.error('Could not create the file.');
    } finally { setBusy(''); }
  };

  const downloadBackup = async () => {
    setBusy('backup');
    try {
      const images = {};
      const withImg = live.filter((i) => i.hasImage);
      for (let i = 0; i < withImg.length; i += 6) {
        const part = withImg.slice(i, i + 6);
        const got = await Promise.all(part.map((it) => loadItemImage(shopId, it)));
        part.forEach((it, k) => { if (got[k]) images[imageKey(it)] = got[k]; });
      }
      await saveFile(new Blob([buildCatalogBackup(live, images)], { type: 'application/json' }), `Products-backup-${slug(shopName)}-${day()}.json`, 'Products backup');
    } catch (e) {
      console.error(e);
      toast.error('Could not create the file.');
    } finally { setBusy(''); }
  };

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setPlan(planImport(parseCatalogFile(await f.text()), live, () => doc(collection(db, `shops/${shopId}/catalog`)).id));
    } catch (err) {
      toast.error(err.message || 'Could not read that file.');
    }
  };

  const runImport = async () => {
    if (!plan?.creates.length || busy) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again.'); return; }
    setBusy('import');
    const done = [];
    const flush = () => onAdded(done.map(({ _image, ...d }) => d));
    try {
      for (let i = 0; i < plan.creates.length; i += 15) {
        const batch = writeBatch(db);
        const part = plan.creates.slice(i, i + 15).map((c) => {
          const ref = doc(collection(db, `shops/${shopId}/catalog`));
          batch.set(ref, { ...c.payload, createdBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          return { ref, c };
        });
        await batch.commit();
        part.forEach(({ ref, c }) => done.push({ ...c.payload, id: ref.id, createdAt: new Date(), updatedAt: new Date(), _image: c.image }));
      }
      const saved = new Set();
      for (const d of done) {
        const key = imageKey(d);
        if (!d._image || saved.has(key)) continue;
        saved.add(key);
        try { await saveImage(shopId, key, d._image, uid); } catch (err) { console.error(err); }
      }
      flush();
      toast.success(`${done.length} product${done.length === 1 ? '' : 's'} imported`);
      close();
    } catch (err) {
      console.error(err);
      if (done.length) flush();
      toast.error(`Import stopped after ${done.length} products. Choose the file again to add the rest; existing ones are skipped.`);
      setPlan(null);
    } finally { setBusy(''); }
  };

  const btn = 'flex h-14 w-full items-center justify-center rounded-xl text-base font-bold active:scale-95 transition-transform disabled:opacity-50';
  return (
    <Drawer.Root handleOnly repositionInputs={false} open={open} onOpenChange={(o) => { if (!o && !busy) close(); }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[60] bg-black/40" />
        <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="fixed bottom-0 left-0 right-0 z-[61] flex max-h-[85vh] flex-col rounded-t-[24px] bg-white focus:outline-none">
          <div className="flex-1 space-y-6 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <Drawer.Title className="text-xl font-black text-slate-900">Move products between shops</Drawer.Title>
            {!plan ? (
              <>
                <section className="space-y-3">
                  <p className="text-sm font-bold text-slate-700">Export all {live.length} products</p>
                  <button type="button" disabled={!!busy || !live.length} onClick={downloadCsv} className={`${btn} bg-slate-100 text-slate-800`}>{busy === 'csv' ? 'Creating...' : 'Spreadsheet (CSV, opens in Excel)'}</button>
                  <button type="button" disabled={!!busy || !live.length} onClick={downloadBackup} className={`${btn} bg-slate-100 text-slate-800`}>{busy === 'backup' ? 'Creating...' : 'Full backup (with photos)'}</button>
                  <p className="text-xs text-slate-500">Both include cost price, so keep the file private. The spreadsheet has no photos.</p>
                </section>
                <section className="space-y-3">
                  <p className="text-sm font-bold text-slate-700">Import into this shop</p>
                  <label className={`${btn} cursor-pointer bg-blue-600 text-white`}>
                    Choose a file
                    <input type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={pick} />
                  </label>
                  <p className="text-xs text-slate-500">Use a file from the buttons above. Products already in this shop are skipped, nothing is overwritten. Up to 500 rows.</p>
                </section>
              </>
            ) : (
              <section className="space-y-3">
                <div className="space-y-1 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                  <p><span className="text-lg font-black text-green-700">{plan.creates.length}</span> to add</p>
                  <p>{plan.skipped} already here (skipped)</p>
                  {plan.errors.length > 0 && <p className="text-red-600">{plan.errors.length} with problems (skipped)</p>}
                </div>
                {plan.errors.slice(0, 5).map((er) => <p key={er.line} className="text-xs text-red-600">Row {er.line}: {er.message}</p>)}
                <button type="button" disabled={!plan.creates.length || !!busy} onClick={runImport} className={`${btn} bg-blue-600 text-white`}>
                  {busy === 'import' ? 'Importing...' : `Import ${plan.creates.length} product${plan.creates.length === 1 ? '' : 's'}`}
                </button>
                <button type="button" disabled={!!busy} onClick={() => setPlan(null)} className={`${btn} bg-slate-100 text-slate-700`}>Back</button>
              </section>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
