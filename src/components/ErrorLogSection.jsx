import { useState } from 'react';
import { collection, deleteDoc, doc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Bug } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../firebase';
import { useNameOf } from '../lib/memberNames';

export default function ErrorLogSection({ shopId, uid }) {
  const [logs, setLogs] = useState(null);
  const [busy, setBusy] = useState(false);
  const nameOf = useNameOf(shopId, uid);

  const load = async () => {
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, `shops/${shopId}/errorLogs`), orderBy('createdAt', 'desc'), limit(20)));
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error('Could not load error log');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    if (!window.confirm('Delete these error entries?')) return;
    setBusy(true);
    try {
      await Promise.all(logs.map((l) => deleteDoc(doc(db, `shops/${shopId}/errorLogs/${l.id}`))));
      setLogs([]);
    } catch (err) {
      console.error(err);
      toast.error('Could not clear error log');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
      <div className="flex items-center gap-2 text-slate-900 font-bold mb-4">
        <Bug size={20} className="text-blue-600" />
        <h2>Error log</h2>
      </div>
      {logs === null ? (
        <button onClick={load} disabled={busy} className="w-full bg-slate-50 text-slate-700 font-bold h-12 rounded-xl border border-slate-200 active:bg-slate-100 text-sm disabled:opacity-50">
          {busy ? 'Loading...' : 'Show recent errors'}
        </button>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">No errors recorded.</p>
      ) : (
        <div className="space-y-3">
          {logs.map((l) => (
            <div key={l.id} className="text-xs border-b border-slate-100 pb-2">
              <p className="font-semibold text-slate-800 break-words">{l.msg}</p>
              <p className="text-slate-400 mt-0.5">
                {l.screen} · {nameOf(l.uid)} · {l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString() : ''}
              </p>
            </div>
          ))}
          <button onClick={clear} disabled={busy} className="w-full text-red-600 font-bold h-11 rounded-xl border border-red-100 bg-red-50 text-sm disabled:opacity-50">
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
