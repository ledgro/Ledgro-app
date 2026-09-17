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

      // Initialize with memberIds array for easier querying as we implemented in AuthContext
      const docRef = await addDoc(shopsRef, {
        name: shopName.trim(),
        ownerId: user.uid,
        memberIds: [user.uid]
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
        if (shopSnap.exists() && shopSnap.data().memberIds?.includes(user.uid)) {
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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        <h2 className="text-center text-3xl font-extrabold text-gray-900">
          Welcome to Ledgro
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          {mode === 'create' ? 'What is the name of your business?' : 'Enter the code to join a shop'}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-sm sm:rounded-lg sm:px-10 border border-gray-100">

          <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
            <button
              onClick={() => { setMode('create'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'create' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Create New Shop
            </button>
            <button
              onClick={() => { setMode('join'); setError(''); }}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
                mode === 'join' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Join a Shop
            </button>
          </div>

          {mode === 'create' ? (
            <form className="space-y-6" onSubmit={handleCreate}>
              <div>
                <label htmlFor="shopName" className="block text-sm font-medium text-gray-700">
                  Shop Name
                </label>
                <div className="mt-1">
                  <input
                    id="shopName"
                    name="shopName"
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    className="appearance-none block w-full px-3 py-3 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    placeholder="e.g. Kerala Supermarket"
                  />
                </div>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div>
                <button
                  type="submit"
                  disabled={loading || !shopName.trim()}
                  className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                    loading || !shopName.trim() ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors`}
                >
                  {loading ? 'Creating...' : 'Continue'}
                </button>
              </div>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleJoin}>
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700">
                  6-Digit Invite Code
                </label>
                <div className="mt-1">
                  <input
                    id="inviteCode"
                    name="inviteCode"
                    type="text"
                    required
                    maxLength={6}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="appearance-none block w-full px-3 py-4 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-center text-2xl font-bold tracking-widest uppercase"
                    placeholder="XXXXXX"
                  />
                </div>
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}

              <div>
                <button
                  type="submit"
                  disabled={loading || inviteCode.length !== 6}
                  className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${
                    loading || inviteCode.length !== 6 ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors`}
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
