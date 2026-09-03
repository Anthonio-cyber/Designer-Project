import { Link } from 'react-router-dom';
import { useNotifications } from '@/context/NotificationContext';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';

const TYPE_ICON: Record<string, keyof typeof Icon> = {
  message: 'chat',
  project_request: 'inbox',
  project_status: 'briefcase',
  revision_request: 'undo',
  design_approved: 'check',
  delivery: 'image',
  file_upload: 'file',
  system: 'bell',
};

export default function Notifications() {
  const { notifications, unread, markRead, markAllRead, remove } = useNotifications();

  return (
    <div>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : 'You are all caught up.'}
        actions={
          unread > 0 && (
            <Button variant="outline" onClick={() => void markAllRead()}>
              Mark all read
            </Button>
          )
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Icon.bell className="h-5 w-5" />}
          title="No notifications yet."
          description="Project updates, new messages and design deliveries will appear here."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {notifications.map((item) => {
              const Glyph = Icon[TYPE_ICON[item.type] ?? 'bell'];
              const inner = (
                <div className="flex gap-3.5">
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                      item.readAt ? 'bg-ink/5 text-ink-faint dark:bg-white/8' : 'bg-accent/12 text-accent',
                    )}
                  >
                    <Glyph className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', item.readAt ? 'text-ink-muted' : 'font-medium text-ink')}>
                      {item.title}
                    </p>
                    {item.body && <p className="mt-0.5 text-xs text-ink-muted">{item.body}</p>}
                    <p className="mt-1 text-[11px] text-ink-faint">{relativeTime(item.createdAt)}</p>
                  </div>
                  {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />}
                </div>
              );

              return (
                <li key={item.id} className="group relative">
                  {item.link ? (
                    <Link
                      to={item.link}
                      onClick={() => !item.readAt && void markRead(item.id)}
                      className="block px-5 py-4 transition hover:bg-ink/4 dark:hover:bg-white/5"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !item.readAt && void markRead(item.id)}
                      className="block w-full px-5 py-4 text-left transition hover:bg-ink/4 dark:hover:bg-white/5"
                    >
                      {inner}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    aria-label="Dismiss notification"
                    className="absolute right-3 top-3 rounded-lg p-1.5 text-ink-faint opacity-0 transition hover:bg-rose-500/10 hover:text-rose-500 focus:opacity-100 group-hover:opacity-100"
                  >
                    <Icon.x className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
