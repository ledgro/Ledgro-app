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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);

      if (currentUser) {
        try {
          // Check if user has a shop
          const shopsRef = collection(db, 'shops');
          // Since the user is owner or member, we need to check if they exist in the members array
          // Since Firestore array-contains on map keys is tricky, a common pattern for multi-tenant
          // is to check if they are the owner, or if they just have any shop they belong to.
          // Because of our data structure { members: { [uid]: timestamp } }
          // We might not be able to easily query on dynamic map keys.
          // Let's first query where ownerId == uid as that's the most common case for small shop owners.

          const q = query(shopsRef, where('ownerId', '==', currentUser.uid));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            setHasShop(true);
          } else {
            // Further enhancement could be to check membership in other shops if they aren't the owner
            setHasShop(false);
          }
        } catch (error) {
          console.error("Error checking for shop:", error);
          setHasShop(false);
        }
      } else {
        setHasShop(null);
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
    <AuthContext.Provider value={{ user, hasShop, setHasShop, loading, signInWithGoogle, signOut }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
