import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { auth, googleProvider, db } from '../firebase';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasShop, setHasShop] = useState(null);
  const [shopId, setShopId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          const shopsRef = collection(db, 'shops');
          const q = query(shopsRef, where('ownerId', '==', currentUser.uid));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            setHasShop(true);
            setShopId(querySnapshot.docs[0].id); // capture the specific shopId for scoped subcollections
          } else {
            setHasShop(false);
            setShopId(null);
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
    <AuthContext.Provider value={{ user, hasShop, shopId, setHasShop, setShopId, loading, signInWithGoogle, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
