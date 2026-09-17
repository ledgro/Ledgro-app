import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';
import SplashScreen from '../components/SplashScreen';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(null);
  const [shopId, setShopId] = useState(null);
  const [shopAdminId, setShopAdminId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const shopsRef = collection(db, 'shops');
          // For now, checking if they are the admin (ownerId) OR if they exist in the members array
          // Since array-contains on map keys isn't native, we query where their UID is a key in the members map
          // Actually, Firestore allows checking `members.${uid}` > 0 using orderBy/where if indexed,
          // or we can use a dedicated array of memberUids.
          // To keep it simple based on the existing `{ [uid]: timestamp }` structure, we might need to
          // fetch all shops where they are either ownerId, or we re-structure slightly for easy querying.
          // Let's assume the user is either the admin OR we update the shop to also include an array `memberIds`.
          // For this step, we will query where ownerId == uid OR memberIds array-contains uid.

          // Note: To avoid complex compound index setup for this iteration, we'll query where ownerId == uid.
          // In the join flow, we will see how to handle the member query.
          // Actually, we can fetch all shops and filter client-side if the user's shop volume is low,
          // or properly structure `memberIds: [uid1, uid2]`. Let's use `memberIds` array for standard queries.

          // Let's assume the shop document has: { ownerId: uid, memberIds: [uid] }
          const qAdmin = query(shopsRef, where('ownerId', '==', currentUser.uid));
          const qMember = query(shopsRef, where('memberIds', 'array-contains', currentUser.uid));

          const [adminSnap, memberSnap] = await Promise.all([getDocs(qAdmin), getDocs(qMember)]);

          if (!adminSnap.empty) {
            setHasShop(true);
            setShopId(adminSnap.docs[0].id);
            setShopAdminId(adminSnap.docs[0].data().ownerId);
          } else if (!memberSnap.empty) {
            setHasShop(true);
            setShopId(memberSnap.docs[0].id);
            setShopAdminId(memberSnap.docs[0].data().ownerId);
          } else {
            setHasShop(false);
            setShopId(null);
            setShopAdminId(null);
          }
        } catch (error) {
          console.error("Error checking for shop:", error);
          setHasShop(false);
          setShopId(null);
        }
      } else {
        setHasShop(null);
        setShopId(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = () => {
    return signInWithPopup(auth, googleProvider);
  };

  const signOut = () => {
    return firebaseSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, hasShop, shopId, shopAdminId, setHasShop, setShopId, loading, signInWithGoogle, signOut }}>
      {loading ? <SplashScreen /> : children}
    </AuthContext.Provider>
  );
};
