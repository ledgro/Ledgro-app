import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

/** Lets a username login add a real email. A link is sent; once opened, the account is a normal email account. */
export default function AddEmailForm() {
  const { addEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await addEmail(email, password);
      setSent(email.trim());
      setPassword('');
    } catch (err) {
      setError(err.userFacing ? err.message : 'Could not send the link. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-2 rounded-xl bg-green-50 p-4 text-sm font-medium text-green-800">
        <p className="font-bold">Link sent to {sent}</p>
        <p>Open it, then sign in with that email and the same password. Your username stops working after that. Check spam too.</p>
      </div>
    );
  }

  const field = 'w-full h-12 px-4 border border-slate-200 rounded-xl font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
  return (
    <form onSubmit={submit} className="space-y-2 text-left">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Add your email</p>
      <p className="text-xs font-medium text-slate-500">A real email lets you open your own shop. After you open the link, sign in with the email instead of the username.</p>
      <input type="email" autoCapitalize="none" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your email" className={field} />
      <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your current password" className={field} />
      <button type="submit" disabled={busy || !email.trim() || !password} className="w-full h-12 rounded-xl bg-blue-600 font-bold text-white disabled:opacity-50">{busy ? 'Sending...' : 'Send verification link'}</button>
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
    </form>
  );
}
