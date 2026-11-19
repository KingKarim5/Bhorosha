import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, setToken } from './api';

export interface User {
  id: string;
  role: 'manager' | 'officer' | 'investor';
  email: string;
  display_name: string;
}
interface Ctx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
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
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    setUser(null);
  };
  return <AuthCtx.Provider value={{ user, loading, login, logout }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);
