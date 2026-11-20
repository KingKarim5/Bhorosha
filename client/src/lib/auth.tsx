import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken } from './api';

export interface User {
  id: string;
  role: 'lender' | 'investor' | 'admin';
  email: string;
  display_name: string;
  org_name?: string; // lenders: institution name
  apply_code?: string; // lenders: code in the owner application link
}
export type SignupBody = { role: 'lender' | 'investor'; display_name: string; email: string; password: string; org_name?: string };
/** Where each role lands after logging in. */
export const homeFor = (u: User) => (u.role === 'admin' ? '/admin' : u.role === 'investor' ? '/portfolio' : '/dashboard');
interface Ctx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  signup: (b: SignupBody) => Promise<User>;
  logout: () => Promise<void>;
}
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ user: User | null }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  const login = async (email: string, password: string) => {
    const r = await api<{ user: User; token: string }>('/auth/login', { body: { email, password } });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };
  const signup = async (b: SignupBody) => {
    const r = await api<{ user: User; token: string }>('/auth/signup', { body: b });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
