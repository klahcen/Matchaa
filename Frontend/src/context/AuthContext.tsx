import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/auth';
import type { LoginPayload, User } from '../types/auth';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<User>;
  logout: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

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

  const login = async (payload: LoginPayload): Promise<User> => {
    const response = await authApi.login(payload);
    if (!response.user) {
      throw new Error('Authentication succeeded but user profile was not returned');
    }
    setUser(response.user);
    return response.user;
  };

  const logout = async (): Promise<void> => {
    try {
      await authApi.logout();
    } finally {
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
