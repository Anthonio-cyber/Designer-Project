import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate, REQUEST_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Input } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { ProjectRequest } from '@/lib/types';

export default function AdminRequests() {
  const [requests, setRequests] = useState<ProjectRequest[] | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setRequests(null);
    try {
      const data = await api.get<{ requests: ProjectRequest[] }>('/requests', { status, q: search });
      setRequests(data.requests);
    } catch {
      setRequests([]);
    }
  }, [status, search]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  return (
    <div>
      <PageHeader title="Project requests" description="Briefs sent from the website, newest first." />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: '', label: 'All' },
            { value: 'new', label: 'New' },
            { value: 'reviewing', label: 'Reviewing' },
            { value: 'converted', label: 'Converted' },
            { value: 'declined', label: 'Declined' },
          ]}
        />
        <div className="relative flex-1 lg:max-w-sm">
          <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search requests…"
            className="pl-10"
          />
        </div>
      </div>

      {requests === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Icon.inbox className="h-5 w-5" />}
          title="No requests yet."
          description="When someone sends a brief from the website it appears here."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <Link key={request.id} to={`/admin/requests/${request.id}`} className="card block p-5 transition hover:border-accent/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-base font-semibold text-ink">
                    {request.projectType ?? 'Project request'} — {request.name}
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {request.email} · {relativeTime(request.createdAt)}
                  </p>
                </div>
                <Badge className={REQUEST_STATUS_META[request.status]?.chip}>
                  {REQUEST_STATUS_META[request.status]?.label ?? request.status}
                </Badge>
              </div>

              <p className="mt-3 line-clamp-2 text-sm text-ink-muted">{request.description}</p>

              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-faint">
                {request.budgetRange && <span>Budget: {request.budgetRange}</span>}
                {request.deadline && <span>Deadline: {request.deadline}</span>}
                {request.referenceFiles.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Icon.paperclip className="h-3 w-3" />
                    {request.referenceFiles.length} file{request.referenceFiles.length === 1 ? '' : 's'}
                  </span>
                )}
                <span>{formatDate(request.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
