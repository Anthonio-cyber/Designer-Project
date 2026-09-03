import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '@/context/NotificationContext';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Icon } from './Icons';
import { EmptyState } from './Primitives';

export function NotificationBell({ className }: { className?: string }) {
  const { notifications, unread, markRead, markAllRead, remove } = useNotifications();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5"
      >
        <Icon.bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        /* On phones this becomes a sheet pinned to the viewport edges rather
           than a dropdown that would run off screen. */
        <div className="fixed inset-x-3 top-16 z-50 origin-top animate-scale-in overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[380px]">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <h3 className="text-sm font-semibold text-ink">Notifications</h3>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-accent hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <EmptyState
                className="border-0 py-10"
                icon={<Icon.bell className="h-5 w-5" />}
                title="No notifications yet"
                description="Project updates and new messages will show up here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {notifications.map((item) => {
                  const body = (
                    <>
                      <div className="flex items-start gap-2">
                        {!item.readAt && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                        <div className={cn('min-w-0 flex-1', item.readAt && 'pl-3.5')}>
                          <p className="text-sm font-medium text-ink">{item.title}</p>
                          {item.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{item.body}</p>}
                          <p className="mt-1 text-[11px] text-ink-faint">{relativeTime(item.createdAt)}</p>
                        </div>
                      </div>
                    </>
                  );

                  return (
                    <li key={item.id} className="group relative">
                      {item.link ? (
                        <Link
                          to={item.link}
                          onClick={() => {
                            if (!item.readAt) void markRead(item.id);
                            setOpen(false);
                          }}
                          className="block px-4 py-3 transition hover:bg-ink/4 dark:hover:bg-white/5"
                        >
                          {body}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => !item.readAt && void markRead(item.id)}
                          className="block w-full px-4 py-3 text-left transition hover:bg-ink/4 dark:hover:bg-white/5"
                        >
                          {body}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void remove(item.id)}
                        aria-label="Dismiss"
                        className="absolute right-2 top-2 rounded-lg p-1 text-ink-faint opacity-0 transition hover:bg-ink/6 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                      >
                        <Icon.x className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
