import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatBytes, formatDate, PROJECT_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { ProjectTimeline } from '@/components/ProjectTimeline';
import { FileDropzone } from '@/components/FileDropzone';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, ProgressBar, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile, ProjectDetail as Project } from '@/lib/types';

const STATUSES = ['request_received', 'discussion', 'designing', 'review', 'completed', 'cancelled'];

export default function AdminProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { success, error: toastError } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delivering, setDelivering] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ project: Project }>(`/projects/${id}`);
      setProject(data.project);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this project.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: string, note?: string) => {
    setSavingStatus(true);
    try {
      const data = await api.patch<{ project: Project }>(`/projects/${id}`, { status, statusNote: note });
      setProject(data.project);
      success('Status updated', 'The client has been notified.');
    } catch (caught) {
      toastError('Could not update the status', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSavingStatus(false);
    }
  };

  const resolveRevision = async (revisionId: string) => {
    try {
      const data = await api.post<{ project: Project }>(`/projects/${id}/revisions/${revisionId}/resolve`);
      setProject(data.project);
    } catch (caught) {
      toastError('Could not resolve', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  if (error) {
    return (
      <EmptyState
        title="Project not found"
        description={error}
        action={<LinkButton to="/admin/projects">Back to projects</LinkButton>}
      />
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const openRevisions = project.revisions.filter((revision) => revision.status === 'open');

  return (
    <div>
      <PageHeader
        title={project.title}
        description={`${project.code} · ${project.clientName} · started ${formatDate(project.createdAt)}`}
        backTo="/admin/projects"
        backLabel="Projects"
        actions={
          <>
            <LinkButton to={`/admin/clients/${project.clientId}`} variant="outline">
              Client record
            </LinkButton>
            <Button onClick={() => setDelivering(true)} icon={<Icon.image className="h-4 w-4" />}>
              Send design
            </Button>
          </>
        }
      />

      {openRevisions.length > 0 && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/8">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Icon.undo className="h-4 w-4 text-amber-500" />
            {openRevisions.length} open revision request{openRevisions.length === 1 ? '' : 's'}
          </h2>
          <ul className="mt-4 space-y-3">
            {openRevisions.map((revision) => (
              <li key={revision.id} className="rounded-xl bg-surface-raised p-4">
                <p className="text-sm text-ink">{revision.message}</p>
                <p className="mt-1.5 text-xs text-ink-faint">
                  {revision.clientName} · {relativeTime(revision.createdAt)}
                </p>
                {revision.files.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {revision.files.map((file) => (
                      <a
                        key={file.id}
                        href={file.url ?? '#'}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-muted hover:border-accent/50"
                      >
                        <Icon.paperclip className="h-3.5 w-3.5" />
                        <span className="max-w-[140px] truncate">{file.name}</span>
                      </a>
                    ))}
                  </div>
                )}
                <Button size="sm" variant="outline" className="mt-3" onClick={() => void resolveRevision(revision.id)}>
                  Mark resolved
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mb-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-ink">Status & progress</h2>
          <div className="flex items-center gap-2">
            <Select
              value={project.status}
              disabled={savingStatus}
              onChange={(event) => void changeStatus(event.target.value)}
              aria-label="Project status"
              className="w-52"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_META[status]?.label ?? status}
                </option>
              ))}
            </Select>
            <Badge className={PROJECT_STATUS_META[project.status]?.chip}>{project.progress}%</Badge>
          </div>
        </div>
        <ProgressBar value={project.progress} className="mb-6" />
        <ProjectTimeline status={project.status} events={project.timeline} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Brief</h2>
            <p className="prose-studio mt-3 whitespace-pre-wrap">{project.description || 'No brief recorded.'}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
              {[
                ['Client', project.clientName],
                ['Budget', project.budget ?? 'Not set'],
                ['Deadline', project.deadline ?? 'Not set'],
                ['Service', project.serviceName ?? 'Custom'],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-faint">{label}</dt>
                  <dd className="mt-0.5 truncate text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Deliveries</h2>
            {project.deliveries.length === 0 ? (
              <EmptyState
                className="border-dashed"
                icon={<Icon.image className="h-5 w-5" />}
                title="No designs sent yet."
                description="Send a design and the client can approve it or request a revision."
                action={<Button onClick={() => setDelivering(true)}>Send a design</Button>}
              />
            ) : (
              <ul className="space-y-4">
                {project.deliveries.map((delivery) => (
                  <li key={delivery.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          v{delivery.version} · {delivery.title}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          Sent {formatDate(delivery.createdAt)}
                          {delivery.respondedAt && ` · answered ${relativeTime(delivery.respondedAt)}`}
                        </p>
                      </div>
                      <Badge
                        tone={
                          delivery.status === 'approved'
                            ? 'success'
                            : delivery.status === 'revision_requested'
                              ? 'warning'
                              : 'accent'
                        }
                      >
                        {delivery.status === 'revision_requested' ? 'Revision requested' : delivery.status}
                      </Badge>
                    </div>
                    {delivery.note && <p className="mt-2 text-sm text-ink-muted">{delivery.note}</p>}
                    {delivery.files.length > 0 && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-3">
                        {delivery.files.map((file) => (
                          <a
                            key={file.id}
                            href={file.url ?? '#'}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="overflow-hidden rounded-lg border border-line transition hover:border-accent/50"
                          >
                            {file.mimeType?.startsWith('image/') && file.url ? (
                              <img src={file.url} alt={file.name} loading="lazy" className="aspect-video w-full object-cover" />
                            ) : (
                              <div className="flex aspect-video items-center justify-center bg-surface-sunken">
                                <Icon.file className="h-5 w-5 text-ink-faint" />
                              </div>
                            )}
                            <p className="truncate px-2 py-1.5 text-[11px] text-ink">{file.name}</p>
                          </a>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Files</h2>
            {project.files.length === 0 ? (
              <p className="text-sm text-ink-faint">No files on this project yet.</p>
            ) : (
              <ul className="space-y-2">
                {project.files.map((file) => (
                  <li key={file.id}>
                    <a
                      href={file.url ?? '#'}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:border-accent/50"
                    >
                      <Icon.file className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">{file.name}</span>
                        <span className="block text-[11px] text-ink-faint">
                          {formatBytes(file.size)} · {file.uploaderName ?? 'studio'} · {file.kind}
                        </span>
                      </span>
                      <Icon.download className="h-4 w-4 shrink-0 text-ink-faint" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Conversation</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Discuss this project in the client's private thread.
            </p>
            <Link
              to={`/admin/messages`}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              Open messages
              <Icon.arrowRight className="h-4 w-4" />
            </Link>
          </Card>
        </div>
      </div>

      <DeliveryModal
        open={delivering}
        projectId={project.id}
        onClose={() => setDelivering(false)}
        onSent={(updated) => {
          setProject(updated);
          setDelivering(false);
          success('Design sent', 'The client can now approve it or request changes.');
        }}
      />
    </div>
  );
}

function DeliveryModal({
  open,
  projectId,
  onClose,
  onSent,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onSent: (project: Project) => void;
}) {
  const { error: toastError } = useToast();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const upload = async (incoming: File[]) => {
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of incoming) form.append('files', file);
      form.append('projectId', projectId);
      form.append('kind', 'deliverable');
      const data = await api.upload<{ files: AttachedFile[] }>('/files', form);
      setFiles((current) => [...current, ...data.files]);
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (title.trim().length < 2 || files.length === 0) return;
    setSubmitting(true);
    try {
      const data = await api.post<{ project: Project }>(`/projects/${projectId}/deliveries`, {
        title: title.trim(),
        note: note.trim() || undefined,
        fileIds: files.map((file) => file.id),
      });
      setTitle('');
      setNote('');
      setFiles([]);
      onSent(data.project);
    } catch (caught) {
      toastError('Could not send', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send a design for review"
      description="The client is notified and can approve it or request a revision."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={submitting}
            disabled={title.trim().length < 2 || files.length === 0}
            onClick={() => void submit()}
          >
            Send to client
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Title" required htmlFor="delivery-title">
          <Input
            id="delivery-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={140}
            placeholder="First direction — packaging"
          />
        </Field>
        <Field label="Note to the client" htmlFor="delivery-note" hint="Explain what to look at and what you need decided.">
          <Textarea
            id="delivery-note"
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
        <FileDropzone
          files={files}
          uploading={uploading}
          onAdd={upload}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          label="Attach the design files"
          hint="At least one file is required"
        />
      </div>
    </Modal>
  );
}
