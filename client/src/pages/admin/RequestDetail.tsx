import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatBytes, formatDate, REQUEST_STATUS_META } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { ProjectRequest } from '@/lib/types';

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [request, setRequest] = useState<ProjectRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [summarising, setSummarising] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ request: ProjectRequest }>(`/requests/${id}`);
      setRequest(data.request);
      setNotes(data.request.adminNotes ?? '');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this request.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (payload: { status?: string; adminNotes?: string }) => {
    setSaving(true);
    try {
      const data = await api.patch<{ request: ProjectRequest }>(`/requests/${id}`, payload);
      setRequest(data.request);
      success('Request updated');
    } catch (caught) {
      toastError('Could not update', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const summarise = async () => {
    if (!id) return;
    setSummarising(true);
    try {
      const data = await api.post<{ reply: { text: string } }>('/ai/ask', {
        task: 'summarize_request',
        prompt: 'Summarise this project request for me.',
        requestId: id,
      });
      setAiSummary(data.reply.text);
    } catch (caught) {
      toastError('The assistant could not respond', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSummarising(false);
    }
  };

  if (error) {
    return (
      <EmptyState
        title="Request not found"
        description={error}
        action={<LinkButton to="/admin/requests">Back to requests</LinkButton>}
      />
    );
  }

  if (!request) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${request.projectType ?? 'Project request'} — ${request.name}`}
        description={`${request.email} · received ${formatDate(request.createdAt)}`}
        backTo="/admin/requests"
        backLabel="Requests"
        actions={
          <>
            <Badge className={REQUEST_STATUS_META[request.status]?.chip}>
              {REQUEST_STATUS_META[request.status]?.label ?? request.status}
            </Badge>
            {request.convertedProjectId ? (
              <LinkButton to={`/admin/projects/${request.convertedProjectId}`}>Open project</LinkButton>
            ) : (
              <Button onClick={() => setConverting(true)}>Convert to project</Button>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">The brief</h2>
            <p className="prose-studio mt-3 whitespace-pre-wrap">{request.description}</p>

            {request.styleExampleNote && (
              <div className="mt-5 rounded-xl bg-surface-sunken p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Style examples</h3>
                <p className="mt-2 text-sm text-ink-muted">{request.styleExampleNote}</p>
              </div>
            )}

            {request.inspirationTitle && request.inspirationSlug && (
              <p className="mt-4 text-sm text-ink-muted">
                Inspired by{' '}
                <Link to={`/portfolio/${request.inspirationSlug}`} className="font-medium text-accent hover:underline">
                  {request.inspirationTitle}
                </Link>
              </p>
            )}
          </Card>

          {request.referenceFiles.length > 0 && (
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">
                References ({request.referenceFiles.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {request.referenceFiles.map((file) => (
                  <a
                    key={file.id}
                    href={file.url ?? '#'}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="overflow-hidden rounded-xl border border-line transition hover:border-accent/50"
                  >
                    {file.mimeType?.startsWith('image/') && file.url ? (
                      <img src={file.url} alt={file.name} loading="lazy" className="aspect-square w-full object-cover" />
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-surface-sunken">
                        <Icon.file className="h-6 w-6 text-ink-faint" />
                      </div>
                    )}
                    <div className="px-2.5 py-2">
                      <p className="truncate text-[11px] font-medium text-ink">{file.name}</p>
                      <p className="text-[10px] text-ink-faint">{formatBytes(file.size)}</p>
                    </div>
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                <Icon.sparkles className="h-4 w-4 text-accent" />
                AI summary
              </h2>
              <Button size="sm" variant="outline" loading={summarising} onClick={() => void summarise()}>
                {aiSummary ? 'Regenerate' : 'Summarise this brief'}
              </Button>
            </div>
            {aiSummary ? (
              <p className="prose-studio mt-4 whitespace-pre-wrap">{aiSummary}</p>
            ) : (
              <p className="mt-3 text-sm text-ink-faint">
                Have Designer’s AI pull out the goal, deliverables, constraints and the questions worth asking.
              </p>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Private notes</h2>
            <Textarea
              className="mt-3"
              rows={4}
              maxLength={4000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Quote thinking, scope concerns, follow-ups…"
            />
            <div className="mt-3 flex justify-end">
              <Button size="sm" loading={saving} onClick={() => void patch({ adminNotes: notes })}>
                Save notes
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Brief details</h2>
            <dl className="space-y-3.5 text-sm">
              {[
                ['Name', request.name],
                ['Email', request.email],
                ['Brand', request.brandName],
                ['Project type', request.projectType],
                ['Service', request.serviceName],
                ['Budget', request.budgetRange],
                ['Deadline', request.deadline],
                ['Preferred style', request.preferredStyle],
                ['Colours', request.colors],
                ['Dimensions', request.dimensions],
                ['Target audience', request.targetAudience],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <dt className="text-xs text-ink-faint">{label}</dt>
                  <dd className="mt-0.5 break-words text-ink">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Status</h2>
            <Select
              className="mt-3"
              value={request.status}
              disabled={saving}
              onChange={(event) => void patch({ status: event.target.value })}
            >
              <option value="new">New</option>
              <option value="reviewing">Reviewing</option>
              <option value="converted">Converted</option>
              <option value="declined">Declined</option>
            </Select>
            {request.userId ? (
              <LinkButton to={`/admin/clients/${request.userId}`} variant="outline" full className="mt-4">
                View client record
              </LinkButton>
            ) : (
              <p className="mt-4 text-xs text-ink-faint">
                This request came from a visitor without an account. To convert it into a project, ask them to
                register first, or pick an existing client.
              </p>
            )}
          </Card>
        </div>
      </div>

      <ConvertModal
        open={converting}
        request={request}
        onClose={() => setConverting(false)}
        onDone={(projectId) => {
          setConverting(false);
          success('Project created', 'The client has been notified.');
          navigate(`/admin/projects/${projectId}`);
        }}
      />
    </div>
  );
}

function ConvertModal({
  open,
  request,
  onClose,
  onDone,
}: {
  open: boolean;
  request: ProjectRequest;
  onClose: () => void;
  onDone: (projectId: string) => void;
}) {
  const { error: toastError } = useToast();
  const [clients, setClients] = useState<{ id: string; name: string; email: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ clients: { id: string; name: string; email: string }[] }>('/admin/clients')
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
  }, [open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      const data = await api.post<{ projectId: string }>(`/requests/${request.id}/convert`, {
        title: String(form.get('title') ?? '') || undefined,
        clientId: String(form.get('clientId') ?? '') || undefined,
        budget: String(form.get('budget') ?? '') || undefined,
        deadline: String(form.get('deadline') ?? '') || undefined,
      });
      onDone(data.projectId);
    } catch (caught) {
      toastError('Could not convert', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convert to project"
      description="Opens a tracked project and notifies the client."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Project title" htmlFor="convert-title">
          <Input
            id="convert-title"
            name="title"
            defaultValue={request.projectType ? `${request.projectType} — ${request.brandName ?? request.name}` : ''}
            maxLength={140}
          />
        </Field>

        <Field
          label="Client account"
          htmlFor="convert-client"
          hint={
            request.userId
              ? 'Matched automatically from the request.'
              : 'This request has no account. Pick the client it belongs to.'
          }
        >
          <Select id="convert-client" name="clientId" defaultValue={request.userId ?? ''}>
            <option value="">Match by email</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} — {client.email}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Budget" htmlFor="convert-budget">
            <Input id="convert-budget" name="budget" defaultValue={request.budgetRange ?? ''} maxLength={60} />
          </Field>
          <Field label="Deadline" htmlFor="convert-deadline">
            <Input id="convert-deadline" name="deadline" defaultValue={request.deadline ?? ''} maxLength={60} />
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}
