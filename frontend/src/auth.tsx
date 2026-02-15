import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearAuthTokens,
  getAccessToken,
  getCurrentUser,
  getRefreshToken,
  login,
  registerAuthFailureHandler,
  setAuthTokens,
  verifyTwoFactorLogin,
  type UserProfile,
} from './api';

type SignInResult = 'authenticated' | '2fa_required';

type AuthContextValue = {
  user: UserProfile | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<SignInResult>;
  completeTwoFactorSignIn: (code: string) => Promise<void>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const TWO_FACTOR_TOKEN_STORAGE_KEY = 'seo.auth.two-factor-token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    clearAuthTokens();
    sessionStorage.removeItem(TWO_FACTOR_TOKEN_STORAGE_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    registerAuthFailureHandler(signOut);
    return () => registerAuthFailureHandler(null);
  }, [signOut]);

  useEffect(() => {
    const init = async () => {
      if (!getAccessToken() || !getRefreshToken()) {
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
        const response = await login(email, password);
        if (response.requires_2fa && response.two_factor_token) {
          sessionStorage.setItem(TWO_FACTOR_TOKEN_STORAGE_KEY, response.two_factor_token);
          return '2fa_required';
        }

        if (!response.access_token || !response.refresh_token) {
          throw new Error('Missing auth tokens from login response');
        }

        setAuthTokens({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
        });
        const me = await getCurrentUser();
        setUser(me);
        return 'authenticated';
      },
      completeTwoFactorSignIn: async (code: string) => {
        const twoFactorToken = sessionStorage.getItem(TWO_FACTOR_TOKEN_STORAGE_KEY);
        if (!twoFactorToken) {
          throw new Error('Missing two-factor challenge token');
        }

        const response = await verifyTwoFactorLogin(twoFactorToken, code);
        if (!response.access_token || !response.refresh_token) {
          throw new Error('Missing auth tokens from 2FA response');
        }

        setAuthTokens({
          accessToken: response.access_token,
          refreshToken: response.refresh_token,
        });
        sessionStorage.removeItem(TWO_FACTOR_TOKEN_STORAGE_KEY);
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
