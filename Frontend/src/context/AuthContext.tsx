import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/auth';
import { UNAUTHORIZED_EVENT } from '../api/http';
import type { LoginPayload, User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /**
   * `beforeSignIn` runs once the server accepted the credentials (auth cookie
   * set, so authenticated calls work) but before the app switches to the
   * signed-in state, i.e. before any route guard redirects.
   */
  login: (payload: LoginPayload, beforeSignIn?: () => Promise<void>) => Promise<User>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Mirrors `user` for the 401 listener, which is registered once.
  const userRef = useRef<User | null>(null);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Restore existing session on initial load
  useEffect(() => {
    let isMounted = true;

    const checkSession = async () => {
      try {
        const response = await authApi.getMe();
        if (isMounted && response.user) {
          setUser(response.user);
        }
      } catch {
        // Not logged in or expired cookie; gracefully set user to null
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    checkSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (
    payload: LoginPayload,
    beforeSignIn?: () => Promise<void>
  ): Promise<User> => {
    const response = await authApi.login(payload);
    if (!response.user) {
      throw new Error('Authentication succeeded but user profile was not returned');
    }
    if (beforeSignIn) await beforeSignIn();
    setUser(response.user);
    return response.user;
  };

  // Any authenticated API call answered with 401 (expired or revoked session)
  // lands here via the api/http.ts window event: drop the local session and
  // send the user to the login page. Ignored when nobody is signed in, so the
  // trailing 401s of requests still in flight after a logout are harmless.
  useEffect(() => {
    const handleUnauthorized = () => {
      if (!userRef.current) return;
      userRef.current = null;
      setUser(null);
      navigate('/login', { replace: true, state: { sessionExpired: true } });
    };

    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, [navigate]);

  /**
   * Never throws: the local session is always cleared, even when the server
   * call fails (offline, timeout, cookie already expired). The httpOnly cookie
   * is short-lived and invalid once the user is gone server-side anyway.
   */
  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // Intentionally ignored: signing out locally must always succeed.
    } finally {
      userRef.current = null;
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
