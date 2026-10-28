import { Bell, ClipboardList, FileBarChart, Gauge, ChevronsLeft, ChevronsRight, LayoutDashboard, LogOut, Menu, Moon, Settings, Sun, TrafficCone, Video, WifiOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cx, Logo, title, Toaster } from './ui';
import { useAlerts } from '../services/api';
import { connectLive } from '../services/ws';
import { ADMIN, OPS, useAuth } from '../store/auth';
import { useLive } from '../store/live';
import type { Role } from '../types';
import { fmtDate, fmtTimeSec } from '../utils/format';

// The navy frame (sidebar + header) uses fixed colors, so it looks the same in light and dark mode.
const FRAME = 'bg-[#10203d] text-white';

const NAV: { to: string; label: string; hint: string; icon: typeof Bell; roles?: Role[] }[] = [
  { to: '/', label: 'Dashboard', hint: 'Today at a glance', icon: LayoutDashboard },
  { to: '/live', label: 'Live View', hint: 'Cameras and signals now', icon: Video, roles: OPS },
  { to: '/intersections', label: 'Intersections', hint: 'Every junction and its devices', icon: TrafficCone },
  { to: '/violations', label: 'Violations', hint: 'Over-speeding to review', icon: Gauge, roles: OPS },
  { to: '/reports', label: 'Reports', hint: 'Daily and weekly traffic', icon: FileBarChart },
  { to: '/alerts', label: 'Alerts', hint: 'Faults and warnings', icon: ClipboardList },
  { to: '/settings', label: 'Settings', hint: 'Arduino and configuration', icon: Settings, roles: ADMIN },
];

/** On/off switch for dark mode. The whole row is clickable; in the collapsed desktop sidebar it shows just the icon. */
function ThemeSwitch({ collapsed, dark, onToggle }: { collapsed: boolean; dark: boolean; onToggle: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" title={dark ? 'Dark mode is on' : 'Dark mode is off'} onClick={onToggle}
      className={cx('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#fbbf24]', collapsed && 'md:justify-center')}>
      {dark ? <Moon className="size-5 shrink-0" /> : <Sun className="size-5 shrink-0" />}
      <span className={cx('flex-1', collapsed && 'md:hidden')}>Dark mode</span>
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', dark ? 'bg-[#fbbf24]' : 'bg-white/25', collapsed && 'md:hidden')} aria-hidden>
        <span className={cx('absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform', dark && 'translate-x-5')} />
      </span>
    </button>
  );
}

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <time className="hidden text-right leading-tight md:block">
      <span className="block text-sm font-semibold tabular-nums text-white">{fmtTimeSec(now)}</span>
      <span className="block text-xs text-white/60">{fmtDate(now)}</span>
    </time>
  );
}

function SystemStatus() {
  const ws = useLive((s) => s.ws);
  const kpi = useLive((s) => s.kpi);
  const [label, dot] =
    ws !== 'open' ? ['Offline', 'bg-red-500']
      : kpi && (kpi.camerasOnline < kpi.camerasTotal || kpi.sensorsOnline < kpi.sensorsTotal) ? ['Degraded', 'bg-yellow-500']
        : ['Online', 'bg-green-500'];
  return (
    <span title={`System ${label}`} className="inline-flex items-center gap-2 rounded-full bg-white/10 p-2 text-xs font-medium text-white sm:px-3 sm:py-1.5">
      <span className="relative flex size-2" aria-hidden>
        {ws === 'open' && <span className={cx('absolute inset-0 rounded-full opacity-75 motion-safe:animate-ping', dot)} />}
        <span className={cx('relative size-2 rounded-full', dot)} />
      </span>
      <span className="hidden sm:inline">System {label}</span>
      <span className="sr-only sm:hidden">System {label}</span>
    </span>
  );
}

function useTheme() {
  const [light, setLight] = useState(() => document.documentElement.classList.contains('light'));
  const toggle = () => {
    const next = document.documentElement.classList.toggle('light');
    setLight(next);
    try { localStorage.setItem('stl-theme', next ? 'light' : 'dark'); } catch { /* per-session only */ }
  };
  return [light, toggle] as const;
}

