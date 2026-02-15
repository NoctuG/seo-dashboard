import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearAuthTokens,
  getAccessToken,
  getCurrentUser,
  getRefreshToken,
  login,
  registerAuthFailureHandler,
  setAuthTokens,
  type UserProfile,
} from './api';

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    clearAuthTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    registerAuthFailureHandler(signOut);
    return () => registerAuthFailureHandler(null);
  }, [signOut]);

  useEffect(() => {
    const init = async () => {
      if (!getAccessToken() || !getRefreshToken()) {
        signOut();
        setLoading(false);
        return;
      }
      try {
        const me = await getCurrentUser();
        setUser(me);
      } catch {
        signOut();
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [signOut]);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      signIn: async (email: string, password: string) => {
        const tokens = await login(email, password);
        setAuthTokens({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
        });
        const me = await getCurrentUser();
        setUser(me);
      },
      signOut,
    }),
    [user, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
