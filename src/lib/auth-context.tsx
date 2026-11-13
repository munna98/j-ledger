'use client';

import * as React from 'react';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export interface JLedgerUser {
  id: string;
  email: string;
  name?: string;
  role?: string;
}

interface AuthContextType {
  user: JLedgerUser | null;
  loading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'jledger_user_session';

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithPassword: async () => ({ error: null }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<JLedgerUser | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.email) {
          setUser(parsed);
        }
      }
    } catch {
      // ignore parsing error
    } finally {
      setLoading(false);
    }
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    if (!isSupabaseConfigured()) {
      return { error: new Error('Supabase is not configured. Add credentials in .env.local first.') };
    }

    try {
      const supabase = getSupabase();
      const cleanEmail = email.trim().toLowerCase();
      const cleanPassword = password.trim();

      // 1. First attempt secure RPC check with pgcrypto
      const { data: rpcData, error: rpcError } = await supabase.rpc('jledger_login', {
        p_email: cleanEmail,
        p_password: cleanPassword,
      });

      if (!rpcError && rpcData && rpcData.length > 0) {
        const loggedUser: JLedgerUser = {
          id: rpcData[0].id,
          email: rpcData[0].email,
          name: rpcData[0].name || 'Jaisal',
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedUser));
        setUser(loggedUser);
        return { error: null };
      }

      // 2. Direct table fallback if RPC function not created
      const { data: userData, error: userError } = await supabase
        .from('jledger_users')
        .select('id, email, password_hash, name, role')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (userError) {
        return { error: new Error(`Database error: ${userError.message}`) };
      }

      if (!userData) {
        return { error: new Error('Invalid email or password.') };
      }

      // Verify plain text match if password_hash was stored as plain text
      if (userData.password_hash === cleanPassword) {
        const loggedUser: JLedgerUser = {
          id: userData.id,
          email: userData.email,
          name: userData.name || 'Jaisal',
          role: userData.role || 'admin',
        };
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(loggedUser));
        setUser(loggedUser);
        return { error: null };
      }

      return { error: new Error('Invalid email or password.') };
    } catch (err: any) {
      return { error: new Error(err.message || 'Authentication failed.') };
    }
  };

  const signOut = async () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
