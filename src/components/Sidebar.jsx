'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import {
  BarChart2,
  Bus,
  DollarSign,
  LayoutDashboard,
  LogOut,
  Moon,
  Server,
  Settings,
  Sun,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useSessionInfo } from '@/hooks/useSessionInfo';

const NAV_GROUPS = [
  {
    title: 'Visão geral',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/pagamentos', label: 'Pagamentos', icon: DollarSign },
      { href: '/relatorios', label: 'Relatórios', icon: BarChart2 },
    ],
  },
  {
    title: 'Operação',
    items: [
      { href: '/acessos', label: 'Acessos', icon: Users },
      { href: '/frotas', label: 'Frotas', icon: Bus },
      { href: '/roteadores', label: 'Roteadores', icon: Server },
      { href: '/trials', label: 'Trials', icon: Timer },
    ],
  },
  {
    title: 'Sistema',
    items: [{ href: '/configuracoes', label: 'Configurações', icon: Settings }],
  },
];

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function NavItem({ href, icon: Icon, label, active, collapsed, onNavigate }) {
  const labelClasses = collapsed
    ? 'md:max-w-0 md:opacity-0 md:group-hover/sidebar:max-w-[12rem] md:group-hover/sidebar:opacity-100 lg:max-w-[12rem] lg:opacity-100'
    : 'max-w-[12rem] opacity-100';

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={label}
      onClick={onNavigate}
      className={cx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
        active
          ? 'bg-white/15 text-white font-medium'
          : 'text-white/60 hover:bg-white/10 hover:text-white'
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span
        className={cx(
          'overflow-hidden whitespace-nowrap transition-all duration-200',
          labelClasses
        )}
      >
        {label}
      </span>
    </Link>
  );
}

export default function Sidebar({
  mobileOpen = false,
  onClose = () => {},
  collapsed = false,
}) {
  const pathname = usePathname();
  const { logout } = useAuth() || {};
  const { tema, toggleTema } = useTheme();
  const { user } = useSessionInfo();

  const isActive = (href) => pathname === href || pathname?.startsWith(`${href}/`);
  const ThemeIcon = tema === 'escuro' ? Sun : Moon;
  const rawName = user?.nome || user?.username || user?.email || '';
  const cleanedName = rawName.replace(/^user\s+/i, '').trim();
  const userName = cleanedName || 'Operador';
  const userEmail = user?.email || user?.username || 'Sem e-mail';
  const initial = userName.charAt(0).toUpperCase() || 'U';

  const collapsibleLabelClasses = collapsed
    ? 'md:max-w-0 md:opacity-0 md:group-hover/sidebar:max-w-[12rem] md:group-hover/sidebar:opacity-100 lg:max-w-[12rem] lg:opacity-100'
    : 'max-w-[12rem] opacity-100';

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cx(
          'group/sidebar fixed left-0 top-0 z-50 flex h-full flex-col border-r border-white/10 bg-[#1a2332] shadow-xl transition-all duration-300 ease-out',
          'w-60',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
          collapsed ? 'md:w-16 md:hover:w-60' : 'md:w-60',
          'lg:w-60 lg:translate-x-0'
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-sm font-semibold text-white">
              L
            </div>
            <div
              className={cx(
                'overflow-hidden whitespace-nowrap transition-all duration-200',
                collapsibleLabelClasses
              )}
            >
              <p className="text-sm font-semibold tracking-[0.2em] text-white">LOPESUL</p>
              <p className="text-xs text-white/50">Dashboard</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white md:hidden"
            aria-label="Fechar menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-semibold text-white">
              {initial}
            </div>
            <div
              className={cx(
                'min-w-0 overflow-hidden whitespace-nowrap transition-all duration-200',
                collapsibleLabelClasses
              )}
            >
              <p className="truncate text-sm font-medium text-white">{userName}</p>
              <p className="truncate text-xs text-white/50">{userEmail}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.title} className={groupIndex > 0 ? 'mt-4 pt-4 border-t border-white/10' : ''}>
              <p
                className={cx(
                  'mb-2 px-2 text-[11px] uppercase tracking-[0.18em] text-white/30 transition-all duration-200',
                  collapsibleLabelClasses
                )}
              >
                {group.title}
              </p>

              <div className="space-y-1">
                {group.items.map((item) => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                    onNavigate={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 p-2">
          <div className="space-y-2">
            <button
              type="button"
              onClick={toggleTema}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Alternar tema"
              title={`Alternar tema (${tema})`}
            >
              <ThemeIcon size={16} className="shrink-0" />
              <span
                className={cx(
                  'overflow-hidden whitespace-nowrap transition-all duration-200',
                  collapsibleLabelClasses
                )}
              >
                Alternar tema
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                logout?.();
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut size={16} className="shrink-0" />
              <span
                className={cx(
                  'overflow-hidden whitespace-nowrap transition-all duration-200',
                  collapsibleLabelClasses
                )}
              >
                Sair
              </span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
