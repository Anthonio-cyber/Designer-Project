import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate, REQUEST_STATUS_META } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { ProjectRequest } from '@/lib/types';

export default function Requests() {
  const [requests, setRequests] = useState<ProjectRequest[] | null>(null);

  useEffect(() => {
    void api
      .get<{ requests: ProjectRequest[] }>('/requests/mine')
      .then((data) => setRequests(data.requests))
      .catch(() => setRequests([]));
  }, []);

  return (
    <div>
      <PageHeader
        title="Project Requests"
        description="Every brief you have sent to the studio, and what happened next."
        actions={
          <LinkButton to="/request" icon={<Icon.plus className="h-4 w-4" />}>
            New request
          </LinkButton>
        }
      />

      {requests === null ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon={<Icon.inbox className="h-5 w-5" />}
          title="No requests yet."
          description="Describe what you need designed and the studio will come back with a quote."
          action={<LinkButton to="/request">Send your first request</LinkButton>}
        />
      ) : (
        <div className="space-y-4">
          {requests.map((request) => {
            const meta = REQUEST_STATUS_META[request.status];
            return (
              <Card key={request.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-ink">
                      {request.projectType ?? 'Project request'}
                    </h2>
                    <p className="mt-0.5 text-xs text-ink-faint">Sent {formatDate(request.createdAt)}</p>
                  </div>
                  <Badge className={meta?.chip}>{meta?.label ?? request.status}</Badge>
                </div>

                <p className="prose-studio mt-3 line-clamp-4 whitespace-pre-wrap">{request.description}</p>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs sm:grid-cols-4">
                  {[
                    ['Budget', request.budgetRange],
                    ['Deadline', request.deadline],
                    ['Style', request.preferredStyle],
                    ['Brand', request.brandName],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-ink-faint">{label}</dt>
                      <dd className="mt-0.5 truncate text-ink">{value || '—'}</dd>
                    </div>
                  ))}
                </dl>

                {request.referenceFiles.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {request.referenceFiles.map((file) => (
                      <a
                        key={file.id}
                        href={file.url ?? '#'}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted transition hover:border-accent/50 hover:text-accent"
                      >
                        <Icon.paperclip className="h-3.5 w-3.5" />
                        <span className="max-w-[160px] truncate">{file.name}</span>
                      </a>
                    ))}
                  </div>
                )}

                {request.convertedProjectId && (
                  <Link
                    to={`/dashboard/projects/${request.convertedProjectId}`}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
                  >
                    Open the project this became
                    <Icon.arrowRight className="h-4 w-4" />
                  </Link>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
