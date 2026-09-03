import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatDate, PROJECT_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, ProgressBar, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { ProjectSummary, Service } from '@/lib/types';

interface ClientOption {
  id: string;
  name: string;
  email: string;
}

export default function AdminProjects() {
  const { success, error: toastError } = useToast();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setProjects(null);
    try {
      const data = await api.get<{ projects: ProjectSummary[] }>('/projects', { status, q: search });
      setProjects(data.projects);
    } catch {
      setProjects([]);
    }
  }, [status, search]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Every client project and where it stands."
        actions={
          <Button onClick={() => setCreating(true)} icon={<Icon.plus className="h-4 w-4" />}>
            New project
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: '', label: 'All' },
            { value: 'request_received', label: 'New' },
            { value: 'discussion', label: 'Discussion' },
            { value: 'designing', label: 'Designing' },
            { value: 'review', label: 'Review' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
        <div className="relative flex-1 lg:max-w-sm">
          <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search projects or clients…"
            className="pl-10"
          />
        </div>
      </div>

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Icon.briefcase className="h-5 w-5" />}
          title="No projects yet."
          description="Convert a project request, or create a project directly for an existing client."
          action={<Button onClick={() => setCreating(true)}>Create a project</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/admin/projects/${project.id}`}
              className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-base font-semibold text-ink">{project.title}</h2>
                  <p className="mt-0.5 truncate text-xs text-ink-faint">
                    {project.clientName} · {project.code}
                  </p>
                </div>
                <Badge className={PROJECT_STATUS_META[project.status]?.chip}>
                  {PROJECT_STATUS_META[project.status]?.label ?? project.status}
                </Badge>
              </div>

              {project.description && (
                <p className="mt-3 line-clamp-2 flex-1 text-sm text-ink-muted">{project.description}</p>
              )}

              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-ink-faint">
                  <span>{project.progress}%</span>
                  <span>Updated {relativeTime(project.updatedAt)}</span>
                </div>
                <ProgressBar value={project.progress} />
              </div>

              <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
                Deadline: {project.deadline ?? 'not set'} · Started {formatDate(project.createdAt)}
              </p>
            </Link>
          ))}
        </div>
      )}

      <CreateProjectModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          success('Project created');
          void load();
        }}
        onError={(message) => toastError('Could not create the project', message)}
      />
    </div>
  );
}

function CreateProjectModal({
  open,
  onClose,
  onCreated,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (message?: string) => void;
}) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    void api
      .get<{ clients: ClientOption[] }>('/admin/clients')
      .then((data) => setClients(data.clients))
      .catch(() => setClients([]));
    void api
      .get<{ services: Service[] }>('/services')
      .then((data) => setServices(data.services))
      .catch(() => setServices([]));
  }, [open]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});
    try {
      await api.post('/projects', {
        clientId: String(form.get('clientId') ?? ''),
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? '') || undefined,
        serviceId: String(form.get('serviceId') ?? '') || null,
        budget: String(form.get('budget') ?? '') || undefined,
        deadline: String(form.get('deadline') ?? '') || undefined,
      });
      onCreated();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        onError(caught.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New project" description="Open a project for an existing client.">
      <form id="create-project" onSubmit={submit} className="space-y-4">
        <Field label="Client" required htmlFor="clientId" error={errors.clientId}>
          <Select id="clientId" name="clientId" required defaultValue="">
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} — {client.email}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Project title" required htmlFor="title" error={errors.title}>
          <Input id="title" name="title" required maxLength={140} placeholder="Packaging refresh" />
        </Field>

        <Field label="Brief" htmlFor="description">
          <Textarea id="description" name="description" rows={4} maxLength={6000} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Service" htmlFor="serviceId">
            <Select id="serviceId" name="serviceId" defaultValue="">
              <option value="">Custom</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Budget" htmlFor="budget">
            <Input id="budget" name="budget" maxLength={60} placeholder="$1,200" />
          </Field>
          <Field label="Deadline" htmlFor="deadline">
            <Input id="deadline" name="deadline" maxLength={60} placeholder="6 weeks" />
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
