import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';
import { Avatar, EmptyState } from '@/components/ui/Primitives';
import { Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icons';
import type { ConversationSummary } from '@/lib/types';

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  search,
  onSearch,
  loading,
  className,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (conversation: ConversationSummary) => void;
  search?: string;
  onSearch?: (value: string) => void;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {onSearch && (
        <div className="shrink-0 border-b border-line p-3">
          <div className="relative">
            <Icon.search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={search ?? ''}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="Search conversations…"
              aria-label="Search conversations"
              className="pl-9"
            />
          </div>
        </div>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-ink/5 dark:bg-white/5" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState
            className="m-3 border-dashed"
            icon={<Icon.chat className="h-5 w-5" />}
            title="No conversations yet."
            description="When a client signs up and messages you, their thread appears here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation)}
                    aria-current={active}
                    className={cn(
                      'flex w-full items-start gap-3 px-3.5 py-3.5 text-left transition',
                      active ? 'bg-accent/8' : 'hover:bg-ink/4 dark:hover:bg-white/5',
                    )}
                  >
                    <Avatar
                      name={conversation.participant.name}
                      src={conversation.participant.avatarUrl}
                      size="sm"
                      online={conversation.participant.online}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className={cn('truncate text-sm', active ? 'font-semibold text-accent' : 'font-medium text-ink')}>
                          {conversation.participant.name}
                        </p>
                        <span className="shrink-0 text-[10.5px] text-ink-faint">
                          {relativeTime(conversation.lastMessageAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {conversation.lastMessage?.deleted
                          ? 'Message deleted'
                          : conversation.lastMessage?.body ||
                            (conversation.lastMessage?.attachments.length ? 'Sent an attachment' : 'No messages yet')}
                      </p>
                      {conversation.participant.status && conversation.participant.status !== 'active' && (
                        <span className="mt-1 inline-block rounded bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:text-rose-300">
                          {conversation.participant.status}
                        </span>
                      )}
                    </div>
                    {conversation.unread > 0 && (
                      <span className="mt-1 flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                        {conversation.unread > 99 ? '99+' : conversation.unread}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
