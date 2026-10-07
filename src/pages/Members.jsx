import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Trash2, UserPlus, LogOut, ArrowUpCircle } from 'lucide-react';
import { broadcastSessionTerminated } from '../lib/sessionBroadcast';
import { deleteShopCascade, flushPendingWrites } from '../lib/firestoreUtils';

export default function Members() {
  const { user, shopId, shopAdminId, signOut, beginVoluntaryExit } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const isCreator = user?.uid === shopAdminId;

  // List only. Removal / shop-deleted / owner changes are handled globally in AuthContext.
  useEffect(() => {
    if (!shopId || !user?.uid) return;

    const unsubscribe = onSnapshot(doc(db, 'shops', shopId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        const membersMap = data.members || {};
        const memberList = Object.keys(membersMap).map(uid => ({
          uid,
          role: membersMap[uid] === 'admin' || uid === data.ownerId ? 'Admin' : 'Member',
          name: uid === user.uid ? 'You' : `Member ${uid.substring(0, 4)}`
        }));
        memberList.sort((a, b) => (a.uid === user.uid ? -1 : b.uid === user.uid ? 1 : 0));
        setMembers(memberList);
      }
      setLoading(false);
    }, (error) => {
      console.error('Members snapshot error:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [shopId, user?.uid]);

  const handleGenerateInvite = async () => {
    setIsGenerating(true);

    let code = '';
    let inviteRef = null;
    let isUnique = false;
    let attempts = 0;

    try {
      while (!isUnique && attempts < 5) {
        // Without functions to rate limit, we must use a sufficiently long code (e.g. 20 chars minimum or UUID)
        // to completely eliminate brute force viability even if they hit the database directly.
        code = crypto.randomUUID().replace(/-/g, '').substring(0, 20).toUpperCase();
        inviteRef = doc(db, 'invites', code);
        const inviteSnap = await getDoc(inviteRef);
        if (!inviteSnap.exists()) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        throw new Error("Could not generate a unique invite code after multiple attempts.");
      }

      const expiresAtMs = Date.now() + (30 * 60 * 1000); // 30 mins from now
      const expiresAt = Timestamp.fromMillis(expiresAtMs);
      await setDoc(inviteRef, {
        shopId,
        expiresAt,
        claimedBy: null,
        claimedAt: null,
        createdBy: user.uid
      });
      setInviteCode(code);
    } catch (error) {
      console.error(error);
      toast.error("Failed to generate invite code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveMember = async (targetUid) => {
    if (!isCreator || targetUid === user?.uid) return;
    if (window.confirm("Are you sure you want to remove this member?")) {
      try {
        const shopRef = doc(db, 'shops', shopId);
        await updateDoc(shopRef, {
           [`members.${targetUid}`]: deleteField()
        });
        toast.success("Member removed successfully.");
      } catch (_err) {
        console.error(_err);
        toast.error("Failed to remove member.");
      }
    }
  };

  const handleMakeAdmin = async (targetUid) => {
     if (!isCreator || targetUid === user?.uid) return;
     if (window.confirm("Make this member the new admin? You will become a regular member.")) {
        try {
           const shopRef = doc(db, 'shops', shopId);
           await updateDoc(shopRef, {
              [`members.${targetUid}`]: 'admin',
              [`members.${user.uid}`]: 'member',
              ownerId: targetUid
           });
           toast("Admin transferred successfully.");
        } catch (_err) {
           console.error(_err);
           toast.error("Failed to transfer admin role.");
        }
     }
  };

  const handleLeaveShop = async () => {
    if (!shopId || !user?.uid) return;
    if (!navigator.onLine) {
      toast.error('Go online to leave the shop.');
      return;
    }

    if (isCreator && members.length > 1) {
      toast('You are the admin. Make another member admin first, or remove all members.');
      return;
    }

    const msg = isCreator
      ? 'You are the only member. This permanently deletes the shop and ALL its bills. Continue?'
      : 'Are you sure you want to leave this shop?';
    if (!window.confirm(msg)) return;

    // Queued offline bills would be lost once access is gone.
    if (!(await flushPendingWrites())) {
      toast.error('Unsynced bills pending. Stay online until they sync, then retry.');
      return;
    }

    try {
      beginVoluntaryExit();
      if (isCreator) {
        await deleteShopCascade(shopId);
        broadcastSessionTerminated();
      } else {
        await updateDoc(doc(db, 'shops', shopId), { [`members.${user.uid}`]: deleteField() });
      }
      await signOut({ force: true });
    } catch (err) {
      console.error(err);
      toast.error(isCreator ? 'Failed to delete shop.' : 'Failed to leave shop.');
    }
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-900">Shop Members</h1>
      </header>

<main className="p-4 space-y-6">
        {isCreator && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
            {inviteCode ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-500">Share this code with the new member</p>
                <div className="text-xl md:text-2xl font-black text-blue-600 tracking-[0.1em] py-4 px-2 break-all bg-blue-50 rounded-xl">{inviteCode}</div>
                <p className="text-xs text-orange-600 font-medium">Expires in 30 minutes.</p>
                <button onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'invites', inviteCode));
                    setInviteCode(null);
                  } catch {
                    toast.error("Failed to cancel invite.");
                  }
                }} className="mt-4 text-sm text-slate-500 underline">
                  Cancel Invite
                </button>
              </div>
            ) : (
              <button onClick={handleGenerateInvite} disabled={isGenerating} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl flex justify-center items-center gap-2 active:bg-blue-700 disabled:opacity-50">
                <UserPlus size={20} /> {isGenerating ? 'Generating...' : 'Invite Member'}
              </button>
            )}
          </div>
        )}

        <div>
          <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 px-1">Active Members</h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-50">
              {members.map(member => (
                <div key={member.uid} className="flex justify-between items-center p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                      {member.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{member.name}</p>
                      <p className="text-xs text-slate-500">{member.role}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isCreator && member.uid !== user.uid && (
                      <>
                        <button onClick={() => handleMakeAdmin(member.uid)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-colors" title="Make Admin">
                          <ArrowUpCircle size={18} />
                        </button>
                        <button onClick={() => handleRemoveMember(member.uid)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Remove Member">
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleLeaveShop} className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-red-50 text-red-600 font-bold rounded-xl active:bg-red-100">
          <LogOut size={18} /> Leave Shop
        </button>

      </main>
      <BottomNav />
    </div>
  );
}
