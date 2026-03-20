'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext({
  tema: 'claro',
  setTema: () => {},
  toggleTema: () => {},
});

function prefersDarkMode() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }) {
  const [tema, setTemaState] = useState('claro');
  const [userOverride, setUserOverride] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem('themePreferred');
      if (stored === 'claro' || stored === 'escuro') {
        setTemaState(stored);
        setUserOverride(true);
        return;
      }
      setTemaState(prefersDarkMode() ? 'escuro' : 'claro');
    } catch {
      setTemaState(prefersDarkMode() ? 'escuro' : 'claro');
    }
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', tema === 'escuro');
  }, [tema]);

  useEffect(() => {
    if (!userOverride || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('themePreferred', tema);
    } catch {
      // ignore storage issues
    }
  }, [tema, userOverride]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event) => {
      if (userOverride) return;
      setTemaState(event.matches ? 'escuro' : 'claro');
    };
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [userOverride]);

  const applyTema = (next, persist = true) => {
    const resolved = next === 'escuro' ? 'escuro' : 'claro';
    setTemaState(resolved);
    setUserOverride(persist);
    if (persist && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('themePreferred', resolved);
      } catch {
        // ignore storage
      }
    }
    if (!persist && typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('themePreferred');
      } catch {
        // ignore
      }
    }
  };

  const toggleTema = useCallback(() => {
    applyTema(tema === 'escuro' ? 'claro' : 'escuro');
  }, [tema]);

  const value = useMemo(
    () => ({
      tema,
      setTema: (next) => applyTema(next || 'claro'),
      toggleTema,
    }),
    [tema, toggleTema]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
