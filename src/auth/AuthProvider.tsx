import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { fetchProfileRole } from '../data/productsApi';

interface AuthState {
  user: { id: string; email: string | null } | null;
  /** UI hint only: RLS enforces the real owner-only rules on the server. */
  isOwner: boolean;
  /** null until known */
  role: 'owner' | 'employee' | null;
  loading: boolean;
  signIn(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

const roleKey = (uid: string) => `role:${uid}`;
const readRole = (uid: string) => { try { return localStorage.getItem(roleKey(uid)); } catch { return null; } };
const writeRole = (uid: string, r: string) => { try { localStorage.setItem(roleKey(uid), r); } catch { /* storage blocked */ } };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  const metaRole = session?.user.app_metadata?.role;
  useEffect(() => {
    if (!uid) { setRole(null); return; }
    if (metaRole === 'owner') { setRole('owner'); return; }
    setRole(readRole(uid)); // last known role, so the UI is right while offline
    fetchProfileRole(uid).then((r) => { setRole(r); writeRole(uid, r); }).catch(() => { /* keep cached role */ });
  }, [uid, metaRole]);

  const value = useMemo<AuthState>(() => ({
    user: session ? { id: session.user.id, email: session.user.email ?? null } : null,
    isOwner: role === 'owner',
    role: role === 'owner' ? 'owner' : role === 'employee' ? 'employee' : null,
    loading,
    async signIn(email, password) {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      return !error;
    },
    async signOut() { await supabase.auth.signOut(); },
  }), [session, role, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
