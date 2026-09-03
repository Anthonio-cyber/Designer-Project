import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatBytes, formatDate, PROJECT_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { ProjectTimeline } from '@/components/ProjectTimeline';
import { FileDropzone } from '@/components/FileDropzone';
import { Button, LinkButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, Modal, ProgressBar, Skeleton } from '@/components/ui/Primitives';
import { Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile, Delivery, ProjectDetail as Project } from '@/lib/types';

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const { success, error: toastError } = useToast();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisionFor, setRevisionFor] = useState<Delivery | null>(null);
  const [uploading, setUploading] = useState(false);

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

  const approve = async (delivery: Delivery) => {
    try {
      const data = await api.post<{ project: Project }>(
        `/projects/${id}/deliveries/${delivery.id}/approve`,
      );
      setProject(data.project);
      success('Design approved', 'The studio has been notified.');
    } catch (caught) {
      toastError('Could not approve', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!id) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of files) form.append('files', file);
      form.append('projectId', id);
      form.append('kind', 'reference');
      await api.upload('/files', form);
      await load();
      success('Files uploaded');
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  if (error) {
    return (
      <EmptyState
        title="Project not available"
        description={error}
        action={<LinkButton to="/dashboard/projects">Back to my projects</LinkButton>}
      />
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const meta = PROJECT_STATUS_META[project.status];
  const pending = project.deliveries.find((delivery) => delivery.status === 'pending');

  return (
    <div>
      <PageHeader
        title={project.title}
        description={`${project.code} · started ${formatDate(project.createdAt)}`}
        backTo="/dashboard/projects"
        backLabel="My projects"
        actions={<Badge className={meta?.chip}>{meta?.label ?? project.status}</Badge>}
      />

      <Card className="mb-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-semibold text-ink">Progress</h2>
          <span className="text-sm text-ink-muted">{project.progress}% complete</span>
        </div>
        <ProgressBar value={project.progress} className="mb-6" />
        <ProjectTimeline status={project.status} events={project.timeline} />
      </Card>

      {pending && (
        <Card className="mb-6 border-accent/40 bg-accent/5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Badge tone="accent">Version {pending.version}</Badge>
              <h2 className="mt-2 font-display text-lg font-semibold text-ink">{pending.title}</h2>
              {pending.note && <p className="mt-1.5 text-sm text-ink-muted">{pending.note}</p>}
              <p className="mt-1 text-xs text-ink-faint">Sent {relativeTime(pending.createdAt)}</p>
            </div>
          </div>

          {pending.files.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {pending.files.map((file) => (
                <FilePreview key={file.id} file={file} />
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
            <Button onClick={() => void approve(pending)} icon={<Icon.check className="h-4 w-4" />}>
              Approve Design
            </Button>
            <Button variant="outline" onClick={() => setRevisionFor(pending)} icon={<Icon.undo className="h-4 w-4" />}>
              Request Revision
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Brief</h2>
            <p className="prose-studio mt-3 whitespace-pre-wrap">{project.description || 'No brief recorded.'}</p>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-ink-faint">Budget</dt>
                <dd className="mt-0.5 text-ink">{project.budget ?? 'To be agreed'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Deadline</dt>
                <dd className="mt-0.5 text-ink">{project.deadline ?? 'Not set'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-faint">Service</dt>
                <dd className="mt-0.5 text-ink">{project.serviceName ?? 'Custom'}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Design history</h2>
            {project.deliveries.length === 0 ? (
              <EmptyState
                className="mt-4 border-dashed"
                icon={<Icon.image className="h-5 w-5" />}
                title="No designs delivered yet."
                description="When the studio sends a design, it appears here for you to approve or send back."
              />
            ) : (
              <ul className="mt-4 space-y-4">
                {project.deliveries.map((delivery) => (
                  <li key={delivery.id} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          v{delivery.version} · {delivery.title}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-faint">{formatDate(delivery.createdAt)}</p>
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
                          <FilePreview key={file.id} file={file} compact />
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {project.revisions.length > 0 && (
            <Card>
              <h2 className="font-display text-base font-semibold text-ink">Your revision requests</h2>
              <ul className="mt-4 space-y-3">
                {project.revisions.map((revision) => (
                  <li key={revision.id} className="rounded-xl bg-surface-sunken p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-ink">{revision.message}</p>
                      <Badge tone={revision.status === 'resolved' ? 'success' : 'warning'}>{revision.status}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink-faint">{formatDate(revision.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Project files</h2>
            {project.files.length === 0 ? (
              <p className="mt-3 text-sm text-ink-faint">No files uploaded yet.</p>
            ) : (
              <ul className="mt-4 space-y-2">
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
                          {formatBytes(file.size)} · {file.uploaderName ?? 'Studio'}
                        </span>
                      </span>
                      <Icon.download className="h-4 w-4 shrink-0 text-ink-faint" />
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 border-t border-line pt-5">
              <h3 className="mb-3 text-sm font-medium text-ink">Add files to this project</h3>
              <FileDropzone
                files={[]}
                uploading={uploading}
                onAdd={uploadFiles}
                onRemove={() => undefined}
                label="Upload references"
                hint="Anything that helps the designer"
              />
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Talk to the designer</h2>
            <p className="mt-2 text-sm text-ink-muted">
              Questions about this project go straight into your private thread.
            </p>
            <LinkButton to="/dashboard/messages" variant="outline" full className="mt-4">
              Open messages
            </LinkButton>
          </Card>
        </div>
      </div>

      <RevisionModal
        delivery={revisionFor}
        projectId={project.id}
        onClose={() => setRevisionFor(null)}
        onDone={(updated) => {
          setProject(updated);
          setRevisionFor(null);
        }}
      />
    </div>
  );
}

function FilePreview({ file, compact }: { file: AttachedFile; compact?: boolean }) {
  const isImage = file.mimeType?.startsWith('image/');
  return (
    <a
      href={file.url ?? '#'}
      target="_blank"
      rel="noreferrer noopener"
      className="group overflow-hidden rounded-xl border border-line bg-surface-raised transition hover:border-accent/50"
    >
      {isImage && file.url ? (
        <img
          src={file.url}
          alt={file.name}
          loading="lazy"
          className={compact ? 'aspect-video w-full object-cover' : 'aspect-[4/3] w-full object-cover'}
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center bg-surface-sunken">
          <Icon.file className="h-6 w-6 text-ink-faint" />
        </div>
      )}
      <div className="px-3 py-2">
        <p className="truncate text-xs font-medium text-ink">{file.name}</p>
        <p className="text-[10px] text-ink-faint">{formatBytes(file.size)}</p>
      </div>
    </a>
  );
}

function RevisionModal({
  delivery,
  projectId,
  onClose,
  onDone,
}: {
  delivery: Delivery | null;
  projectId: string;
  onClose: () => void;
  onDone: (project: Project) => void;
}) {
  const { success, error: toastError } = useToast();
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const upload = async (incoming: File[]) => {
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of incoming) form.append('files', file);
      form.append('projectId', projectId);
      form.append('kind', 'reference');
      const data = await api.upload<{ files: AttachedFile[] }>('/files', form);
      setFiles((current) => [...current, ...data.files]);
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!delivery || message.trim().length < 5) return;
    setSubmitting(true);
    try {
      const data = await api.post<{ project: Project }>(
        `/projects/${projectId}/deliveries/${delivery.id}/revisions`,
        { message: message.trim(), fileIds: files.map((file) => file.id) },
      );
      success('Revision requested', 'The designer has been notified.');
      setMessage('');
      setFiles([]);
      onDone(data.project);
    } catch (caught) {
      toastError('Could not send', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!delivery}
      onClose={onClose}
      title="Request a revision"
      description="What would you like changed?"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submitting} disabled={message.trim().length < 5} onClick={() => void submit()}>
            Send revision request
          </Button>
        </div>
      }
    >
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={5}
        maxLength={3000}
        placeholder="Be specific — which element, and what should change about it."
      />
      <div className="mt-4">
        <FileDropzone
          files={files}
          uploading={uploading}
          onAdd={upload}
          onRemove={(id) => setFiles((current) => current.filter((file) => file.id !== id))}
          label="Attach a marked-up screenshot"
          hint="Optional, but it usually saves a round"
        />
      </div>
    </Modal>
  );
}
