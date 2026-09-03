import { Link } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { Badge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { PortfolioProject } from '@/lib/types';

export function PortfolioCard({
  project,
  index = 0,
  className,
}: {
  project: PortfolioProject;
  index?: number;
  className?: string;
}) {
  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        className,
      )}
      style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
    >
      <Link to={`/portfolio/${project.slug}`} className="block overflow-hidden bg-surface-sunken">
        <div className="aspect-[4/3] w-full overflow-hidden">
          {project.thumbnailUrl ? (
            <img
              src={project.thumbnailUrl}
              alt={project.title}
              loading={index < 3 ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5">
              <Icon.image className="h-8 w-8 text-accent/50" />
            </div>
          )}
        </div>
      </Link>

      {project.featured && (
        <Badge tone="accent" className="absolute left-3 top-3 bg-surface-raised/90 backdrop-blur">
          Featured
        </Badge>
      )}
      {project.status === 'draft' && (
        <Badge tone="warning" className="absolute right-3 top-3 bg-surface-raised/90 backdrop-blur">
          Draft
        </Badge>
      )}

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-accent">
          {project.category?.name ?? 'Design'}
          <span className="text-ink-faint">·</span>
          <span className="text-ink-faint normal-case tracking-normal">
            {formatDate(project.projectDate ?? project.createdAt, { month: 'short', year: 'numeric' })}
          </span>
        </div>

        <h3 className="mt-2 font-display text-lg font-semibold leading-snug text-ink">
          <Link to={`/portfolio/${project.slug}`} className="after:absolute after:inset-0">
            {project.title}
          </Link>
        </h3>

        {project.summary && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-muted">{project.summary}</p>
        )}

        <div className="mt-auto flex items-center gap-1.5 pt-4 text-sm font-medium text-accent">
          View project
          <Icon.arrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </div>
      </div>
    </article>
  );
}

export function PortfolioCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface-raised">
      <div className="aspect-[4/3] w-full animate-pulse bg-ink/5 dark:bg-white/5" />
      <div className="space-y-3 p-5">
        <div className="h-3 w-24 animate-pulse rounded bg-ink/5 dark:bg-white/5" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-ink/5 dark:bg-white/5" />
        <div className="h-4 w-full animate-pulse rounded bg-ink/5 dark:bg-white/5" />
      </div>
    </div>
  );
}
