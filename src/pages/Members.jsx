import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, deleteField, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { Trash2, UserPlus, LogOut, ArrowUpCircle, ShieldCheck, ShieldOff } from 'lucide-react';
import { broadcastSessionTerminated } from '../lib/sessionBroadcast';
import { deleteShopCascade, flushPendingWrites } from '../lib/firestoreUtils';
import { useNameOf } from '../lib/memberNames';
import { confirm } from '../lib/confirm';
import { createStaffLogin } from '../lib/createStaffLogin';
import { usernameError, passwordError, authMessage } from '../lib/staffLogin';

export default function Members() {
  const { user, shopId, shopAdminId, signOut, beginVoluntaryExit } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [staffForm, setStaffForm] = useState(null); // { username, password } while the form is open
  const [staffDone, setStaffDone] = useState(null); // login to hand over after creating
  const [creatingStaff, setCreatingStaff] = useState(false);

  const nameOf = useNameOf(shopId, user?.uid);
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
          role: membersMap[uid] === 'admin' || uid === data.ownerId ? 'Admin' : 'Member'
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

      const expiresAtMs = Date.now() + (30 * 60 * 1000);
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

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (creatingStaff || !staffForm) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const err = usernameError(staffForm.username) || passwordError(staffForm.password);
    if (err) { toast.error(err); return; }
    setCreatingStaff(true);
    try {
      const username = await createStaffLogin({ shopId, username: staffForm.username, password: staffForm.password });
      setStaffDone({ username, password: staffForm.password });
      setStaffForm(null);
    } catch (error) {
      console.error(error);
      toast.error(error.userFacing ? error.message : error?.code?.startsWith('auth/') ? authMessage(error) : 'Could not add this person. Try again.');
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleRemoveMember = async (targetUid) => {
    if (!isCreator || targetUid === user?.uid) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (await confirm({ title: 'Remove member?', message: 'They lose access to this shop.', confirmText: 'Remove', danger: true })) {
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

  const handleSetRole = async (targetUid, role) => {
    if (!isCreator || targetUid === user?.uid) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    const msg = role === 'admin'
      ? 'Make this member an admin? They can manage products, members and settings. You stay admin.'
      : 'Make this admin a regular member?';
    if (!(await confirm({ title: 'Change role?', message: msg, confirmText: 'Change' }))) return;
    try {
      await updateDoc(doc(db, 'shops', shopId), { [`members.${targetUid}`]: role });
      toast.success(role === 'admin' ? 'Now an admin.' : 'Now a member.');
    } catch (err) {
      console.error(err);
      toast.error('Could not change role.');
    }
  };

  const handleMakeAdmin = async (targetUid) => {
     if (!isCreator || targetUid === user?.uid) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
     if (await confirm({ title: 'Transfer admin?', message: 'This member becomes the admin. You become a regular member.', confirmText: 'Transfer', danger: true })) {
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
    if (!(await confirm({ title: isCreator ? 'Delete shop?' : 'Leave shop?', message: msg, confirmText: isCreator ? 'Delete shop' : 'Leave', danger: true }))) return;

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
    <div className="h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center">
        <h1 className="text-xl font-bold text-slate-900">Shop Members</h1>
      </header>

<main className="p-4 space-y-6">
        {isCreator && (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-3">
            {staffDone ? (
              <div className="space-y-3 text-center">
                <p className="text-sm font-medium text-slate-500">Give these to your staff member. The password is not shown again.</p>
                <div className="rounded-xl bg-blue-50 p-4 text-left font-mono text-sm text-blue-900">
                  <p>Username: <b>{staffDone.username}</b></p>
                  <p>Password: <b>{staffDone.password}</b></p>
                </div>
                <button type="button" onClick={() => setStaffDone(null)} className="text-sm font-bold text-blue-600">Done</button>
              </div>
            ) : staffForm ? (
              <form onSubmit={handleCreateStaff} className="space-y-3">
                <p className="text-sm font-bold text-slate-900">New staff login</p>
                <input value={staffForm.username} onChange={(e) => setStaffForm((f) => ({ ...f, username: e.target.value }))} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={20}
                  placeholder="Username, e.g. ravi" className="w-full h-12 px-4 border border-slate-200 rounded-xl font-medium" />
                <input value={staffForm.password} onChange={(e) => setStaffForm((f) => ({ ...f, password: e.target.value }))} type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={64}
                  placeholder="Password (8+ characters)" className="w-full h-12 px-4 border border-slate-200 rounded-xl font-medium" />
                <div className="flex gap-2">
                  <button type="button" disabled={creatingStaff} onClick={() => setStaffForm(null)} className="h-12 flex-1 rounded-xl bg-slate-100 font-bold text-slate-600">Cancel</button>
                  <button type="submit" disabled={creatingStaff} className="h-12 flex-[2] rounded-xl bg-blue-600 font-bold text-white disabled:opacity-50">{creatingStaff ? 'Creating...' : 'Create login'}</button>
                </div>
                <p className="text-xs text-slate-500">They sign in on the Ledgro login screen with this username and password.</p>
              </form>
            ) : (
              <button type="button" onClick={() => setStaffForm({ username: '', password: '' })} className="w-full h-12 rounded-xl border border-slate-200 font-bold text-slate-800 flex items-center justify-center gap-2 active:bg-slate-50">
                <UserPlus size={18} /> Create staff login (username and password)
              </button>
            )}
          </div>
        )}
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
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 px-1">Active Members</h2>
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-50">
              {members.map(member => (
                <div key={member.uid} className="flex justify-between items-center p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                      {nameOf(member.uid).charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{nameOf(member.uid)}</p>
                      <p className="text-xs text-slate-500">{member.role}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {isCreator && member.uid !== user.uid && (
                      <>
                        {member.role === 'Admin' ? (
                          member.uid !== shopAdminId && (
                            <button onClick={() => handleSetRole(member.uid, 'member')} className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors" title="Make member" aria-label="Make member">
                              <ShieldOff size={18} />
                            </button>
                          )
                        ) : (
                          <button onClick={() => handleSetRole(member.uid, 'admin')} className="p-2 text-green-600 hover:bg-green-50 rounded-full transition-colors" title="Make admin" aria-label="Make admin">
                            <ShieldCheck size={18} />
                          </button>
                        )}
                        <button onClick={() => handleMakeAdmin(member.uid)} className="p-2 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-full transition-colors" title="Transfer ownership" aria-label="Transfer ownership">
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
