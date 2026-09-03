import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icons';
import { useNotifications } from '@/context/NotificationContext';

const ITEMS = [
  { to: '/dashboard', label: 'Home', icon: Icon.home, end: true },
  { to: '/dashboard/projects', label: 'Projects', icon: Icon.briefcase },
  { to: '/dashboard/messages', label: 'Messages', icon: Icon.chat, badge: 'messages' as const },
  { to: '/dashboard/notifications', label: 'Alerts', icon: Icon.bell, badge: 'alerts' as const },
  { to: '/dashboard/profile', label: 'Profile', icon: Icon.user },
];

/** Client-only tab bar. Hidden on tablet and up, where the sidebar takes over. */
export function MobileBottomNav() {
  const { unread, unreadMessages } = useNotifications();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Client navigation"
    >
      <ul className="mx-auto flex max-w-lg">
        {ITEMS.map((item) => {
          const Glyph = item.icon;
          const count = item.badge === 'messages' ? unreadMessages : item.badge === 'alerts' ? unread : 0;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition',
                    isActive ? 'text-accent' : 'text-ink-faint hover:text-ink',
                  )
                }
              >
                <span className="relative">
                  <Glyph className="h-[21px] w-[21px]" />
                  {count > 0 && (
                    <span className="absolute -right-2 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </span>
                {item.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
