import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@vippi/shared';
import {
  AlarmClockOff,
  Ellipsis,
  FlaskConical,
  LayoutDashboard,
  ListTodo,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useOverdueLeads } from '@/entities/lead';
import { setSession, useSession } from '@/entities/session';
import { CreateLeadButton } from '@/features/lead-create';
import { LocaleSwitch } from '@/features/locale-switch';
import { apiRequest } from '@/shared/api';
import { cn, errorMessage, useMediaQuery } from '@/shared/lib';
import { Button, Dialog, Input, Tooltip } from '@/shared/ui';
import { useShellUi } from '../model/ui-store';
import { NotificationsPopover, NotificationsSheetButton } from './notifications';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  badge?: number;
}

function useNavItems(overdue: number): NavItem[] {
  const { t } = useTranslation();
  const me = useSession();
  const items: NavItem[] = [
    { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, permission: 'dashboard.read' },
    { to: '/leads', label: t('nav.leads'), icon: ListTodo },
    { to: '/overdue', label: t('nav.overdue'), icon: AlarmClockOff, badge: overdue },
    { to: '/team', label: t('nav.team'), icon: Users, permission: 'invitation.manage' },
    { to: '/settings', label: t('nav.settings'), icon: Settings, permission: 'sla.manage' },
  ];
  return items.filter((i) => !i.permission || me.permissions.includes(i.permission));
}

function useLogout() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiRequest<void>('/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      setSession(qc, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });
      void navigate('/login', { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
}

function CountBadge({ value }: { value: number }) {
  return (
    <span
      className={cn(
        'ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular',
        value > 0 ? 'bg-danger text-white' : 'bg-border text-muted-foreground',
      )}
      data-testid="overdue-count"
    >
      {value}
    </span>
  );
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          'flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground',
          isActive && 'bg-primary-subtle text-primary hover:bg-primary-subtle hover:text-primary',
          collapsed && 'justify-center px-0',
        )
      }
      aria-label={collapsed ? item.label : undefined}
    >
      <span className="relative">
        <item.icon className="size-5" aria-hidden />
        {collapsed && item.badge ? <span className="absolute -right-1 -top-1 size-2 rounded-full bg-danger" /> : null}
      </span>
      {collapsed ? null : (
        <>
          <span className="truncate">{item.label}</span>
          {item.badge !== undefined ? <CountBadge value={item.badge} /> : null}
        </>
      )}
    </NavLink>
  );
  return collapsed ? <Tooltip content={item.label}>{link}</Tooltip> : link;
}

function Sidebar({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const me = useSession();
  const { sidebarCollapsed, toggleSidebar } = useShellUi();
  const isLarge = useMediaQuery('(min-width: 1024px)');
  const collapsed = sidebarCollapsed || !isLarge;
  const logout = useLogout();
  return (
    <aside
      className={cn(
        'sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-border bg-background-subtle md:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2 border-b border-border px-3', collapsed && 'justify-center')}>
        <img src="/favicon.svg" alt="" className="size-7" />
        {collapsed ? null : (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">Vippi Leads</p>
            <p className="truncate text-xs text-muted-foreground">{me.organization.name}</p>
          </div>
        )}
      </div>
      <nav aria-label={t('nav.main')} className="flex flex-1 flex-col gap-1 p-2">
        {items.map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>
      <div className="flex flex-col gap-2 border-t border-border p-2">
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm hover:bg-surface',
              isActive && 'bg-primary-subtle text-primary',
              collapsed && 'justify-center px-0',
            )
          }
          aria-label={collapsed ? t('nav.profile') : undefined}
        >
          <UserRound className="size-5 shrink-0" aria-hidden />
          {collapsed ? null : (
            <span className="min-w-0">
              <span className="block truncate font-medium">{me.user.fullName}</span>
              <span className="block truncate text-xs text-muted-foreground">{t(`role.${me.role}`)}</span>
            </span>
          )}
        </NavLink>
        {collapsed ? null : <LocaleSwitch />}
        <div className={cn('flex gap-1', collapsed && 'flex-col items-center')}>
          <Button
            variant="ghost"
            size={collapsed ? 'icon' : 'sm'}
            className={collapsed ? undefined : 'flex-1 justify-start'}
            onClick={() => logout.mutate()}
            loading={logout.isPending}
            aria-label={collapsed ? t('auth.logout') : undefined}
          >
            <LogOut aria-hidden />
            {collapsed ? null : t('auth.logout')}
          </Button>
          {isLarge ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? t('nav.expand') : t('nav.collapse')}
              aria-pressed={sidebarCollapsed}
            >
              {sidebarCollapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

function GlobalSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (value.length >= 2) void navigate(`/leads?q=${encodeURIComponent(value)}`);
  };
  return (
    <form role="search" onSubmit={submit} className="relative hidden max-w-sm flex-1 md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" aria-hidden />
      <Input
        type="search"
        aria-label={t('search.global')}
        placeholder={t('search.placeholder')}
        className="pl-9"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

function DemoBanner() {
  const { t } = useTranslation();
  return (
    <div className="flex h-9 items-center justify-center gap-2 bg-warning-bg px-4 text-sm font-medium text-warning" role="note">
      <FlaskConical className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{t('demo.banner')}</span>
    </div>
  );
}

function MobileNav({ items }: { items: NavItem[] }) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const logout = useLogout();
  const primary = items.filter((i) => i.to === '/leads' || i.to === '/overdue');
  const rest: NavItem[] = [
    ...items.filter((i) => i.to !== '/leads' && i.to !== '/overdue'),
    { to: '/profile', label: t('nav.profile'), icon: UserRound },
  ];
  const tab = 'flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground min-h-14';
  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {primary.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => cn(tab, isActive && 'text-primary')}>
          <span className="relative">
            <item.icon className="size-5" aria-hidden />
            {item.badge ? (
              <span className="absolute -right-2 -top-2 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] text-white tabular">
                {item.badge}
              </span>
            ) : null}
          </span>
          {item.label}
        </NavLink>
      ))}
      <NotificationsSheetButton className={tab} />
      <button type="button" className={tab} onClick={() => setMoreOpen(true)}>
        <Ellipsis className="size-5" aria-hidden />
        {t('nav.more')}
      </button>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen} title={t('nav.more')}>
        <div className="flex flex-col gap-1">
          {rest.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setMoreOpen(false)}
              className="flex min-h-11 items-center gap-3 rounded-md px-3 text-base hover:bg-background-subtle"
            >
              <item.icon className="size-5 text-muted-foreground" aria-hidden />
              {item.label}
            </NavLink>
          ))}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <LocaleSwitch />
            <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending}>
              <LogOut aria-hidden />
              {t('auth.logout')}
            </Button>
          </div>
        </div>
      </Dialog>
    </nav>
  );
}

/** Authenticated layout: sidebar, topbar, demo banner, mobile bottom nav (UX §3). */
export function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  const me = useSession();
  const overdue = useOverdueLeads({ page: 1, pageSize: 10 });
  const items = useNavItems(overdue.data?.total ?? 0);
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-[80] rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t('nav.skipToContent')}
      </a>
      <Sidebar items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        {me.organization.isDemo ? <DemoBanner /> : null}
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur md:px-6">
          <span className="truncate text-sm font-semibold md:hidden">{me.organization.name}</span>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">
              <NotificationsPopover />
            </div>
            <CreateLeadButton size="sm" />
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 pb-24 md:px-6 md:pb-8">
          {children ?? <Outlet />}
        </main>
      </div>
      <MobileNav items={items} />
    </div>
  );
}
