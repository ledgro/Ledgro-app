import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Users, Trash2, UserPlus } from 'lucide-react';

export default function Members() {
  const { user, shopId, shopAdminId } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [inviteCode, setInviteCode] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const isCreator = user?.uid === shopAdminId;

  // Fetch shop members
  useEffect(() => {
    if (!shopId) return;

    // Use onSnapshot to instantly reflect when a new member is added
    const unsubscribe = onSnapshot(doc(db, 'shops', shopId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();

        // Ensure the creator is at the top.
        const membersMap = data.members || {};
        const memberList = Object.keys(membersMap).map(uid => ({
          uid,
          role: uid === data.ownerId ? 'Admin (Hidden)' : 'Member',
          name: uid === user.uid ? 'You' : `Member ${uid.substring(0, 4)}`
        }));

        // Make sure creator is shown even if missing from members map legacy data
        if (!membersMap[data.ownerId]) {
          memberList.unshift({
            uid: data.ownerId,
            role: 'Admin (Hidden)',
            name: data.ownerId === user.uid ? 'You' : `Member ${data.ownerId.substring(0, 4)}`
          });
        }

        // Sort so the logged-in user is at top
        memberList.sort((a, b) => (a.uid === user.uid ? -1 : 1));

        setMembers(memberList);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [shopId, user.uid]);

  // Handle generating 6 digit code
  const handleGenerateInvite = async () => {
    setIsGenerating(true);

    // Generate 6 digit alphanumeric
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      const inviteRef = doc(db, 'invites', code);
      await setDoc(inviteRef, {
        shopId,
        expiresAt,
        claimedBy: null
      });

      setInviteCode(code);

      // Listen for the claim
      const unsubscribe = onSnapshot(inviteRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();

        if (data.claimedBy) {
          // A new user has entered the code! Add them to the shop.
          try {
            const shopRef = doc(db, 'shops', shopId);
            const shopSnap = await getDoc(shopRef);
            if (shopSnap.exists()) {
              const currentMembers = shopSnap.data().members || {};
              if (!currentMembers[data.claimedBy]) {
                await updateDoc(shopRef, {
                  [`members.${data.claimedBy}`]: Date.now()
                });
              }
            }
            // Cleanup the invite
            await deleteDoc(inviteRef);
            setInviteCode(null);
            unsubscribe();
            alert("New member joined successfully!");
          } catch (e) {
            console.error("Failed to add member to shop", e);
          }
        }
      });

    } catch (err) {
      console.error(err);
      alert("Failed to generate invite code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveMember = async (targetUid) => {
    if (!isCreator || targetUid === user.uid) return;
    if (!window.confirm("Remove this member?")) return;

    try {
      const shopRef = doc(db, 'shops', shopId);
      const shopSnap = await getDoc(shopRef);
      if (shopSnap.exists()) {
        const currentMembers = { ...shopSnap.data().members };
        delete currentMembers[targetUid];

        await updateDoc(shopRef, {
          members: currentMembers
        });
      }
    } catch (err) {
      console.error("Failed to remove member", err);
      alert("Failed to remove member.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 px-4 py-3">
        <h1 className="text-xl font-bold text-gray-900">Shop Members</h1>
      </header>

      <main className="p-4 space-y-6">

        {/* Invite Section (Only visible to Creator but disguised) */}
        {isCreator && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 text-center">
            {inviteCode ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-500">Show this code to the new member</p>
                <div className="text-5xl font-black text-indigo-600 tracking-[0.2em] py-4 bg-indigo-50 rounded-xl">
                  {inviteCode}
                </div>
                <p className="text-xs text-orange-600 font-medium">Expires in 30 minutes. Do not close this screen.</p>
                <button
                  onClick={() => {
                    deleteDoc(doc(db, 'invites', inviteCode));
                    setInviteCode(null);
                  }}
                  className="mt-4 text-sm text-gray-500 underline"
                >
                  Cancel Invite
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateInvite}
                disabled={isGenerating}
                className="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 active:bg-indigo-700 disabled:opacity-50"
              >
                <UserPlus size={20} />
                {isGenerating ? 'Generating...' : 'Invite Member'}
              </button>
            )}
          </div>
        )}

        {/* Member List */}
        <div>
          <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 px-1">Active Members</h2>

          {loading ? (
            <div className="flex justify-center py-8">
               <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-gray-50">
              {members.map(member => (
                <div key={member.uid} className="flex justify-between items-center p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{member.name}</p>
                      <p className="text-xs text-gray-500">Shop Member</p>
                    </div>
                  </div>

                  {/* Silent Remove Button (Only creator sees it, no labels indicating they are admin) */}
                  {isCreator && member.uid !== user.uid && (
                    <button
                      onClick={() => handleRemoveMember(member.uid)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </main>
      <BottomNav />
    </div>
  );
}
