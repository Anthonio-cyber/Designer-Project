import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate, PROJECT_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { Badge, EmptyState, ProgressBar, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { ProjectSummary } from '@/lib/types';

type Filter = 'all' | 'active' | 'review' | 'completed';

export default function Projects() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    void api
      .get<{ projects: ProjectSummary[] }>('/projects')
      .then((data) => setProjects(data.projects))
      .catch(() => setProjects([]));
  }, []);

  const counts = useMemo(() => {
    const list = projects ?? [];
    return {
      all: list.length,
      active: list.filter((project) => ['discussion', 'designing'].includes(project.status)).length,
      review: list.filter((project) => project.status === 'review').length,
      completed: list.filter((project) => project.status === 'completed').length,
    };
  }, [projects]);

  const visible = useMemo(() => {
    const list = projects ?? [];
    if (filter === 'active') return list.filter((project) => ['discussion', 'designing'].includes(project.status));
    if (filter === 'review') return list.filter((project) => project.status === 'review');
    if (filter === 'completed') return list.filter((project) => project.status === 'completed');
    return list;
  }, [projects, filter]);

  return (
    <div>
      <PageHeader
        title="My Projects"
        description="Track every project from first brief to final files."
        actions={
          <LinkButton to="/request" icon={<Icon.plus className="h-4 w-4" />}>
            New request
          </LinkButton>
        }
      />

      <Tabs
        className="mb-5"
        value={filter}
        onChange={setFilter}
        tabs={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'active', label: 'In progress', count: counts.active },
          { value: 'review', label: 'Awaiting review', count: counts.review },
          { value: 'completed', label: 'Completed', count: counts.completed },
        ]}
      />

      {projects === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<Icon.briefcase className="h-5 w-5" />}
          title="No projects yet."
          description={
            filter === 'all'
              ? 'Send a project request and the studio will open a project for you.'
              : 'Nothing in this stage right now.'
          }
          action={filter === 'all' ? <LinkButton to="/request">Start a project</LinkButton> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((project) => {
            const meta = PROJECT_STATUS_META[project.status];
            return (
              <Link
                key={project.id}
                to={`/dashboard/projects/${project.id}`}
                className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-base font-semibold text-ink">{project.title}</h2>
                    <p className="mt-0.5 text-xs text-ink-faint">{project.code}</p>
                  </div>
                  <Badge className={meta?.chip}>{meta?.label ?? project.status}</Badge>
                </div>

                {project.description && (
                  <p className="mt-3 line-clamp-2 flex-1 text-sm text-ink-muted">{project.description}</p>
                )}

                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-ink-faint">
                    <span>{project.progress}% complete</span>
                    <span>Updated {relativeTime(project.updatedAt)}</span>
                  </div>
                  <ProgressBar value={project.progress} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-xs">
                  <div>
                    <dt className="text-ink-faint">Started</dt>
                    <dd className="mt-0.5 text-ink">{formatDate(project.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-faint">Deadline</dt>
                    <dd className="mt-0.5 text-ink">{project.deadline ?? 'Not set'}</dd>
                  </div>
                </dl>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
