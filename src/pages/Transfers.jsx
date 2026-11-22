import { useEffect, useMemo, useState, useCallback } from 'react';
import FieldError, { errRing } from '../components/FieldError';
import { toast } from 'sonner';
import { collection, doc, getDocs, limit, orderBy, query, serverTimestamp, increment, writeBatch } from 'firebase/firestore';
import { ArrowDownToLine, ArrowUpFromLine, Undo2, Plus, X } from 'lucide-react';
import { confirm } from '../lib/confirm';
import { db } from '../firebase';
import { logActivity } from '../lib/audit';
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
  const blankLine = () => ({ k: Math.random().toString(36).slice(2), name: '', qty: '', price: '' });
  const [lines, setLines] = useState(() => [blankLine()]);
  const setLine = (k, patch) => { setLines((l) => l.map((x) => (x.k === k ? { ...x, ...patch } : x))); clr('lines'); };
  const MAX_LINES = 15;
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

  const reverseEntry = async (t) => {
    if (t.reversed || t.reversesId) return;
    if (!navigator.onLine) { toast.error('Go online to reverse an entry.'); return; }
    const product = items.find((p) => p.id === t.productId && p.isActive !== false);
    const tracks = product && product.stockCount != null;
    if (!product) { toast.error('This product is removed or hidden. Turn it back on in Products, then reverse.'); return; }
    if (tracks && t.direction === 'in' && product.stockCount < t.qty) {
      toast.error(`Only ${product.stockCount} in stock. Cannot take back ${t.qty}.`);
      return;
    }
    const ok = await confirm({
      title: 'Reverse this entry?',
      message: `${t.qty} ${t.name} ${t.direction === 'in' ? 'received' : 'sent'} ${t.direction === 'in' ? 'from' : 'to'} ${t.party}. Stock goes ${t.direction === 'in' ? 'down' : 'back up'} by ${t.qty}. A reversal line is added to the history.`,
      confirmText: 'Reverse', danger: true,
    });
    if (!ok) return;
    try {
      sessionGuard.assertValidSession(user.uid);
      const batch = writeBatch(db);
      if (tracks) {
        batch.update(doc(db, `shops/${shopId}/catalog`, product.id), {
          stockCount: increment(t.direction === 'in' ? -t.qty : t.qty),
          updatedAt: serverTimestamp(),
        });
      }
      batch.set(doc(collection(db, `shops/${shopId}/transfers`)), {
        direction: t.direction === 'in' ? 'out' : 'in',
        party: t.party, productId: t.productId, name: t.name, qty: t.qty,
        unitPrice: t.unitPrice ?? null,
        reversesId: t.id, creatorId: user.uid, createdAt: serverTimestamp(),
      });
      batch.update(doc(db, `shops/${shopId}/transfers/${t.id}`), { reversed: true });
      logActivity(batch, shopId, user.uid, { action: 'stock_change', note: `Reversed ${t.direction === 'in' ? 'in' : 'out'}: ${t.qty} ${t.name}${t.party ? ` (${t.party})` : ''}` });
      await batch.commit();
      toast.success('Reversed.');
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err?.code === 'permission-denied' ? 'Not allowed. Stock may be too low, or already reversed.' : `Could not reverse (${err?.code || 'error'}).`);
    }
  };

  const parties = useMemo(() => [...new Set(transfers.map((t) => t.party).filter(Boolean))], [transfers]);

  const summary = useMemo(() => {
    const m = new Map();
    transfers.forEach((t) => {
      if (t.reversed || t.reversesId) return; // a reversed pair cancels out: not a real movement
      const key = (t.party || '').trim().toLowerCase();
      const row = m.get(key) || { name: (t.party || '').trim(), inQty: 0, outQty: 0, inVal: 0, outVal: 0 };
      const val = (t.unitPrice || 0) * t.qty;
      if (t.direction === 'in') { row.inQty += t.qty; row.inVal += val; } else { row.outQty += t.qty; row.outVal += val; }
      m.set(key, row);
    });
    return [...m.values()];
  }, [transfers]);

  const findItem = (name) => items.find((i) => i.id && i.isActive !== false && (i.name || '').trim().toLowerCase() === name.toLowerCase());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const cleanParty = sanitizeText(party).slice(0, 60);
    const errs = {};
    if (!cleanParty) errs.party = direction === 'in' ? 'Enter the shop it came from.' : 'Enter the shop it went to.';

    // Blank rows are ignored, so an extra empty row never blocks saving.
    const filled = lines.filter((l) => l.name.trim() || l.qty !== '' || l.price !== '');
    const lineErrs = {};
    const seen = new Set();
    const parsed = filled.map((l) => {
      const name = sanitizeText(l.name).slice(0, 100);
      const qtyNum = parseFloat(l.qty);
      const priceNum = l.price !== '' ? parseFloat(l.price) : null;
      const existing = name ? findItem(name) : null;
      let msg = '';
      if (!name) msg = 'Enter the product name.';
      else if (seen.has(name.toLowerCase())) msg = 'This product is listed twice. Combine the quantities.';
      else if (!(qtyNum > 0)) msg = l.qty === '' ? 'Enter how many.' : 'Quantity must be more than 0.';
      else if (qtyNum > 100000) msg = 'Quantity can be at most 100000.';
      else if (priceNum !== null && (isNaN(priceNum) || priceNum < 0)) msg = 'Price must be 0 or more, or leave it empty.';
      else if (!existing && direction === 'out') msg = 'Not in your list. Only products you have can go out.';
      else if (existing && direction === 'out' && existing.stockCount != null && existing.stockCount < qtyNum) msg = `Only ${existing.stockCount} in stock.`;
      if (name) seen.add(name.toLowerCase());
      if (msg) lineErrs[l.k] = msg;
      return { name, qtyNum, priceNum, existing };
    });
    if (filled.length === 0) errs.lines = 'Add at least one product.';
    if (Object.keys(lineErrs).length) errs.lines = 'Fix the products marked in red.';
    if (Object.keys(errs).length || Object.keys(lineErrs).length) { setFe({ ...errs, lineErrs }); return; }
    setFe({});

    setSubmitting(true);
    try {
      sessionGuard.assertValidSession(user.uid);
      const batch = writeBatch(db);
      let created = 0; let untracked = 0;
      parsed.forEach(({ name, qtyNum, priceNum, existing }) => {
        const unitPrice = priceNum !== null ? Math.round(priceNum * 100) : null;
        let catalogId;
        if (existing) {
          catalogId = existing.id;
          if (existing.stockCount != null) {
            batch.update(doc(db, `shops/${shopId}/catalog`, existing.id), {
              stockCount: increment(direction === 'in' ? qtyNum : -qtyNum),
              updatedAt: serverTimestamp(),
            });
          } else untracked += 1;
        } else {
          const ref = doc(collection(db, `shops/${shopId}/catalog`));
          catalogId = ref.id;
          created += 1;
          batch.set(ref, {
            name,
            lastUsedPrice: 0, // a transfer price is a cost, never a selling price
            unit: 'piece',
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
          direction, party: cleanParty, productId: catalogId, name, qty: qtyNum, unitPrice,
          creatorId: user.uid, createdAt: serverTimestamp(),
        });
      });
      // One activity-log line per transfer, so the owner sees who moved stock. Same batch: it saves with the transfer or not at all.
      const summary = parsed.map((p) => `${p.name} ${p.qtyNum}`).join(', ');
      const totalCost = parsed.reduce((sum, p) => sum + (p.priceNum !== null ? Math.round(p.priceNum * 100) * p.qtyNum : 0), 0);
      logActivity(batch, shopId, user.uid, { action: 'stock_change', amount: totalCost, note: `${direction === 'in' ? 'Received from' : 'Sent to'} ${cleanParty}: ${summary}` });
      await batch.commit();
      const n = parsed.length;
      if (created) toast.success(`${n} saved. ${created} new product${created > 1 ? 's' : ''} added: set selling price in Products.`, { duration: 6000 });
      else if (untracked === n) toast.success("Logged. These products don't track stock.");
      else toast.success(direction === 'in' ? `Stock added (${n}).` : `Stock sent out (${n}).`);
      setLines([blankLine()]);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err?.code === 'permission-denied' ? 'Not saved. Stock changed on another phone, or a product is no longer allowed. Refresh and try again.' : 'Could not save the transfer. Nothing was saved.');
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

          <datalist id="transfer-products">{items.filter((i) => i.isActive !== false).map((i) => <option key={i.id} value={i.name} />)}</datalist>
          <div className="space-y-3">
            {lines.map((l, idx) => {
              const hit = l.name.trim() ? findItem(l.name.trim()) : null;
              const err = fe.lineErrs?.[l.k];
              return (
                <div key={l.k} className={cn('rounded-xl border p-3 space-y-2', err ? 'border-rose-300' : 'border-slate-200')}>
                  <div className="flex items-center gap-2">
                    <input list="transfer-products" value={l.name} onChange={(e) => setLine(l.k, { name: e.target.value })} maxLength={100}
                      placeholder={`Product ${idx + 1}`} aria-label={`Product ${idx + 1}`}
                      className="flex-1 min-w-0 px-3 h-11 border border-slate-200 rounded-lg font-medium text-slate-900" />
                    {lines.length > 1 && (
                      <button type="button" aria-label={`Remove product ${idx + 1}`} onClick={() => setLines((x) => x.filter((y) => y.k !== l.k))}
                        className="shrink-0 w-11 h-11 flex items-center justify-center text-slate-400 active:text-rose-600"><X size={18} /></button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" inputMode="decimal" min="0" step="1" value={l.qty} onChange={(e) => setLine(l.k, { qty: e.target.value.slice(0, 8) })}
                      placeholder="Quantity" aria-label={`Quantity ${idx + 1}`}
                      className="w-full px-3 h-11 border border-slate-200 rounded-lg font-medium text-slate-900" />
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={l.price} onChange={(e) => setLine(l.k, { price: e.target.value.slice(0, 10) })}
                      placeholder="Price each (optional)" aria-label={`Price each ${idx + 1}`}
                      className="w-full px-3 h-11 border border-slate-200 rounded-lg font-medium text-slate-900" />
                  </div>
                  {err ? <p className="text-xs text-rose-600">{err}</p>
                    : hit && hit.stockCount != null ? <p className="text-xs text-slate-500">{hit.stockCount} in stock</p>
                    : direction === 'in' && l.name.trim() && !hit ? <p className="text-xs text-blue-600">New product. It will be added to your list.</p> : null}
                </div>
              );
            })}
            <FieldError>{fe.lines}</FieldError>
            {lines.length < MAX_LINES && (
              <button type="button" onClick={() => setLines((x) => [...x, blankLine()])}
                className="w-full h-11 rounded-xl border border-dashed border-slate-300 text-slate-600 font-semibold flex items-center justify-center gap-1.5 active:bg-slate-50">
                <Plus size={16} /> Add another product
              </button>
            )}
          </div>

          <button type="submit" disabled={submitting}
            className="w-full h-12 rounded-xl bg-blue-600 text-white font-bold active:scale-[0.99] disabled:opacity-50">
            {submitting ? 'Saving...' : direction === 'in' ? 'Add stock' : 'Send out'}{!submitting && lines.filter((l) => l.name.trim()).length > 1 ? ` (${lines.filter((l) => l.name.trim()).length})` : ''}
          </button>
        </form>

        {summary.length > 0 && (
          <section aria-label="By shop">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">By shop (latest 100, reversed entries left out)</h2>
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
                    <div className="font-semibold text-slate-900 truncate">{t.name}{t.reversed ? ' · reversed' : ''}{t.reversesId ? ' · reversal' : ''}</div>
                    <div className="text-xs text-slate-500 truncate">
                      {t.direction === 'in' ? 'from' : 'to'} {t.party} · {toDateSafe(t.createdAt).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      {t.unitPrice != null ? ` · ${formatCurrency(t.unitPrice)} each` : ''}
                    </div>
                  </div>
                  <span className={cn('font-black shrink-0', t.direction === 'in' ? 'text-emerald-600' : 'text-rose-600')}>
                    {t.direction === 'in' ? '+' : '-'}{t.qty}
                  </span>
                  {isAdmin && !t.reversed && !t.reversesId && (
                    <button type="button" aria-label="Reverse entry" onClick={() => reverseEntry(t)} className="shrink-0 w-11 h-11 flex items-center justify-center text-slate-400 active:text-rose-600"><Undo2 size={18} /></button>
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
