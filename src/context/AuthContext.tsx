import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';
import {
  getUserDisplayName,
  getUserEmail,
  signOutUser,
  type AuthResult,
} from '../services/authService';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  userName: string;
  userEmail: string;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  isPasswordRecovery: boolean;
  authError: string | null;
  clearPasswordRecovery: () => void;
  signOut: () => Promise<AuthResult>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function detectRecoveryUrl(): boolean {
  try {
    const hash = window.location.hash || '';
    const searchParams = new URLSearchParams(window.location.search || '');
    return (
      hash.includes('type=recovery') ||
      searchParams.get('type') === 'recovery' ||
      window.location.pathname === '/reset-password'
    );
  } catch {
    return false;
  }
}

function cleanRecoveryUrlParams(): void {
  try {
    const url = new URL(window.location.href);
    if (
      url.hash.includes('access_token') ||
      url.hash.includes('type=recovery') ||
      url.searchParams.has('code') ||
      url.searchParams.has('type') ||
      url.pathname === '/reset-password'
    ) {
      const targetPath = url.pathname === '/reset-password' ? '/' : url.pathname;
      window.history.replaceState({}, document.title, targetPath);
    }
  } catch {
    // Ignore history cleanup errors
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(isSupabaseConfigured);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(detectRecoveryUrl);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const initializeSession = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (!isMounted) return;

        if (error) {
          setSession(null);
          setUser(null);
          setAuthError(error.message);
        } else {
          setSession(data.session);
          setUser(data.session?.user ?? null);
          setAuthError(null);
        }
      } catch (err) {
        if (!isMounted) return;
        setSession(null);
        setUser(null);
        setAuthError(
          err instanceof Error ? err.message : 'Unable to verify existing session.'
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void initializeSession();

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
      }

      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthError(null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const clearPasswordRecovery = useCallback(() => {
    setIsPasswordRecovery(false);
    cleanRecoveryUrlParams();
  }, []);

  const signOut = useCallback(async () => {
    const result = await signOutUser();
    setSession(null);
    setUser(null);
    setIsPasswordRecovery(false);
    cleanRecoveryUrlParams();
    return result;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      userName: getUserDisplayName(user),
      userEmail: getUserEmail(user),
      isAuthenticated: Boolean(session && user),
      isLoading,
      isConfigured: isSupabaseConfigured,
      isPasswordRecovery,
      authError,
      clearPasswordRecovery,
      signOut,
    }),
    [
      session,
      user,
      isLoading,
      isPasswordRecovery,
      authError,
      clearPasswordRecovery,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
