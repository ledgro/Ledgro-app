import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';

const ShopSetup = () => {
  const { user, setHasShop, setShopId } = useAuth();
  const navigate = useNavigate();

  const [shopName, setShopName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('create'); // 'create' | 'join'

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!shopName.trim()) return;

    try {
      setLoading(true);
      setError('');

      const shopsRef = collection(db, 'shops');

      const docRef = await addDoc(shopsRef, {
        name: shopName.trim(),
        ownerId: user.uid,
        members: {
          [user.uid]: Date.now()
        }
      });

      setShopId(docRef.id);
      setHasShop(true);
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setError('Failed to create shop. Please try again.');
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (code.length !== 6) {
      setError("Please enter a valid 6-digit code");
      return;
    }

    try {
      setLoading(true);
      setError('');

      const inviteRef = doc(db, 'invites', code);
      const inviteSnap = await getDoc(inviteRef);

      if (!inviteSnap.exists()) {
        throw new Error("Invalid or expired code.");
      }

      const data = inviteSnap.data();
      if (new Date() > data.expiresAt.toDate()) {
        throw new Error("This code has expired.");
      }

      // Update the invite document to signal the creator's client
      await updateDoc(inviteRef, {
        claimedBy: user.uid
      });

      // We don't manually navigate here. The creator's client will add us to the shop,
      // and our AuthContext onSnapshot/listener or a forced refresh will pick it up.
      // For instant UX, we wait a few seconds, then manually fetch to see if we're in.
      // A more robust way is to just let AuthContext do its job, but we'll manually poll for UX speed.
      let retries = 0;
      const poll = setInterval(async () => {
        retries++;
        const shopSnap = await getDoc(doc(db, 'shops', data.shopId));
        if (shopSnap.exists() && shopSnap.data().members?.[user.uid]) {
          clearInterval(poll);
          setShopId(data.shopId);
          setHasShop(true);
          navigate('/dashboard');
        } else if (retries > 10) {
          clearInterval(poll);
          setError("Timeout waiting for shop creator to process. Please try logging in again.");
          setLoading(false);
        }
      }, 1000);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to join shop.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
          Welcome to Ledgro
        </h2>
        <p className="mt-2 text-center text-base text-slate-500 font-medium">
          {mode === 'create' ? 'What is the name of your business?' : 'Enter the code to join a shop'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-subtle sm:rounded-2xl border border-slate-100">

          <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
            <button
              onClick={() => { setMode('create'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                mode === 'create' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Create New Shop
            </button>
            <button
              onClick={() => { setMode('join'); setError(''); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                mode === 'join' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Join a Shop
            </button>
          </div>

          {mode === 'create' ? (
            <form className="space-y-6" onSubmit={handleCreate}>
              <div>
                <label htmlFor="shopName" className="block text-sm font-medium text-slate-700">
                  Shop Name
                </label>
                <div className="mt-2">
                  <input
                    id="shopName"
                    name="shopName"
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="appearance-none block w-full px-4 h-14 border border-slate-200 rounded-xl shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-medium transition-all"
                    placeholder="e.g. Kerala Supermarket"
                  />
                </div>
              </div>

              {error && <div className="text-sm text-red-600 font-medium">{error}</div>}

              <div>
                <button
                  type="submit"
                  disabled={loading || !shopName.trim()}
                  className={`w-full flex justify-center items-center h-14 px-4 rounded-xl shadow-sm text-base font-bold text-white transition-all active:scale-[0.98] ${
                    loading || !shopName.trim() ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                >
                  {loading ? 'Creating...' : 'Get Started'}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleJoin}>
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-slate-700">
                  6-Digit Invite Code
                </label>
                <div className="mt-2">
                  <input
                    id="inviteCode"
                    name="inviteCode"
                    type="text"
                    required
                    maxLength={6}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="appearance-none block w-full px-4 h-16 border border-slate-200 rounded-xl shadow-sm placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-3xl font-black tracking-[0.2em] uppercase transition-all"
                    placeholder="XXXXXX"
                  />
                </div>
              </div>

              {error && <div className="text-sm text-red-600 font-medium">{error}</div>}

              <div>
                <button
                  type="submit"
                  disabled={loading || inviteCode.length !== 6}
                  className={`w-full flex justify-center items-center h-14 px-4 rounded-xl shadow-sm text-base font-bold text-white transition-all active:scale-[0.98] ${
                    loading || inviteCode.length !== 6 ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
                >
                  {loading ? 'Waiting for creator...' : 'Join Shop'}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default ShopSetup;
