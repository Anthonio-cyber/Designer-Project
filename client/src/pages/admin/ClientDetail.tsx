import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatBytes, formatDate, PROJECT_STATUS_META, REQUEST_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, LinkButton } from '@/components/ui/Button';
import { Avatar, Badge, Card, EmptyState, Modal, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile } from '@/lib/types';

interface ClientDetailData {
  client: {
    id: string;
    name: string;
    email: string;
    status: string;
    createdAt: string;
    lastSeenAt: string | null;
    avatarUrl: string | null;
    online: boolean;
    company: string | null;
    phone: string | null;
    location: string | null;
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    totalRequests: number;
  };
  projects: { id: string; code: string; title: string; status: string; progress: number; updatedAt: string }[];
  requests: { id: string; projectType: string | null; status: string; description: string; createdAt: string }[];
  files: AttachedFile[];
  conversation: { id: string };
}

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<ClientDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'blocked' | 'deactivated' | 'active' | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api.get<ClientDetailData>(`/admin/clients/${id}`));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this client.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async () => {
    if (!confirming || !id) return;
    setBusy(true);
    try {
      await api.patch(`/admin/clients/${id}`, { status: confirming });
      success(
        confirming === 'active'
          ? 'Account reactivated'
          : confirming === 'blocked'
            ? 'Account blocked'
            : 'Account deactivated',
      );
      setConfirming(null);
      await load();
    } catch (caught) {
      toastError('Could not update the account', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <EmptyState
        title="Client not found"
        description={error}
        action={<LinkButton to="/admin/clients">Back to clients</LinkButton>}
      />
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const { client } = data;

  return (
    <div>
      <PageHeader
        title={client.name}
        description={client.company ? `${client.company} · ${client.email}` : client.email}
        backTo="/admin/clients"
        backLabel="Clients"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => navigate(`/admin/messages?conversation=${data.conversation.id}`)}
              icon={<Icon.chat className="h-4 w-4" />}
            >
              Open conversation
            </Button>
            {client.status === 'active' ? (
              <Button variant="ghost" className="text-rose-500" onClick={() => setConfirming('blocked')}>
                Block
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming('active')}>
                Reactivate
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <div className="space-y-6">
          <Card className="text-center">
            <Avatar name={client.name} src={client.avatarUrl} size="lg" online={client.online} className="mx-auto" />
            <h2 className="mt-3 font-display text-lg font-semibold text-ink">{client.name}</h2>
            <Badge
              tone={client.status === 'active' ? 'success' : client.status === 'blocked' ? 'danger' : 'neutral'}
              className="mt-2"
            >
              {client.status}
            </Badge>

            <dl className="mt-5 space-y-3 border-t border-line pt-5 text-left text-sm">
              {[
                ['Email', client.email],
                ['Company', client.company],
                ['Phone', client.phone],
                ['Location', client.location],
                ['Joined', formatDate(client.createdAt)],
                ['Last seen', client.lastSeenAt ? relativeTime(client.lastSeenAt) : 'Never'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-faint">{label}</dt>
                  <dd className="mt-0.5 break-words text-ink">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">At a glance</h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-center">
              {[
                ['Projects', client.totalProjects],
                ['Active', client.activeProjects],
                ['Completed', client.completedProjects],
                ['Requests', client.totalRequests],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-surface-sunken py-3">
                  <dd className="font-display text-xl font-bold text-ink">{value}</dd>
                  <dt className="mt-0.5 text-[11px] text-ink-faint">{label}</dt>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Account controls</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Blocking signs the client out immediately and prevents them from signing in again.
            </p>
            <div className="mt-4 space-y-2">
              {client.status !== 'blocked' && (
                <Button variant="outline" full onClick={() => setConfirming('blocked')}>
                  Block account
                </Button>
              )}
              {client.status !== 'deactivated' && (
                <Button variant="outline" full onClick={() => setConfirming('deactivated')}>
                  Deactivate account
                </Button>
              )}
              {client.status !== 'active' && (
                <Button full onClick={() => setConfirming('active')}>
                  Reactivate account
                </Button>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Projects</h2>
            {data.projects.length === 0 ? (
              <p className="text-sm text-ink-faint">No projects yet.</p>
            ) : (
              <ul className="space-y-2">
                {data.projects.map((project) => (
                  <li key={project.id}>
                    <Link
                      to={`/admin/projects/${project.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-line p-3.5 transition hover:border-accent/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{project.title}</p>
                        <p className="text-xs text-ink-faint">
                          {project.code} · updated {relativeTime(project.updatedAt)}
                        </p>
                      </div>
                      <Badge className={PROJECT_STATUS_META[project.status]?.chip}>
                        {PROJECT_STATUS_META[project.status]?.label ?? project.status}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Requests</h2>
            {data.requests.length === 0 ? (
              <p className="text-sm text-ink-faint">No requests on file.</p>
            ) : (
              <ul className="space-y-3">
                {data.requests.map((request) => (
                  <li key={request.id}>
                    <Link
                      to={`/admin/requests/${request.id}`}
                      className="block rounded-xl border border-line p-3.5 transition hover:border-accent/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{request.projectType ?? 'Project request'}</p>
                        <Badge className={REQUEST_STATUS_META[request.status]?.chip}>
                          {REQUEST_STATUS_META[request.status]?.label ?? request.status}
                        </Badge>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-xs text-ink-muted">{request.description}</p>
                      <p className="mt-1 text-[11px] text-ink-faint">{formatDate(request.createdAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Files shared</h2>
            {data.files.length === 0 ? (
              <p className="text-sm text-ink-faint">No files uploaded by this client.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {data.files.map((file) => (
                  <li key={file.id}>
                    <a
                      href={file.url ?? '#'}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 transition hover:border-accent/50"
                    >
                      <Icon.file className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-ink">{file.name}</span>
                        <span className="block text-[10px] text-ink-faint">{formatBytes(file.size)}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        title={
          confirming === 'active'
            ? 'Reactivate this account?'
            : confirming === 'blocked'
              ? 'Block this account?'
              : 'Deactivate this account?'
        }
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant={confirming === 'active' ? 'primary' : 'danger'}
              loading={busy}
              onClick={() => void changeStatus()}
            >
              Confirm
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          {confirming === 'active'
            ? 'They will be able to sign in again and pick up where they left off.'
            : 'Every active session ends immediately and they will not be able to sign in. Their projects, files and conversation history are kept.'}
        </p>
      </Modal>
    </div>
  );
}
