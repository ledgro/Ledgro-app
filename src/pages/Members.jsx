import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, clearIndexedDbPersistence, serverTimestamp, terminate } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Trash2, UserPlus, LogOut, ArrowUpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { hapticVibrate } from '../lib/utils';

export default function Members() {
  const { user, shopId, shopAdminId, signOut } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Admin Recovery State
  const [recoveryDoc, setRecoveryDoc] = useState(null);
  const [isRequestingRecovery, setIsRequestingRecovery] = useState(false);

  const isCreator = user?.uid === shopAdminId;



  useEffect(() => {

    if (!shopId) return;
    const unsubscribe = onSnapshot(doc(db, 'shops', shopId), (docSnap) => {
      // existing logic
      if (docSnap.exists()) {
        const data = docSnap.data({ serverTimestamps: 'estimate' });
        const membersMap = data.members || {};
        const memberList = Object.keys(membersMap).map(uid => ({
          uid,
          role: membersMap[uid] === 'admin' || uid === data.ownerId ? 'Admin (Hidden)' : 'Member',
          name: uid === user.uid ? 'You' : `Member ${uid.substring(0, 4)}`
        }));
        memberList.sort((a) => (a.uid === user.uid ? -1 : 1));
        setMembers(memberList);
      }
      setLoading(false);
    });

    // Listen to adminRecovery doc
    const unsubRecovery = onSnapshot(doc(db, 'adminRecovery', shopId), (snap) => {
      if (snap.exists()) {
        const data = snap.data({ serverTimestamps: 'estimate' });
        if (data.status === 'pending') {
          // Check auto-elevation
          const reqTime = data.requestedAt?.toDate ? data.requestedAt.toDate() : new Date();
          const daysPassed = (new Date() - reqTime) / (1000 * 60 * 60 * 24);
          if (daysPassed >= 14 && data.requestedBy === user.uid) {
             // Auto-elevate
             autoElevateAdmin(data, shopId);
          } else {
             setRecoveryDoc({ id: snap.id, ...data });
          }
        } else {
          setRecoveryDoc(null);
        }
      } else {
        setRecoveryDoc(null);
      }
    });

    return () => { unsubscribe(); unsubRecovery(); };
  }, [shopId, user.uid]);

  async function autoElevateAdmin(data, currentShopId) {
     try {
       if (!currentShopId) return;
       const shopRef = doc(db, 'shops', currentShopId);
       const shopSnap = await getDoc(shopRef);
       if (shopSnap.exists()) {
          const oldAdmin = shopSnap.data({ serverTimestamps: 'estimate' }).ownerId;
          await updateDoc(shopRef, {
             [`members.${data.requestedBy}`]: 'admin',
             [`members.${oldAdmin}`]: 'member',
             ownerId: data.requestedBy
          });
          await updateDoc(doc(db, 'adminRecovery', currentShopId), { status: 'approved' });
          toast("14 days have passed. You are now the admin.");
       }
     } catch (_error) { console.error(_err); }
  }

  const handleRequestRecovery = async () => {
    if (!window.confirm("Request admin access? If the current admin does not respond in 14 days, you will automatically become the admin.")) return;
    setIsRequestingRecovery(true);
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 14);
      await setDoc(doc(db, 'adminRecovery', shopId), {
        requestedBy: user.uid,
        requestedAt: serverTimestamp(),
        shopId: shopId,
        status: 'pending',
        expiresAt: expiresAt
      });
      toast("Request submitted.");
    } catch (_error) {
      toast.error("Failed to submit request.");
    } finally {
      setIsRequestingRecovery(false);
    }
  };

  const handleApproveRecovery = async () => {
     if (!recoveryDoc) return;
     try {
       const targetUid = recoveryDoc.requestedBy;
       const shopRef = doc(db, 'shops', shopId);
       await updateDoc(shopRef, {
          [`members.${targetUid}`]: 'admin',
          [`members.${user.uid}`]: 'member',
          ownerId: targetUid
       });
       await updateDoc(doc(db, 'adminRecovery', shopId), { status: 'approved' });
       toast("Admin transferred successfully.");
     } catch (_error) {
       toast.error("Failed to transfer admin role.");
     }
  };

  const handleRejectRecovery = async () => {
     try {
       await deleteDoc(doc(db, 'adminRecovery', shopId));
     } catch (_error) {}
  };

  useEffect(() => {
    return () => {
      if (inviteListenerRef.current) inviteListenerRef.current();
    };
  }, []);

  const handleGenerateInvite = async () => {
    setIsGenerating(true);
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const code = Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => chars[b % chars.length]).join('');

    try {
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);
      const inviteRef = doc(db, 'invites', code);
      await setDoc(inviteRef, { shopId, expiresAt, claimedBy: null, claimed: false });
      setInviteCode(code);

      if (inviteListenerRef.current) inviteListenerRef.current();

      inviteListenerRef.current = onSnapshot(inviteRef, async (snap) => {
        if (!snap.exists()) return;
        const data = snap.data({ serverTimestamps: 'estimate' });
        if (data.claimedBy || data.claimed) {
          try {
            const shopRef = doc(db, 'shops', shopId);
            const shopSnap = await getDoc(shopRef);
            if (shopSnap.exists()) {
              const currentMembers = shopSnap.data({ serverTimestamps: 'estimate' }).members || {};
              if (!currentMembers[data.claimedBy || data.claimed]) {
                await updateDoc(shopRef, { [`members.${data.claimedBy || data.claimed}`]: 'member' });
              }
            }
            await deleteDoc(inviteRef);
            setInviteCode(null);
            if (inviteListenerRef.current) inviteListenerRef.current();
            toast.success("New member joined successfully!");
          } catch (_error) {}
        }
      });

    } catch (_error) {
      toast.error("Failed to generate invite code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveMember = async (targetUid) => {
    if (!isCreator || targetUid === user.uid) return;
    if (!window.confirm("Remove this member?")) return;
    if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate(20);

    try {
      const shopRef = doc(db, 'shops', shopId);
      const shopSnap = await getDoc(shopRef);
      if (shopSnap.exists()) {
        const currentMembers = { ...shopSnap.data({ serverTimestamps: 'estimate' }).members };
        delete currentMembers[targetUid];
        await updateDoc(shopRef, { members: currentMembers });
        if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate([50, 30, 50]);
      }
    } catch (_error) {
      toast.error("Failed to remove member.");
    }
  };

  const handleMakeAdmin = async (targetUid) => {
     if (!isCreator || targetUid === user.uid) return;
     if (window.confirm("Make this member the new admin? You will become a regular member.")) {
        try {
           const shopRef = doc(db, 'shops', shopId);
           await updateDoc(shopRef, {
              [`members.${targetUid}`]: 'admin',
              [`members.${user.uid}`]: 'member',
              ownerId: targetUid
           });
           toast("Admin transferred successfully.");
        } catch (_error) {
           console.error(_err);
           toast.error("Failed to transfer admin role.");
        }
     }
  };

  const handleLeaveShop = async () => {
    if (!shopId) return;

    if (isCreator) {
       if (members.length > 1) {
          toast("You are the admin. Transfer admin role to another member before leaving, or remove all members first.");
          return;
       }
       if (window.confirm("You are the only member. This will permanently delete the shop. Continue?")) {
          try {
             await deleteDoc(doc(db, 'shops', shopId));
             await handleWipeAndExit();
          } catch (_error) {
             toast.error("Failed to delete shop.");
          }
       }
    } else {
       if (window.confirm("Are you sure you want to leave this shop?")) {
          try {
             const shopRef = doc(db, 'shops', shopId);
             const shopSnap = await getDoc(shopRef);
             if (shopSnap.exists()) {
                const currentMembers = { ...shopSnap.data({ serverTimestamps: 'estimate' }).members };
                delete currentMembers[user.uid];
                await updateDoc(shopRef, { members: currentMembers });
                await handleWipeAndExit();
             }
          } catch (_error) {
             toast.error("Failed to leave shop.");
          }
       }
    }
  };

const handleWipeAndExit = async () => {
    try {
       await terminate(db);
       await clearIndexedDbPersistence(db);
    } catch(e) {
       console.log('IndexedDB clear skipped or failed', e);
    }
    await signOut();
  };

  return (
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-20">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-900">Shop Members</h1>
      </header>

<main className="p-4 space-y-6">
        {recoveryDoc && recoveryDoc.requestedBy !== user.uid && isCreator && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl shadow-sm">
            <h3 className="font-bold text-amber-900 mb-1">Admin Access Requested</h3>
            <p className="text-sm text-amber-700 mb-4">Member {recoveryDoc.requestedBy.substring(0,4)} has requested to become the admin. If you do not respond within 14 days, they will automatically be elevated.</p>
            <div className="flex gap-2">
              <button onClick={handleApproveRecovery} className="flex-1 bg-amber-600 text-white font-bold py-2 rounded-lg">Approve</button>
              <button onClick={handleRejectRecovery} className="flex-1 bg-white border border-amber-300 text-amber-700 font-bold py-2 rounded-lg">Reject</button>
            </div>
          </div>
        )}

        {recoveryDoc && recoveryDoc.requestedBy === user.uid && (
          <div className="bg-blue-50 border border-blue-200 p-4 rounded-2xl shadow-sm text-center">
            <h3 className="font-bold text-blue-900 mb-1">Request Pending</h3>
            <p className="text-sm text-blue-700">Your request for admin access is pending. If the admin does not respond within 14 days, you will automatically be elevated.</p>
          </div>
        )}

        {!isCreator && !recoveryDoc && (
          <button
            onClick={handleRequestRecovery}
            disabled={isRequestingRecovery}
            className="w-full bg-slate-100 text-slate-700 font-bold py-4 rounded-xl active:bg-slate-200"
          >
            {isRequestingRecovery ? 'Requesting...' : 'Request Admin Access'}
          </button>
        )}

        {isCreator && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 text-center">
            {inviteCode ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-500">Show this code to the new member</p>
                <div className="text-5xl font-black text-blue-600 tracking-[0.2em] py-4 bg-blue-50 rounded-xl">{inviteCode}</div>
                <p className="text-xs text-orange-600 font-medium">Expires in 30 minutes. Do not close this screen.</p>
                <button onClick={() => { deleteDoc(doc(db, 'invites', inviteCode)); setInviteCode(null); }} className="mt-4 text-sm text-slate-500 underline">
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
                      <p className="text-xs text-slate-500">Shop Member</p>
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
