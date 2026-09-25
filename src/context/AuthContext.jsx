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
  const [shopName, setShopName] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const shopsRef = collection(db, 'shops');

          // The security rules demand we check the map: `members.{uid}`.
          // In Firestore, we can query this directly using a dynamic field path if indexed, or we just fetch where ownerId == uid
          // and for invited staff, we query where `members.${uid}` > 0.

          const qAdmin = query(shopsRef, where('ownerId', '==', currentUser.uid));
          const qMember = query(shopsRef, where(`members.${currentUser.uid}`, 'in', ['admin', 'member']));

          let adminSnap = { empty: true, docs: [] };
          let memberSnap = { empty: true, docs: [] };

          try {
             adminSnap = await getDocs(qAdmin);
          } catch (e) {
             console.log("Admin query failed (normal if not creator): ", e);
          }

          try {
             memberSnap = await getDocs(qMember);
          } catch (e) {
             console.log("Member query failed (normal if no member array): ", e);
          }

          if (!adminSnap.empty) {
            setHasShop(true);
            setShopId(adminSnap.docs[0].id);
            setShopAdminId(adminSnap.docs[0].data().ownerId);
            setShopName(adminSnap.docs[0].data().name);
          } else if (!memberSnap.empty) {
            setHasShop(true);
            setShopId(memberSnap.docs[0].id);
            setShopAdminId(memberSnap.docs[0].data().ownerId);
            setShopName(memberSnap.docs[0].data().name);
          } else {
            setHasShop(false);
            setShopId(null);
            setShopAdminId(null);
            setShopName('');
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
    <AuthContext.Provider value={{ user, hasShop, shopId, shopAdminId, shopName, setHasShop, setShopId, loading, signInWithGoogle, signOut }}>
      {loading ? <SplashScreen /> : children}
    </AuthContext.Provider>
  );
};
