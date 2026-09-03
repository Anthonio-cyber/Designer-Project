import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Icon } from '@/components/ui/Icons';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { GlobalSearch } from '@/components/ui/GlobalSearch';
import { LinkButton } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Primitives';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/portfolio', label: 'Portfolio' },
  { to: '/services', label: 'Services' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

export function Navbar() {
  const { user, isAdmin } = useAuth();
  const { settings } = useSettings();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const dashboardHref = isAdmin ? '/admin' : '/dashboard';

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b border-line bg-surface/85 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70'
          : 'bg-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-[72px] sm:px-6 lg:px-8">
        <Link to="/" className="group flex shrink-0 items-center gap-2.5" aria-label="Home">
          {settings?.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white">
              {(settings?.logoText ?? 'AS').slice(0, 2)}
            </span>
          )}
          <span className="font-display text-[15px] font-bold tracking-tight text-ink transition group-hover:text-accent">
            {settings?.brandName ?? 'Studio'}
          </span>
        </Link>

        <ul className="ml-4 hidden items-center gap-0.5 lg:flex">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'relative rounded-lg px-3 py-2 text-sm font-medium transition',
                    isActive ? 'text-ink' : 'text-ink-muted hover:text-ink',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {link.label}
                    {isActive && (
                      <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-accent" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden sm:block">
            <GlobalSearch variant="inline" />
          </div>
          <ThemeToggle />

          {user ? (
            <Link
              to={dashboardHref}
              className="ml-1 hidden items-center gap-2 rounded-xl border border-line bg-surface-raised py-1.5 pl-1.5 pr-3 text-sm font-medium text-ink transition hover:border-accent/50 sm:inline-flex"
            >
              <Avatar name={user.name} src={user.avatarUrl} size="xs" />
              <span className="max-w-[120px] truncate">{user.name.split(' ')[0]}</span>
            </Link>
          ) : (
            <div className="ml-1 hidden items-center gap-2 lg:flex">
              <LinkButton to="/login" variant="ghost" size="sm">
                Client Login
              </LinkButton>
              <LinkButton to="/request" size="sm">
                Message Designer
              </LinkButton>
            </div>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink transition hover:bg-ink/5 lg:hidden dark:hover:bg-white/5"
          >
            {open ? <Icon.x className="h-5 w-5" /> : <Icon.menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile sheet */}
      <div
        className={cn(
          'fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-line bg-surface px-4 pb-10 pt-4 transition-all duration-300 lg:hidden',
          open ? 'visible opacity-100' : 'invisible -translate-y-2 opacity-0',
        )}
      >
        <ul className="space-y-1">
          {LINKS.map((link) => (
            <li key={link.to}>
              <NavLink
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center justify-between rounded-xl px-4 py-3.5 text-base font-medium transition',
                    isActive ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-ink/5 dark:hover:bg-white/5',
                  )
                }
              >
                {link.label}
                <Icon.arrowRight className="h-4 w-4 opacity-40" />
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-2.5 border-t border-line pt-6">
          <LinkButton to="/request" full size="lg">
            Message Designer
          </LinkButton>
          {user ? (
            <LinkButton to={dashboardHref} variant="outline" full size="lg">
              {isAdmin ? 'Admin dashboard' : 'My dashboard'}
            </LinkButton>
          ) : (
            <LinkButton to="/login" variant="outline" full size="lg">
              Client Login
            </LinkButton>
          )}
        </div>
      </div>
    </header>
  );
}
