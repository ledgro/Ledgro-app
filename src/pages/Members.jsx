import { toast } from 'sonner';
import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { collection, doc, getDoc, deleteDoc, updateDoc, onSnapshot, deleteField, limit, query, Timestamp, writeBatch } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { Drawer } from 'vaul';
import { serverNow, CLOCK_MSG } from '../lib/clockDrift';
import { logActivity } from '../lib/audit';
import { sheetStyle } from '../hooks/useKeyboardInset';
import { db } from '../firebase';
import BottomNav from '../components/BottomNav';
import { ListSkeleton } from '../components/Skeleton';
import { useShowLoader } from '../hooks/useShowLoader';
import { Trash2, UserPlus, LogOut, ArrowUpCircle, ShieldCheck, ShieldOff, MoreVertical } from 'lucide-react';
import { broadcastSessionTerminated } from '../lib/sessionBroadcast';
import { deleteShopCascade, flushPendingWrites } from '../lib/firestoreUtils';
import { useNameOf, useMemberNames } from '../lib/memberNames';
import { confirm } from '../lib/confirm';

export default function Members() {
  const { user, shopId, shopAdminId, signOut, beginVoluntaryExit } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const showLoader = useShowLoader(loading);
  const [inviteCode, setInviteCode] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [menuUid, setMenuUid] = useState(null); // whose action menu is open
  const navigate = useNavigate();

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
      setLoadError(false);
      setLoading(false);
    }, (error) => {
      console.error('Members snapshot error:', error);
      setLoadError(true);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [shopId, user?.uid]);

  // Live names, so a person who just joined shows their name here instead of a placeholder.
  useEffect(() => {
    if (!shopId) return undefined;
    return onSnapshot(query(collection(db, `shops/${shopId}/memberProfiles`), limit(100)), (snap) => {
      const names = {};
      snap.forEach((d) => { names[d.id] = d.data().name; });
      useMemberNames.getState().setAll(shopId, names);
    }, (err) => console.warn('Member names listener', err));
  }, [shopId]);

  const handleGenerateInvite = async () => {
    setIsGenerating(true);

    let code = '';
    let inviteRef = null;
    let isUnique = false;
    let attempts = 0;

    try {
      while (!isUnique && attempts < 5) {
        // 8 letters/digits (no look-alikes). A code lives 30 minutes and works once, so guessing one is not practical.
        code = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
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

      // Server time, like sales: the rules check the invite against the server clock, not this phone's.
      const expiresAt = Timestamp.fromMillis((await serverNow()).getTime() + (30 * 60 * 1000));
      const batch = writeBatch(db);
      batch.set(inviteRef, {
        shopId,
        expiresAt,
        claimedBy: null,
        claimedAt: null,
        createdBy: user.uid
      });
      logActivity(batch, shopId, user.uid, { action: 'member_invite', note: 'invite code created' });
      await batch.commit();
      setInviteCode(code);
    } catch (error) {
      console.error(error);
      toast.error(error?.message === 'CLOCK' ? CLOCK_MSG : "Failed to generate invite code");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRemoveMember = async (targetUid) => {
    if (!isCreator || targetUid === user?.uid) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
    if (await confirm({ title: 'Remove member?', message: 'They lose access to this shop.', confirmText: 'Remove', danger: true })) {
      try {
        const batch = writeBatch(db);
        batch.update(doc(db, 'shops', shopId), { [`members.${targetUid}`]: deleteField() });
        logActivity(batch, shopId, user.uid, { action: 'member_remove', note: `removed ${nameOf(targetUid)}`.slice(0, 200) });
        await batch.commit();
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
      const batch = writeBatch(db);
      batch.update(doc(db, 'shops', shopId), { [`members.${targetUid}`]: role });
      logActivity(batch, shopId, user.uid, { action: 'member_role', note: `${nameOf(targetUid)} is now ${role}`.slice(0, 200) });
      await batch.commit();
      toast.success(role === 'admin' ? 'Now an admin.' : 'Now a member.');
    } catch (err) {
      console.error(err);
      toast.error('Could not change role.');
    }
  };

  const handleMakeAdmin = async (targetUid) => {
     if (!isCreator || targetUid === user?.uid) return;
    if (!navigator.onLine) { toast.error('You are offline. Reconnect and try again. Nothing was saved.'); return; }
     if (await confirm({ title: 'Transfer ownership?', message: 'This member becomes the owner and you become a regular member. Only do this if they can sign in with Google or an email, because a staff username account has no recovery if its password is lost.', confirmText: 'Transfer', danger: true })) {
        try {
           const batch = writeBatch(db);
           batch.update(doc(db, 'shops', shopId), {
              [`members.${targetUid}`]: 'admin',
              [`members.${user.uid}`]: 'member',
              ownerId: targetUid
           });
           logActivity(batch, shopId, user.uid, { action: 'owner_transfer', note: `to ${nameOf(targetUid)}`.slice(0, 200) });
           await batch.commit();
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

    if (isCreator) {
      // Deleting a whole shop needs a fresh sign-in and typing DELETE: that flow lives in Settings.
      toast('To delete the shop, use Settings > Delete shop data. It asks you to sign in again and type DELETE.');
      navigate('/settings');
      return;
    }
    if (!(await confirm({ title: 'Leave shop?', message: 'Are you sure you want to leave this shop?', confirmText: 'Leave', danger: true }))) return;

    // Queued offline bills would be lost once access is gone.
    if (!(await flushPendingWrites())) {
      toast.error('Unsynced bills pending. Stay online until they sync, then retry.');
      return;
    }

    try {
      beginVoluntaryExit();
      if (isCreator) {
        toast.loading('Deleting shop...', { id: 'del-shop' });
        await deleteShopCascade(shopId, (m) => toast.loading(m, { id: 'del-shop' }));
        toast.dismiss('del-shop');
        broadcastSessionTerminated();
      } else {
        await updateDoc(doc(db, 'shops', shopId), { [`members.${user.uid}`]: deleteField() });
      }
      await signOut({ force: true });
    } catch (err) {
      console.error(err);
      toast.dismiss('del-shop');
      toast.error(isCreator ? `Could not delete the whole shop (${err?.code || 'error'}). Some data may be gone. Tap Delete shop again to finish.` : 'Failed to leave shop.');
    }
  };

  return (
    <div className="page-bg h-[100dvh] overflow-y-auto bg-slate-50 flex flex-col pb-nav">
      <header className="px-5 pt-5 pb-1 flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Shop Members</h1>
      </header>

<main className="px-5 py-3 space-y-6">
        {isCreator && (
          <div className="text-center">
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
          <h2 className="text-base font-extrabold text-slate-900 mb-1">Active Members</h2>
          {loading ? (
            showLoader ? <ListSkeleton rows={3} /> : null
          ) : loadError ? (
            <p role="alert" className="py-4 text-sm font-medium text-red-600">Could not load the members. Check your connection, then reopen this page.</p>
          ) : (
            <div className="divide-y divide-slate-200/80">
              {members.map(member => (
                <div key={member.uid} className="flex justify-between items-center py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="w-11 h-11 flex-shrink-0 bg-gradient-to-br from-blue-400 to-blue-700 text-white rounded-full flex items-center justify-center font-extrabold">
                      {nameOf(member.uid).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{nameOf(member.uid)}</p>
                      <p className="text-xs text-slate-500">{member.role}</p>
                    </div>
                  </div>
                  {isCreator && member.uid !== user.uid && (
                    <button type="button" aria-label={`Actions for ${nameOf(member.uid)}`} onClick={() => setMenuUid(member.uid)} className="press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-slate-500 active:bg-slate-200/70"><MoreVertical size={20} /></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button onClick={handleLeaveShop} className="w-full mt-4 flex items-center justify-center gap-2 py-4 bg-red-50 text-red-600 font-bold rounded-xl active:bg-red-100">
          <LogOut size={18} /> Leave Shop
        </button>

      </main>
      <Drawer.Root handleOnly repositionInputs={false} open={!!menuUid} onOpenChange={(o) => { if (!o) setMenuUid(null); }}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 z-[60]" />
          <Drawer.Content style={sheetStyle} aria-describedby={undefined} className="bg-white flex flex-col rounded-t-[20px] fixed bottom-0 left-0 right-0 z-[61] focus:outline-none">
            <div className="p-4 pb-safe">
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-gray-300" />
              <Drawer.Title className="mb-2 truncate text-lg font-extrabold text-slate-900">{menuUid ? nameOf(menuUid) : ''}</Drawer.Title>
              {(() => {
                const m = members.find((x) => x.uid === menuUid);
                if (!m) return null;
                const act = (fn) => () => { setMenuUid(null); fn(); };
                const row = 'press flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left text-base font-bold active:bg-slate-100';
                return (
                  <div className="divide-y divide-slate-100">
                    {m.role === 'Admin'
                      ? m.uid !== shopAdminId && <button type="button" onClick={act(() => handleSetRole(m.uid, 'member'))} className={`${row} text-slate-800`}><ShieldOff size={20} /> Make regular member</button>
                      : <button type="button" onClick={act(() => handleSetRole(m.uid, 'admin'))} className={`${row} text-slate-800`}><ShieldCheck size={20} className="text-green-600" /> Make admin</button>}
                    <button type="button" onClick={act(() => handleMakeAdmin(m.uid))} className={`${row} text-slate-800`}><ArrowUpCircle size={20} className="text-blue-600" /> Transfer ownership to them</button>
                    <button type="button" onClick={act(() => handleRemoveMember(m.uid))} className={`${row} text-red-600`}><Trash2 size={20} /> Remove from shop</button>
                  </div>
                );
              })()}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
      <BottomNav />
    </div>
  );
}
