import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import { formatDate, PROJECT_STATUS_META, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { Badge, EmptyState, ProgressBar, Skeleton } from '@/components/ui/Primitives';
import { StatTile } from '@/components/ui/Charts';
import { Icon } from '@/components/ui/Icons';
import type { ProjectRequest, ProjectSummary } from '@/lib/types';

export default function Overview() {
  const { user } = useAuth();
  const { unread, unreadMessages, notifications } = useNotifications();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [requests, setRequests] = useState<ProjectRequest[]>([]);

  useEffect(() => {
    void api
      .get<{ projects: ProjectSummary[] }>('/projects')
      .then((data) => setProjects(data.projects))
      .catch(() => setProjects([]));
    void api
      .get<{ requests: ProjectRequest[] }>('/requests/mine')
      .then((data) => setRequests(data.requests))
      .catch(() => setRequests([]));
  }, []);

  const active = projects?.filter((project) => ['discussion', 'designing', 'review'].includes(project.status)) ?? [];
  const completed = projects?.filter((project) => project.status === 'completed') ?? [];
  const awaitingReview = projects?.filter((project) => project.status === 'review') ?? [];

  return (
    <div>
      <PageHeader
        title={`Hello, ${user?.name.split(' ')[0]}`}
        description="Everything happening with your projects, in one place."
        actions={
          <LinkButton to="/request" icon={<Icon.plus className="h-4 w-4" />}>
            New request
          </LinkButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active projects" value={active.length} icon={<Icon.briefcase className="h-4 w-4" />} />
        <StatTile label="Completed" value={completed.length} icon={<Icon.check className="h-4 w-4" />} />
        <StatTile label="Unread messages" value={unreadMessages} icon={<Icon.chat className="h-4 w-4" />} />
        <StatTile label="Notifications" value={unread} icon={<Icon.bell className="h-4 w-4" />} />
      </div>

      {awaitingReview.length > 0 && (
        <section className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/8 p-5">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Icon.clock className="h-4 w-4 text-amber-500" />
            Waiting on you
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {awaitingReview.length === 1 ? 'A design is' : `${awaitingReview.length} designs are`} ready for your
            approval.
          </p>
          <ul className="mt-4 space-y-2">
            {awaitingReview.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/dashboard/projects/${project.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised px-4 py-3 transition hover:shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{project.title}</span>
                    <span className="block text-xs text-ink-faint">{project.code}</span>
                  </span>
                  <Icon.arrowRight className="h-4 w-4 shrink-0 text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink">Your projects</h2>
            <Link to="/dashboard/projects" className="text-sm font-medium text-accent hover:underline">
              View all
            </Link>
          </div>

          {projects === null ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              icon={<Icon.briefcase className="h-5 w-5" />}
              title="No projects yet."
              description="Once the studio opens a project from your request, you can track it here."
              action={<LinkButton to="/request">Send a project request</LinkButton>}
            />
          ) : (
            <ul className="space-y-3">
              {projects.slice(0, 5).map((project) => {
                const meta = PROJECT_STATUS_META[project.status];
                return (
                  <li key={project.id}>
                    <Link
                      to={`/dashboard/projects/${project.id}`}
                      className="block rounded-xl border border-line p-4 transition hover:border-accent/50 hover:shadow-card"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{project.title}</p>
                          <p className="mt-0.5 text-xs text-ink-faint">
                            {project.code} · updated {relativeTime(project.updatedAt)}
                          </p>
                        </div>
                        <Badge className={meta?.chip}>{meta?.label ?? project.status}</Badge>
                      </div>
                      <ProgressBar value={project.progress} className="mt-3" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Recent requests</h2>
            {requests.length === 0 ? (
              <p className="py-4 text-sm text-ink-faint">Your request has been received — none on file yet.</p>
            ) : (
              <ul className="space-y-3">
                {requests.slice(0, 4).map((request) => (
                  <li key={request.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-ink">{request.projectType ?? 'Project request'}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">{request.description}</p>
                    <p className="mt-1 text-[11px] text-ink-faint">{formatDate(request.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
            <Link
              to="/dashboard/requests"
              className="mt-4 inline-block text-sm font-medium text-accent hover:underline"
            >
              All requests
            </Link>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">Latest activity</h2>
            {notifications.length === 0 ? (
              <p className="py-4 text-sm text-ink-faint">No notifications yet.</p>
            ) : (
              <ul className="space-y-3">
                {notifications.slice(0, 5).map((item) => (
                  <li key={item.id} className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0">
                      <p className="text-sm text-ink">{item.title}</p>
                      <p className="text-[11px] text-ink-faint">{relativeTime(item.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
