'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function LayoutWrapper({ children }) {
  const pathname = usePathname();
  const hideSidebar = pathname === '/' || pathname === '/login';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateSidebarMode = () => {
      if (window.innerWidth >= 1024) {
        setCollapsed(false);
        setMobileOpen(false);
        return;
      }

      if (window.innerWidth >= 768) {
        setCollapsed(true);
        setMobileOpen(false);
        return;
      }

      setCollapsed(false);
    };

    updateSidebarMode();
    window.addEventListener('resize', updateSidebarMode);
    return () => window.removeEventListener('resize', updateSidebarMode);
  }, []);

  if (hideSidebar) {
    return (
      <div className="min-h-screen bg-[#F0F6FA] dark:bg-[#0f172a]">
        <main className="p-6 lg:p-8">
          <div className="min-w-0">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F6FA] dark:bg-[#0f172a]">
      <Sidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        collapsed={collapsed}
      />

      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-white/10 bg-[#1a2332]/95 px-4 text-white backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-2 transition-colors hover:bg-white/10"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-semibold tracking-[0.2em] text-white">
          LOPESUL
        </div>

        <div className="h-9 w-9" aria-hidden="true" />
      </header>

      <main
        className={cx(
          'min-h-screen pt-16 md:pt-0',
          'md:pl-16 lg:pl-60'
        )}
      >
        <div className="p-4 md:p-6 lg:p-8">
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
