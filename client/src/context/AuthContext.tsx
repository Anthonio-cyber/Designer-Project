import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { connectSocket, disconnectSocket } from '@/lib/socket';
import type { User } from '@/lib/types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isClient: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: { name: string; email: string; password: string; company?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { user: current } = await api.get<{ user: User | null }>('/auth/me');
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The realtime connection follows the session: opened on sign-in, closed on sign-out.
  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const login = useCallback(async (email: string, password: string) => {
    const { user: next } = await api.post<{ user: User }>('/auth/login', { email, password });
    setUser(next);
    return next;
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; company?: string }) => {
      const { user: next } = await api.post<{ user: User }>('/auth/register', input);
      setUser(next);
      return next;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      disconnectSocket();
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      isClient: user?.role === 'client',
      login,
      register,
      logout,
      refresh: load,
      setUser,
    }),
    [user, loading, login, register, logout, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
