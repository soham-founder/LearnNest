import React, { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth } from '../common/firebase';
import { useNavigate } from 'react-router-dom';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  // Add a function to manually refresh user token and verification status if needed
  // refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Reload user to get latest emailVerified status, especially after verification link click
        await currentUser.reload();
        // Get the latest user object after reload
        const updatedUser = auth.currentUser;

        if (updatedUser && updatedUser.emailVerified) {
          setUser(updatedUser);
          setLoading(false);
          // Remove dashboard redirect logic here. ProtectedRoute will handle access.
        } else if (updatedUser && !updatedUser.emailVerified) {
          setUser(updatedUser); // Still set the user, but handle unverified state
          setLoading(false);
          // If unverified, redirect to login page (or a dedicated unverified page)
          // Only navigate if not already on the login page
          if (window.location.pathname !== '/login') {
            navigate('/login', { replace: true }); // Or '/email-verification-pending'
            alert("Please verify your email address to access the dashboard.");
          }
        } else { // CurrentUser is null after reload, implying logout or session end
            setUser(null);
            setLoading(false);
            // Redirect to login if not on login page
            if (window.location.pathname !== '/login') {
                navigate('/login', { replace: true });
            }
        }
      } else {
        // No user is signed in.
        setUser(null);
        setLoading(false);
        // Redirect to login if not on login page
        if (window.location.pathname !== '/login') {
          navigate('/login', { replace: true });
        }
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
