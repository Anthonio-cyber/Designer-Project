import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/Field';
import { Avatar, Badge, Card, EmptyState, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';

interface ClientRow {
  id: string;
  name: string;
  email: string;
  status: string;
  createdAt: string;
  lastSeenAt: string | null;
  avatarUrl: string | null;
  online: boolean;
  company: string | null;
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalRequests: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

type Filter = '' | 'active' | 'blocked' | 'deactivated';

export default function Clients() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Filter>('');

  const load = useCallback(async () => {
    setClients(null);
    try {
      const data = await api.get<{ clients: ClientRow[] }>('/admin/clients', { q: search, status });
      setClients(data.clients);
    } catch {
      setClients([]);
    }
  }, [search, status]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  return (
    <div>
      <PageHeader title="Clients" description="Everyone with an account, and what they have in flight." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: '', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'blocked', label: 'Blocked' },
            { value: 'deactivated', label: 'Deactivated' },
          ]}
        />
        <div className="relative flex-1 lg:max-w-sm">
          <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or email…"
            className="pl-10"
          />
        </div>
      </div>

      {clients === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={<Icon.users className="h-5 w-5" />}
          title="No clients yet."
          description="Client accounts appear here as soon as someone registers."
        />
      ) : (
        <>
          {/* Table on desktop */}
          <Card className="hidden overflow-hidden p-0 lg:block">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-sunken text-left text-xs uppercase tracking-wider text-ink-faint">
                <tr>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Projects</th>
                  <th className="px-4 py-3 font-medium">Last message</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {clients.map((client) => (
                  <tr key={client.id} className="transition hover:bg-ink/3 dark:hover:bg-white/4">
                    <td className="px-5 py-3.5">
                      <Link to={`/admin/clients/${client.id}`} className="flex items-center gap-3">
                        <Avatar name={client.name} src={client.avatarUrl} size="sm" online={client.online} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{client.name}</span>
                          <span className="block truncate text-xs text-ink-faint">{client.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted">
                      {client.activeProjects} active · {client.completedProjects} done
                    </td>
                    <td className="max-w-[220px] px-4 py-3.5">
                      <span className="block truncate text-ink-muted">{client.lastMessage ?? '—'}</span>
                      {client.lastMessageAt && (
                        <span className="block text-xs text-ink-faint">{relativeTime(client.lastMessageAt)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ink-muted">{formatDate(client.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={client.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cards on phones and tablets */}
          <div className="space-y-3 lg:hidden">
            {clients.map((client) => (
              <Link key={client.id} to={`/admin/clients/${client.id}`} className="card block p-4">
                <div className="flex items-start gap-3">
                  <Avatar name={client.name} src={client.avatarUrl} size="sm" online={client.online} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium text-ink">{client.name}</p>
                      <StatusBadge status={client.status} />
                    </div>
                    <p className="truncate text-xs text-ink-faint">{client.email}</p>
                    <p className="mt-2 text-xs text-ink-muted">
                      {client.activeProjects} active · {client.completedProjects} completed ·{' '}
                      {client.totalRequests} requests
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={status === 'active' ? 'success' : status === 'blocked' ? 'danger' : 'neutral'}>{status}</Badge>
  );
}
