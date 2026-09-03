import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate, PROJECT_STATUS_META, relativeTime, REQUEST_STATUS_META } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { LinkButton } from '@/components/ui/Button';
import { AreaChart, StatTile, type Point } from '@/components/ui/Charts';
import { Badge, Card, EmptyState, ProgressBar, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';

interface Overview {
  stats: Record<string, number>;
  recentRequests: { id: string; name: string; email: string; projectType: string | null; status: string; createdAt: string }[];
  recentProjects: { id: string; code: string; title: string; status: string; progress: number; updatedAt: string; clientName: string }[];
  recentActivity: { id: string; action: string; actorType: string; actorName: string | null; createdAt: string }[];
}

export default function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [views, setViews] = useState<Point[]>([]);

  useEffect(() => {
    void api.get<Overview>('/admin/overview').then(setOverview).catch(() => setOverview(null));
    void api
      .get<{ series: { portfolioViews: Point[] } }>('/admin/analytics', { days: 30 })
      .then((data) => setViews(data.series.portfolioViews))
      .catch(() => setViews([]));
  }, []);

  if (!overview) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  const { stats } = overview;

  return (
    <div>
      <PageHeader
        title="Studio dashboard"
        description="Everything that needs your attention today."
        actions={
          <>
            <LinkButton to="/admin/portfolio/new" variant="outline" icon={<Icon.plus className="h-4 w-4" />}>
              Add design
            </LinkButton>
            <LinkButton to="/admin/ai" icon={<Icon.sparkles className="h-4 w-4" />}>
              Designer’s AI
            </LinkButton>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total projects" value={stats.totalProjects} icon={<Icon.briefcase className="h-4 w-4" />} />
        <StatTile label="Active projects" value={stats.activeProjects} hint="In discussion, design or review" icon={<Icon.clock className="h-4 w-4" />} />
        <StatTile label="Completed" value={stats.completedProjects} icon={<Icon.check className="h-4 w-4" />} />
        <StatTile label="Total clients" value={stats.totalClients} hint={`${stats.activeClients} active`} icon={<Icon.users className="h-4 w-4" />} />
        <StatTile label="Unread messages" value={stats.unreadMessages} icon={<Icon.chat className="h-4 w-4" />} />
        <StatTile label="Pending requests" value={stats.pendingRequests} icon={<Icon.inbox className="h-4 w-4" />} />
        <StatTile label="Open revisions" value={stats.openRevisions} icon={<Icon.undo className="h-4 w-4" />} />
        <StatTile
          label="Portfolio views"
          value={stats.portfolioViews.toLocaleString()}
          hint={`${stats.viewsLast30} in the last 30 days`}
          icon={<Icon.eye className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Portfolio views</h2>
              <p className="text-xs text-ink-faint">Last 30 days</p>
            </div>
            <Link to="/admin/analytics" className="text-sm font-medium text-accent hover:underline">
              Full analytics
            </Link>
          </div>
          <AreaChart data={views} label="Portfolio views over the last 30 days" />
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink">Pending requests</h2>
            <Link to="/admin/requests" className="text-sm font-medium text-accent hover:underline">
              All
            </Link>
          </div>

          {overview.recentRequests.length === 0 ? (
            <EmptyState
              className="border-dashed py-8"
              icon={<Icon.inbox className="h-5 w-5" />}
              title="No requests yet."
              description="New project briefs land here."
            />
          ) : (
            <ul className="space-y-3">
              {overview.recentRequests.map((request) => (
                <li key={request.id}>
                  <Link
                    to={`/admin/requests/${request.id}`}
                    className="flex items-start justify-between gap-3 rounded-xl border border-line p-3 transition hover:border-accent/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{request.name}</p>
                      <p className="truncate text-xs text-ink-muted">{request.projectType ?? 'General enquiry'}</p>
                      <p className="mt-0.5 text-[11px] text-ink-faint">{relativeTime(request.createdAt)}</p>
                    </div>
                    <Badge className={REQUEST_STATUS_META[request.status]?.chip}>
                      {REQUEST_STATUS_META[request.status]?.label ?? request.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink">Recent projects</h2>
            <Link to="/admin/projects" className="text-sm font-medium text-accent hover:underline">
              All projects
            </Link>
          </div>

          {overview.recentProjects.length === 0 ? (
            <EmptyState
              className="border-dashed py-8"
              icon={<Icon.briefcase className="h-5 w-5" />}
              title="No projects yet."
              description="Convert a request into a project to get started."
            />
          ) : (
            <ul className="space-y-3">
              {overview.recentProjects.map((project) => (
                <li key={project.id}>
                  <Link
                    to={`/admin/projects/${project.id}`}
                    className="block rounded-xl border border-line p-4 transition hover:border-accent/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{project.title}</p>
                        <p className="mt-0.5 text-xs text-ink-faint">
                          {project.clientName} · {project.code}
                        </p>
                      </div>
                      <Badge className={PROJECT_STATUS_META[project.status]?.chip}>
                        {PROJECT_STATUS_META[project.status]?.label ?? project.status}
                      </Badge>
                    </div>
                    <ProgressBar value={project.progress} className="mt-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink">Activity</h2>
            <Link to="/admin/activity" className="text-sm font-medium text-accent hover:underline">
              Audit log
            </Link>
          </div>

          {overview.recentActivity.length === 0 ? (
            <p className="py-4 text-sm text-ink-faint">Nothing logged yet.</p>
          ) : (
            <ul className="space-y-3">
              {overview.recentActivity.map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0">
                    <p className="text-sm text-ink">{entry.action.replace(/[._]/g, ' ')}</p>
                    <p className="text-[11px] text-ink-faint">
                      {entry.actorName ?? entry.actorType} · {formatDate(entry.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
