import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Card, EmptyState, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { ActivityEntry } from '@/lib/types';

const ACTOR_TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  admin: 'accent',
  client: 'neutral',
  ai: 'warning',
  system: 'neutral',
  visitor: 'neutral',
};

export default function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const [actorType, setActorType] = useState('');

  const load = useCallback(async () => {
    setEntries(null);
    try {
      const data = await api.get<{ activity: ActivityEntry[] }>('/admin/activity', { actorType, limit: 200 });
      setEntries(data.activity);
    } catch {
      setEntries([]);
    }
  }, [actorType]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="An audit trail of every meaningful action — yours, your clients', and the AI's."
      />

      <Tabs
        className="mb-5"
        value={actorType}
        onChange={setActorType}
        tabs={[
          { value: '', label: 'Everything' },
          { value: 'admin', label: 'Admin' },
          { value: 'client', label: 'Clients' },
          { value: 'ai', label: 'AI' },
          { value: 'system', label: 'System' },
        ]}
      />

      {entries === null ? (
        <Skeleton className="h-96" />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Icon.shield className="h-5 w-5" />}
          title="Nothing logged yet."
          description="Actions across the platform are recorded here as they happen."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              let meta: Record<string, unknown> = {};
              try {
                meta = JSON.parse(entry.meta || '{}') as Record<string, unknown>;
              } catch {
                meta = {};
              }
              const detail = Object.entries(meta)
                .filter(([, value]) => value !== null && value !== undefined && value !== '')
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(' · ');

              return (
                <li key={entry.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                  <Badge tone={ACTOR_TONE[entry.actorType] ?? 'neutral'} className="mt-0.5 shrink-0">
                    {entry.actorType}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">
                      <span className="font-medium">{entry.actorName ?? 'System'}</span>{' '}
                      <span className="text-ink-muted">{entry.action.replace(/[._]/g, ' ')}</span>
                    </p>
                    {detail && <p className="mt-0.5 truncate text-xs text-ink-faint">{detail}</p>}
                  </div>
                  <time
                    className="shrink-0 text-xs text-ink-faint"
                    dateTime={entry.createdAt}
                    title={formatDate(entry.createdAt, { dateStyle: 'full', timeStyle: 'short' } as Intl.DateTimeFormatOptions)}
                  >
                    {relativeTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
