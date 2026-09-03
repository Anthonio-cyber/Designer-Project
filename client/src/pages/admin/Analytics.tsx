import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { AreaChart, BarList, DonutChart, StatTile, type Point } from '@/components/ui/Charts';
import { Card, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import { PROJECT_STATUS_META } from '@/lib/format';

interface AnalyticsData {
  days: number;
  series: { portfolioViews: Point[]; requests: Point[]; messages: Point[]; completed: Point[] };
  topProjects: { id: string; title: string; views: number; categoryName: string | null }[];
  categoryBreakdown: { id: string; name: string; projects: number; views: number }[];
  projectsByStatus: { status: string; count: number }[];
  newClients: { day: string; count: number }[];
  totals: { views: number; requests: number; messages: number; completed: number };
}

const STATUS_COLORS: Record<string, string> = {
  request_received: '#fbbf24',
  discussion: '#38bdf8',
  designing: '#a78bfa',
  review: '#fb923c',
  completed: '#34d399',
  cancelled: '#94a3b8',
};

type Range = '7' | '30' | '90' | '365';

export default function Analytics() {
  const [range, setRange] = useState<Range>('30');
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    setData(null);
    void api
      .get<AnalyticsData>('/admin/analytics', { days: range })
      .then(setData)
      .catch(() => setData(null));
  }, [range]);

  return (
    <div>
      <PageHeader title="Analytics" description="How the portfolio performs and where work comes from." />

      <Tabs
        className="mb-6"
        value={range}
        onChange={setRange}
        tabs={[
          { value: '7', label: 'Last 7 days' },
          { value: '30', label: 'Last 30 days' },
          { value: '90', label: 'Last 90 days' },
          { value: '365', label: 'Last year' },
        ]}
      />

      {!data ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-28" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Portfolio views" value={data.totals.views} icon={<Icon.eye className="h-4 w-4" />} />
            <StatTile label="Project requests" value={data.totals.requests} icon={<Icon.inbox className="h-4 w-4" />} />
            <StatTile label="Messages" value={data.totals.messages} icon={<Icon.chat className="h-4 w-4" />} />
            <StatTile label="Projects completed" value={data.totals.completed} icon={<Icon.check className="h-4 w-4" />} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Portfolio views</h2>
              <AreaChart data={data.series.portfolioViews} label="Portfolio views" />
            </Card>
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Project requests</h2>
              <AreaChart data={data.series.requests} label="Project requests" />
            </Card>
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Message activity</h2>
              <AreaChart data={data.series.messages} label="Messages sent" />
            </Card>
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Projects completed</h2>
              <AreaChart data={data.series.completed} label="Projects completed" />
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Most viewed projects</h2>
              <BarList
                items={data.topProjects.map((project) => ({
                  label: project.title,
                  value: project.views,
                  hint: `${project.views} views`,
                }))}
                emptyLabel="No portfolio views recorded yet."
              />
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Popular categories</h2>
              <BarList
                items={data.categoryBreakdown
                  .filter((category) => category.projects > 0)
                  .map((category) => ({
                    label: category.name,
                    value: category.views,
                    hint: `${category.projects} project${category.projects === 1 ? '' : 's'}`,
                  }))}
                emptyLabel="No categories in use yet."
              />
            </Card>

            <Card>
              <h2 className="mb-4 font-display text-base font-semibold text-ink">Projects by stage</h2>
              <DonutChart
                segments={data.projectsByStatus.map((entry) => ({
                  label: PROJECT_STATUS_META[entry.status]?.label ?? entry.status,
                  value: entry.count,
                  color: STATUS_COLORS[entry.status] ?? '#94a3b8',
                }))}
              />
            </Card>
          </div>

          <Card className="mt-6">
            <h2 className="mb-4 font-display text-base font-semibold text-ink">New clients</h2>
            <AreaChart
              data={data.newClients.map((entry) => ({ day: entry.day, count: entry.count }))}
              label="New client registrations"
            />
          </Card>
        </>
      )}
    </div>
  );
}
