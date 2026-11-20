import { useEffect, useMemo, useState, useCallback } from 'react';
import FieldError, { errRing } from '../components/FieldError';
import { toast } from 'sonner';
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, increment, writeBatch, deleteDoc } from 'firebase/firestore';
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from 'lucide-react';
import { confirm } from '../lib/confirm';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { loadCatalog } from '../lib/catalogSync';
import { useCatalogStore } from '../store/catalogStore';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/Skeleton';
import { useShowLoader } from '../hooks/useShowLoader';
import { formatCurrency, sanitizeText, cn } from '../lib/utils';
import { sessionGuard } from '../lib/SessionGuard';

const toDateSafe = (ts) => (ts?.toDate ? ts.toDate() : new Date());

/** Stock moving between this shop and another shop (in or out). Never a sale: it does not touch bills or earnings. */
export default function Transfers() {
  const { user, shopId, shopAdminId } = useAuth();
  const isAdmin = user?.uid === shopAdminId;
  const items = useCatalogStore((s) => s.items);
  const hydrateCatalog = useCatalogStore((s) => s.hydrateCatalog);

  const [direction, setDirection] = useState('in');
  const [party, setParty] = useState('');
  const [fe, setFe] = useState({});
  const clr = (k) => setFe((p) => (p[k] ? { ...p, [k]: '' } : p));
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useShowLoader(loading);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const [items, tr] = await Promise.all([
        loadCatalog(shopId),
        getDocs(query(collection(db, `shops/${shopId}/transfers`), orderBy('createdAt', 'desc'), limit(100))),
      ]);
      hydrateCatalog(items);
      setTransfers(tr.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
    } catch (err) {
      console.error(err);
      toast.error('Could not load transfers. Check connection.');
    } finally {
      setLoading(false);
    }
  }, [shopId, hydrateCatalog]);

  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const removeEntry = async (t) => {
    const ok = await confirm({ title: 'Delete this entry?', message: 'Only the history line is removed. Your stock count does not change.', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, `shops/${shopId}/transfers/${t.id}`));
      setTransfers((l) => l.filter((x) => x.id !== t.id));
    } catch (err) {
      console.error(err);
      toast.error(`Could not delete (${err.code || 'error'}).`);
    }
  };

  const parties = useMemo(() => [...new Set(transfers.map((t) => t.party).filter(Boolean))], [transfers]);

  const summary = useMemo(() => {
    const m = new Map();
    transfers.forEach((t) => {
      const key = (t.party || '').trim().toLowerCase();
      const row = m.get(key) || { name: (t.party || '').trim(), inQty: 0, outQty: 0, inVal: 0, outVal: 0 };
      const val = (t.unitPrice || 0) * t.qty;
      if (t.direction === 'in') { row.inQty += t.qty; row.inVal += val; } else { row.outQty += t.qty; row.outVal += val; }
      m.set(key, row);
    });
    return [...m.values()];
  }, [transfers]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const cleanParty = sanitizeText(party).slice(0, 60);
    const cleanName = sanitizeText(productName).slice(0, 100);
    const qtyNum = parseFloat(qty);
    const priceNum = price !== '' ? parseFloat(price) : null;
    const errs = {};
    if (!cleanParty) errs.party = direction === 'in' ? 'Enter the shop it came from.' : 'Enter the shop it went to.';
    if (!cleanName) errs.product = 'Enter the product name.';
    if (!(qtyNum > 0)) errs.qty = qty === '' ? 'Enter how many pieces.' : 'Quantity must be more than 0.';
    else if (qtyNum > 100000) errs.qty = 'Quantity can be at most 100000.';
    if (priceNum !== null && (isNaN(priceNum) || priceNum < 0)) errs.price = 'Price must be 0 or more. Leave it empty if you do not know it.';
    if (Object.keys(errs).length) { setFe(errs); return; }
    setFe({});

    const existing = items.find((i) => i.id && (i.name || '').trim().toLowerCase() === cleanName.toLowerCase());
    if (!existing && direction === 'out') { toast.error('That product is not in your list. Only products you have can go out.'); return; }
    if (existing && direction === 'out' && existing.stockCount != null && existing.stockCount < qtyNum) {
      toast.error(`Only ${existing.stockCount} in stock.`);
      return;
    }

    setSubmitting(true);
    try {
      sessionGuard.assertValidSession(user.uid);
      const batch = writeBatch(db);
      const unitPrice = priceNum !== null ? Math.round(priceNum * 100) : null;
      let catalogId;
      if (existing) {
        catalogId = existing.id;
        if (existing.stockCount != null) {
          batch.update(doc(db, `shops/${shopId}/catalog`, existing.id), {
            stockCount: increment(direction === 'in' ? qtyNum : -qtyNum),
            updatedAt: serverTimestamp(),
          });
        }
      } else {
        const ref = doc(collection(db, `shops/${shopId}/catalog`));
        catalogId = ref.id;
        batch.set(ref, {
          name: cleanName,
          lastUsedPrice: 0, // a transfer price is a cost, never a selling price
          unit: 'pair',
          stockCount: qtyNum,
          isActive: true,
          frequency: 0,
          source: cleanParty,
          costPrice: unitPrice,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(collection(db, `shops/${shopId}/transfers`)), {
        direction,
        party: cleanParty,
        productId: catalogId,
        name: cleanName,
        qty: qtyNum,
        unitPrice,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      if (existing && existing.stockCount == null) toast.success("Logged. This product doesn't track stock.");
      else if (!existing) toast.success('New product added. Set its selling price in Products.', { duration: 6000 });
      else toast.success(direction === 'in' ? 'Stock added.' : 'Stock sent out.');
      setProductName(''); setQty(''); setPrice('');
      await load();
    } catch (err) {
      console.error(err);
      toast.error('Could not save the transfer. Nothing was saved.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-50 pb-nav">
      <header className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-black text-slate-900">Stock transfer</h1>
        <p className="text-xs text-slate-500 mt-0.5">Stock to or from another shop. Not counted as a sale or expense. Money paid or received is not recorded here: add it in Expenses.</p>
      </header>

      <main className="p-4 space-y-6">
        <form noValidate onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
            {[['in', 'In', ArrowDownToLine], ['out', 'Out', ArrowUpFromLine]].map(([v, label, Icon]) => (
              <button key={v} type="button" aria-pressed={direction === v} onClick={() => setDirection(v)}
                className={cn('h-12 rounded-xl border font-bold flex items-center justify-center gap-2 transition-colors',
                  direction === v ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200')}>
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>

          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">{direction === 'in' ? 'Received from' : 'Sent to'}</span>
            <input list="transfer-parties" value={party} onChange={(e) => { setParty(e.target.value); clr('party'); }} maxLength={60} aria-invalid={!!fe.party}
              className={'w-full px-4 h-12 border border-slate-200 rounded-xl font-medium text-slate-900' + errRing(fe.party)} />
            <FieldError>{fe.party}</FieldError>
            <datalist id="transfer-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
          </label>

          <label className="block">
            <span className="block text-sm font-semibold text-slate-700 mb-1">Product</span>
            <input list="transfer-products" value={productName} onChange={(e) => { setProductName(e.target.value); clr('product'); }} maxLength={100} aria-invalid={!!fe.product}
              className={'w-full px-4 h-12 border border-slate-200 rounded-xl font-medium text-slate-900' + errRing(fe.product)} />
            <FieldError>{fe.product}</FieldError>
            <datalist id="transfer-products">{items.filter((i) => i.isActive !== false).map((i) => <option key={i.id} value={i.name} />)}</datalist>
            {direction === 'in' && productName.trim() && !items.some((i) => (i.name || '').trim().toLowerCase() === productName.trim().toLowerCase()) && (
              <span className="block text-xs text-blue-600 mt-1">New product. It will be added to your list.</span>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1">Quantity</span>
              <input type="number" inputMode="decimal" min="0" step="1" value={qty} onChange={(e) => { setQty(e.target.value.slice(0, 8)); clr('qty'); }} aria-invalid={!!fe.qty}
                className={'w-full px-4 h-12 border border-slate-200 rounded-xl font-medium text-slate-900' + errRing(fe.qty)} />
              <FieldError>{fe.qty}</FieldError>
            </label>
            <label className="block">
              <span className="block text-sm font-semibold text-slate-700 mb-1">Price each (optional)</span>
              <input type="number" inputMode="decimal" min="0" step="0.01" value={price} onChange={(e) => { setPrice(e.target.value.slice(0, 10)); clr('price'); }} aria-invalid={!!fe.price}
                className={'w-full px-4 h-12 border border-slate-200 rounded-xl font-medium text-slate-900' + errRing(fe.price)} />
              <FieldError>{fe.price}</FieldError>
            </label>
          </div>

          <button type="submit" disabled={submitting}
            className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold active:scale-[0.99] disabled:opacity-50">
            {submitting ? 'Saving...' : direction === 'in' ? 'Add stock' : 'Send out'}
          </button>
        </form>

        {summary.length > 0 && (
          <section aria-label="By shop">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">By shop (latest 100)</h2>
            <div className="space-y-2">
              {summary.map((s) => (
                <div key={s.name.toLowerCase()} className="bg-white border border-slate-200 rounded-xl p-3">
                  <div className="font-bold text-slate-900">{s.name}</div>
                  <div className="text-sm text-slate-600 mt-1">Received {s.inQty} pairs{s.inVal ? ` (${formatCurrency(s.inVal)})` : ''}</div>
                  <div className="text-sm text-slate-600">Sent {s.outQty} pairs{s.outVal ? ` (${formatCurrency(s.outVal)})` : ''}</div>
                  <div className="text-sm font-semibold text-slate-800">Net {s.inQty - s.outQty >= 0 ? '+' : ''}{s.inQty - s.outQty} pairs</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-label="History">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">History</h2>
          {loading ? (
            showLoader ? <ListSkeleton rows={4} /> : null
          ) : transfers.length === 0 ? (
            <p className="text-sm text-slate-500">No transfers yet.</p>
          ) : (
            <ul className="space-y-2">
              {transfers.map((t) => (
                <li key={t.id} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{t.name}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {t.direction === 'in' ? 'from' : 'to'} {t.party} · {toDateSafe(t.createdAt).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {t.unitPrice != null ? ` · ${formatCurrency(t.unitPrice)} each` : ''}
                    </div>
                  </div>
                  <span className={cn('font-black shrink-0', t.direction === 'in' ? 'text-emerald-600' : 'text-rose-600')}>
                    {t.direction === 'in' ? '+' : '-'}{t.qty}
                  </span>
                  {isAdmin && (
                    <button type="button" aria-label="Delete entry" onClick={() => removeEntry(t)} className="shrink-0 w-11 h-11 flex items-center justify-center text-slate-400 active:text-rose-600"><Trash2 size={18} /></button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
