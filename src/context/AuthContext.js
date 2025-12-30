'use client';

import { createContext, useContext, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';

const AuthContext = createContext({ logout: () => {} });

export function AuthProvider({ children }) {
  const router = useRouter();

  const logout = useCallback(async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch {
      // ignore network errors – fallback to client redirect
    } finally {
      try {
        localStorage.removeItem('usuario');
        localStorage.removeItem('expiraEm');
      } catch {
        // ignore storage errors
      }
      router.push('/login');
    }
  }, [router]);

  const value = useMemo(() => ({ logout }), [logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
