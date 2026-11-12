import { useState } from 'react';
import { saveMyName } from '../lib/myName';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { User, Store, Phone, MapPin, ReceiptText, Clock, PackagePlus, Users, ShoppingCart, Moon, Sun, Smartphone } from 'lucide-react';
import { getThemePref, setThemePref } from '../lib/theme';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';

const FOOTERS = ['Thank you, visit again!', 'Exchange within 7 days with this bill', 'No exchange without bill'];
const DAY_ENDS = [
  [0, 'We close before midnight'],
  [180, 'Sometimes we stay open until 2 or 3 AM'],
  [270, 'We often work very late (default)'],
];

const input = 'w-full h-14 px-4 border border-slate-200 rounded-xl text-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500';

/** Questions shown once, right after a shop is created: they fill the receipt header, footer and day start. All can be skipped. */
export default function Welcome() {
  const { shopId, shopName, user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [a, setA] = useState({ name: '', phone: '', address: '', tagline: '', cutoff: 270 });

  const [theme, setTheme] = useState(getThemePref());
  const questions = [
    { icon: User, title: 'What is your name?', hint: 'Shown on your Home screen and to your team. You can change it later in Profile.',
      body: <input type="text" maxLength={30} autoComplete="given-name" value={a.name} onChange={(e) => setA((p) => ({ ...p, name: e.target.value }))} placeholder="Your first name" className={input} /> },
    { icon: Moon, title: 'Dark or light?', hint: 'Dark is easier on the eyes in a shop. You can change it any time in Profile.',
      body: (
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
          {[['dark', 'Dark', Moon], ['light', 'Light', Sun], ['auto', 'Auto', Smartphone]].map(([v, label, I]) => (
            <button key={v} type="button" role="radio" aria-checked={theme === v} onClick={() => { setThemePref(v); setTheme(v); }}
              className={`flex flex-col items-center gap-2 rounded-2xl border px-2 py-5 font-bold ${theme === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>
              <I size={22} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      ) },
    { icon: Phone, title: 'What phone number should customers see?', hint: 'Printed at the top of every receipt. You can leave it empty.',
      body: <input type="tel" inputMode="tel" maxLength={30} value={a.phone} onChange={(e) => setA((p) => ({ ...p, phone: e.target.value }))} placeholder="Shop phone number" className={input} /> },
    { icon: MapPin, title: 'Where is your shop?', hint: 'The address printed under the shop name.',
      body: <input type="text" maxLength={200} value={a.address} onChange={(e) => setA((p) => ({ ...p, address: e.target.value }))} placeholder="Street, town" className={input} /> },
    { icon: ReceiptText, title: 'What should the bottom of the receipt say?', hint: 'One line, like a thank you or your exchange rule.',
      body: (
        <div className="space-y-3">
          <input type="text" maxLength={100} value={a.tagline} onChange={(e) => setA((p) => ({ ...p, tagline: e.target.value }))} placeholder="Receipt footer" className={input} />
          <div className="flex flex-wrap gap-2">
            {FOOTERS.map((f) => (
              <button key={f} type="button" onClick={() => setA((p) => ({ ...p, tagline: f }))} className="rounded-full bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700 active:scale-95">{f}</button>
            ))}
          </div>
        </div>
      ) },
    { icon: Clock, title: 'Does your shop work past midnight?', hint: 'Sales after midnight count for the day you opened. You can change it later in Settings.',
      body: (
        <div className="space-y-2">
          {DAY_ENDS.map(([v, l]) => (
            <button key={v} type="button" onClick={() => setA((p) => ({ ...p, cutoff: v }))}
              className={`w-full rounded-xl border px-4 py-4 text-left font-bold ${a.cutoff === v ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700'}`}>{l}</button>
          ))}
        </div>
      ) },
  ];
  const total = questions.length + 1; // the last screen is the next steps

  const save = async () => {
    const data = {};
    if (a.phone.trim()) data.phone = a.phone.trim();
    if (a.address.trim()) data.address = a.address.trim();
    if (a.tagline.trim()) data.tagline = a.tagline.trim();
    if (a.cutoff !== 270) data.dayCutoffMin = a.cutoff;
    if (Object.keys(data).length === 0) return true;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return false; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'shops', shopId), { ...data, updatedAt: serverTimestamp() });
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Could not save. You can fill this in later in Settings.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === 0 && a.name.trim() && navigator.onLine) { try { await saveMyName(shopId, user, a.name); } catch (err) { console.warn('Could not save name', err); } }
    if (step === questions.length - 1) { if (!(await save())) return; }
    setStep((s) => s + 1);
  };

  const Next = ({ to, icon: Icon, title, text }) => (
    <button type="button" onClick={() => navigate(to, { replace: true })} className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left active:bg-slate-50">
      <span className="rounded-full bg-blue-50 p-3 text-blue-600"><Icon size={22} aria-hidden="true" /></span>
      <span><span className="block font-bold text-slate-900">{title}</span><span className="block text-sm font-medium text-slate-500">{text}</span></span>
    </button>
  );

  const q = questions[step];
  const Icon = q?.icon || Store;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 px-4 pb-safe pt-8">
      <div className="mx-auto w-full max-w-md flex-1">
        <div className="mb-6 flex gap-1.5" aria-label={`Step ${step + 1} of ${total}`}>
          {Array.from({ length: total }, (_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />)}
        </div>
        {q ? (
          <div className="space-y-5">
            <span className="inline-flex rounded-full bg-blue-50 p-3 text-blue-600"><Icon size={26} aria-hidden="true" /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{shopName}</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900">{q.title}</h1>
              <p className="mt-1 text-sm font-medium text-slate-500">{q.hint}</p>
            </div>
            {q.body}
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="text-2xl font-black text-slate-900">Your shop is ready</h1>
            <p className="text-sm font-medium text-slate-500">Pick what to do first. Everything here can also be done later.</p>
            <Next to="/products" icon={PackagePlus} title="Add your products" text="Sizes, colours and prices" />
            <Next to="/members" icon={Users} title="Invite your staff" text="Give them a code to join" />
            <Next to="/pos" icon={ShoppingCart} title="Make your first bill" text="Start billing now" />
            <button type="button" onClick={() => navigate('/dashboard', { replace: true })} className="w-full py-3 text-sm font-bold text-slate-500">Go to the dashboard</button>
          </div>
        )}
      </div>
      {q && (
        <div className="mx-auto flex w-full max-w-md items-center gap-3 py-4">
          {step > 0 && <button type="button" onClick={() => setStep((s) => s - 1)} disabled={saving} className="h-14 rounded-xl bg-white px-5 font-bold text-slate-600 border border-slate-200">Back</button>}
          <button type="button" onClick={next} disabled={saving} className="h-14 flex-1 rounded-xl bg-blue-600 font-bold text-white active:bg-blue-700 disabled:opacity-50">{saving ? 'Saving...' : 'Next'}</button>
          <button type="button" onClick={() => navigate('/dashboard', { replace: true })} disabled={saving} className="h-14 px-3 text-sm font-bold text-slate-500">Skip</button>
        </div>
      )}
    </div>
  );
}
