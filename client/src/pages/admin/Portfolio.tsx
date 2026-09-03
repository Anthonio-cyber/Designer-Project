import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, LinkButton } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { Category, PortfolioProject } from '@/lib/types';

type StatusFilter = 'all' | 'published' | 'draft';

export default function AdminPortfolio() {
  const { success, error: toastError } = useToast();
  const [projects, setProjects] = useState<PortfolioProject[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<PortfolioProject | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setProjects(null);
    try {
      const data = await api.get<{ projects: PortfolioProject[] }>('/portfolio', {
        status,
        category,
        q: search,
        perPage: 48,
      });
      setProjects(data.projects);
    } catch {
      setProjects([]);
    }
  }, [status, category, search]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  useEffect(() => {
    void api
      .get<{ categories: Category[] }>('/categories')
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, []);

  const togglePublish = async (project: PortfolioProject) => {
    try {
      await api.put(`/portfolio/${project.id}`, {
        status: project.status === 'published' ? 'draft' : 'published',
      });
      success(project.status === 'published' ? 'Moved to drafts' : 'Published');
      await load();
    } catch (caught) {
      toastError('Could not update', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const toggleFeatured = async (project: PortfolioProject) => {
    try {
      await api.put(`/portfolio/${project.id}`, { featured: !project.featured });
      await load();
    } catch (caught) {
      toastError('Could not update', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await api.delete(`/portfolio/${deleting.id}`);
      success('Design deleted');
      setDeleting(null);
      await load();
    } catch (caught) {
      toastError('Could not delete', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Portfolio"
        description="Add, edit and publish your work without touching any code."
        actions={
          <LinkButton to="/admin/portfolio/new" icon={<Icon.plus className="h-4 w-4" />}>
            Add design
          </LinkButton>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: 'all', label: 'All' },
            { value: 'published', label: 'Published' },
            { value: 'draft', label: 'Drafts' },
          ]}
        />
        <div className="flex flex-1 gap-3">
          <div className="relative flex-1">
            <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search designs…"
              className="pl-10"
            />
          </div>
          <Select value={category} onChange={(event) => setCategory(event.target.value)} className="w-44">
            <option value="">All categories</option>
            {categories.map((entry) => (
              <option key={entry.id} value={entry.slug}>
                {entry.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-72" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Icon.image className="h-5 w-5" />}
          title="No designs yet."
          description="Add your first project and it will appear on the public portfolio once published."
          action={<LinkButton to="/admin/portfolio/new">Add a design</LinkButton>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Card key={project.id} className="flex flex-col overflow-hidden p-0">
              <Link to={`/admin/portfolio/${project.id}`} className="block bg-surface-sunken">
                {project.thumbnailUrl ? (
                  <img
                    src={project.thumbnailUrl}
                    alt={project.title}
                    loading="lazy"
                    className="aspect-[4/3] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center">
                    <Icon.image className="h-8 w-8 text-ink-faint" />
                  </div>
                )}
              </Link>

              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-sm font-semibold text-ink">{project.title}</h2>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">
                      {project.category?.name ?? 'Uncategorised'} ·{' '}
                      {formatDate(project.projectDate ?? project.createdAt, { month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <Badge tone={project.status === 'published' ? 'success' : 'warning'}>{project.status}</Badge>
                </div>

                <p className="mt-2 text-xs text-ink-faint">{project.views.toLocaleString()} views</p>

                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  <LinkButton to={`/admin/portfolio/${project.id}`} size="sm" variant="outline">
                    Edit
                  </LinkButton>
                  <Button size="sm" variant="ghost" onClick={() => void togglePublish(project)}>
                    {project.status === 'published' ? 'Unpublish' : 'Publish'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void toggleFeatured(project)}
                    title={project.featured ? 'Remove from featured' : 'Mark as featured'}
                    className={project.featured ? 'text-accent' : undefined}
                  >
                    <Icon.sparkles className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleting(project)}
                    className="ml-auto text-rose-500 hover:bg-rose-500/10"
                    aria-label={`Delete ${project.title}`}
                  >
                    <Icon.trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete this design?"
        description={deleting?.title}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Delete permanently
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          This removes the project from your portfolio and from the public site. It cannot be undone. The uploaded
          images stay in your file library.
        </p>
      </Modal>
    </div>
  );
}