function Topbar({ collapsed, onOpenMenu }: { collapsed: boolean; onOpenMenu: () => void }) {
  const { user, logout } = useAuth();
  const unread = useAlerts({ ack: 'false' }).data?.length ?? 0;
  useEffect(() => { document.title = `${unread ? `(${unread}) ` : ''}SMART Traffic Light — LGU Dashboard`; }, [unread]);
  const initials = user?.name.split(' ').map((w) => w[0]).slice(0, 2).join('') ?? '';
  return (
    <header className={cx('relative flex h-16 shrink-0 items-center border-b border-white/10 pr-2 sm:pr-5', FRAME)}>
      {/* Phones: the menu lives in a slide-in drawer. */}
      <button onClick={onOpenMenu} aria-label="Open menu" className="ml-2 rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white md:hidden"><Menu className="size-6" /></button>
      <div className={cx('flex h-full min-w-0 items-center gap-3 pl-2 transition-[width] md:shrink-0', collapsed ? 'md:w-20 md:justify-center md:pl-0' : 'md:w-72 md:px-6')}>
        <Logo />
        <div className={cx('min-w-0 leading-tight', collapsed && 'md:hidden')}>
          <div className="truncate text-base font-bold">SMART Traffic Light</div>
          <div className="hidden truncate text-xs text-white/60 sm:block">LGU Monitoring Dashboard</div>
        </div>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-4">
        <Clock />
        <SystemStatus />
        <span className="hidden h-8 w-px bg-white/15 sm:block" aria-hidden />
        <Link href="/alerts" aria-label={`${unread} unacknowledged alerts`} title="Alerts" className="relative rounded-md p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
          <Bell className="size-5" />
          {unread > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-[#dc2626] px-1 text-center text-[10px] font-bold leading-4 text-white tabular-nums ring-2 ring-[#10203d]">{unread}</span>}
        </Link>
        <div className="hidden items-center gap-2.5 sm:flex">
          <span className="grid size-9 place-items-center rounded-full bg-[#fbbf24] text-xs font-bold text-[#10203d]" aria-hidden>{initials}</span>
          <div className="hidden leading-tight sm:block">
            <div className="text-sm font-semibold">{user?.name}</div>
            <div className="text-xs text-white/60">{user?.role && title(user.role)}</div>
          </div>
        </div>
        <button onClick={logout} aria-label="Sign out" title="Sign out" className="hidden rounded-md p-2 text-white/70 sm:block transition-colors hover:bg-white/10 hover:text-white"><LogOut className="size-5" /></button>
      </div>
    </header>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  const token = useAuth((s) => s.token)!;
  const role = useAuth((s) => s.user?.role);
  const ws = useLive((s) => s.ws);
  const pathname = usePathname();
  const [light, toggleTheme] = useTheme();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1024);
  const [drawer, setDrawer] = useState(false); // phone menu
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  useEffect(() => connectLive(token), [token]);
  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);
  // NavLink semantics: '/' matches exactly, other entries also match their sub-pages.
  const isActive = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const nav = NAV.filter((n) => !n.roles || (role && n.roles.includes(role)));

  return (
    <div className="flex h-dvh flex-col">
      <Topbar collapsed={collapsed} onOpenMenu={() => setDrawer(true)} />
      <div className="flex min-h-0 flex-1">
        {drawer && <button aria-label="Close menu" tabIndex={-1} onClick={() => setDrawer(false)} className="fixed inset-0 z-40 bg-black/50 md:hidden" />}
        {/* Phones: fixed drawer sliding in from the left. md+: the normal sidebar. */}
        <aside className={cx('fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] shrink-0 flex-col pb-4 shadow-2xl transition-transform md:static md:max-w-none md:translate-x-0 md:pt-4 md:shadow-none md:transition-[width]', FRAME, drawer ? 'translate-x-0' : '-translate-x-full', collapsed && 'md:w-20')}>
          <div className="mb-2 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5 md:hidden">
            <Logo />
            <span className="flex-1 truncate font-bold">SMART Traffic Light</span>
            <button onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded-md p-2 text-white/80 hover:bg-white/10"><X className="size-5" /></button>
          </div>
          <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3">
            {nav.map((n) => (
              <Link
                key={n.to}
                href={n.to}
                aria-current={isActive(n.to) ? 'page' : undefined}
                title={n.label}
                className={cx('relative flex items-center gap-3.5 rounded-md px-3 py-3 transition-colors', collapsed && 'md:justify-center', isActive(n.to) ? 'bg-white/10 text-white before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r before:bg-[#fbbf24]' : 'text-white/70 hover:bg-white/5 hover:text-white')}
              >
                <n.icon className={cx('size-5 shrink-0', isActive(n.to) && 'text-[#fbbf24]')} />
                <span className={cx('min-w-0', collapsed && 'md:sr-only')}>
                  <span className="block text-[15px] font-semibold leading-tight">{n.label}</span>
                  <span className="block truncate text-xs text-white/50">{n.hint}</span>
                </span>
              </Link>
            ))}
          </nav>
          <div className="mx-3 mt-3 border-t border-white/10 pt-3">
            <ThemeSwitch collapsed={collapsed} dark={!light} onToggle={toggleTheme} />
            {/* Phones get account + sign out here instead of in the header. */}
            <div className="mt-1 flex items-center gap-3 rounded-md px-3 py-2.5 sm:hidden">
              <span className="grid size-9 place-items-center rounded-full bg-[#fbbf24] text-xs font-bold text-[#10203d]" aria-hidden>{user?.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-sm font-semibold">{user?.name}</div>
                <div className="text-xs text-white/60">{user?.role && title(user.role)}</div>
              </div>
              <button onClick={logout} aria-label="Sign out" className="rounded-md p-2 text-white/70 hover:bg-white/10 hover:text-white"><LogOut className="size-5" /></button>
            </div>
            <button type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} title={collapsed ? 'Expand menu' : 'Collapse menu'}
              className={cx('hidden w-full items-center gap-3 md:flex rounded-md px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#fbbf24]', collapsed && 'justify-center')}>
              {collapsed ? <ChevronsRight className="size-5 shrink-0" /> : <><ChevronsLeft className="size-5 shrink-0" />Collapse</>}
            </button>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {ws === 'reconnecting' && (
            <div role="status" className="flex items-center gap-2 bg-yellow-900/60 px-4 py-1.5 text-sm text-yellow-200">
              <WifiOff className="size-4" /> Reconnecting to live feed…
            </div>
          )}
          <main className="flex-1 overflow-y-auto p-4 lg:p-6"><div key={pathname} className="motion-safe:animate-page-in">{children}</div></main>
        </div>
      </div>
      <Toaster />
    </div>
  );
}
