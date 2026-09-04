import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useNotifications } from '@/context/NotificationContext';
import { Icon, type IconName } from '@/components/ui/Icons';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { GlobalSearch } from '@/components/ui/GlobalSearch';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { Avatar } from '@/components/ui/Primitives';
import { MobileBottomNav } from './MobileBottomNav';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  badge?: 'messages' | 'alerts';
}

interface DashboardLayoutProps {
  items: NavItem[];
  title: string;
  homeHref: string;
  variant: 'client' | 'admin';
  footer?: ReactNode;
}

export function DashboardLayout({ items, title, homeHref, variant, footer }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const { settings } = useSettings();
  const { unread, unreadMessages } = useNotifications();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  const badgeFor = (item: NavItem): number =>
    item.badge === 'messages' ? unreadMessages : item.badge === 'alerts' ? unread : 0;

  // The header bar and the page body share one container, so the search field,
  // notification bell and theme toggle stay aligned with the content beneath
  // them instead of drifting to the window edge on a wide screen.
  // Admin runs wide (three-pane messaging, dense tables); the client dashboard
  // stays narrower so text lines remain comfortable to read.
  const container = cn(
    'mx-auto w-full px-4 sm:px-6 lg:px-8',
    variant === 'admin' ? 'max-w-[1440px]' : 'max-w-6xl',
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 px-5 py-5">
        {settings?.logoUrl ? (
          <img src={settings.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white">
            {(settings?.logoText ?? 'AS').slice(0, 2)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-display text-sm font-bold text-ink">
            {settings?.brandName ?? 'Studio'}
          </span>
          <span className="block text-[11px] font-medium uppercase tracking-wider text-accent">{title}</span>
        </span>
      </Link>

      <nav className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {items.map((item) => {
          const Glyph = Icon[item.icon];
          const count = badgeFor(item);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                  isActive
                    ? 'bg-accent/12 text-accent'
                    : 'text-ink-muted hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5',
                )
              }
            >
              <Glyph className="h-[18px] w-[18px] shrink-0" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {count > 0 && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {count > 99 ? '99+' : count}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-line p-3">
        {footer}
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user?.name ?? '?'} src={user?.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-xs text-ink-faint">{user?.email}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sign out"
            title="Sign out"
            className="rounded-lg p-2 text-ink-faint transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
          >
            <Icon.logout className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] border-r border-line bg-surface-raised lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-neutral-950/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative h-full w-[276px] animate-slide-in-right border-r border-line bg-surface-raised">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur-xl">
          <div className={cn('flex h-16 items-center gap-2', container)}>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink transition hover:bg-ink/5 lg:hidden dark:hover:bg-white/5"
            >
              <Icon.menu className="h-5 w-5" />
            </button>

            <Link to={homeHref} className="font-display text-[15px] font-semibold text-ink lg:hidden">
              {title}
            </Link>

            <div className="ml-auto flex items-center gap-1.5">
              <div className="hidden md:block">
                <GlobalSearch />
              </div>
              <div className="md:hidden">
                <GlobalSearch variant="inline" />
              </div>
              <NotificationBell />
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className={cn('pb-24 pt-6 lg:pb-12', variant === 'client' && 'pb-28')}>
          <div className={container}>
            <Outlet />
          </div>
        </main>
      </div>

      {variant === 'client' && <MobileBottomNav />}
    </div>
  );
}
