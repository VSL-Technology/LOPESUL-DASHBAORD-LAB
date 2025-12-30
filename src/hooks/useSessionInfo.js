'use client';

import { useEffect, useState } from 'react';

const initialState = {
  loading: true,
  authenticated: false,
  role: 'READER',
  maintenance: false,
  user: null,
  isMaster: false,
};

export function useSessionInfo() {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let active = true;
    async function fetchInfo() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json();
        if (!active) return;
        const rawRole = (data?.user?.role || data?.role || 'READER').toString().toUpperCase();
        const role = rawRole === 'MASTER' ? 'MASTER' : 'READER';
        const maintenance = !!data?.maintenance;
        setState({
          loading: false,
          authenticated: !!data?.authenticated,
          role,
          maintenance,
          user: data?.user || null,
          isMaster: role === 'MASTER',
        });
        if (typeof document !== 'undefined') {
          const expires = new Date(Date.now() + 12 * 60 * 60 * 1000).toUTCString();
          document.cookie = `maintenance=${maintenance ? '1' : '0'}; path=/; SameSite=Lax; expires=${expires}`;
        }
      } catch {
        if (!active) return;
        setState((prev) => ({ ...prev, loading: false }));
      }
    }
    fetchInfo();
    const timer = setInterval(fetchInfo, 30_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return state;
}
