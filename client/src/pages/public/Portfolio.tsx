import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import { PortfolioCard, PortfolioCardSkeleton } from '@/components/PortfolioCard';
import type { Category, PortfolioProject } from '@/lib/types';

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  pages: number;
}

const SORTS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'popular', label: 'Most viewed' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'A – Z' },
];

export default function Portfolio() {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<PortfolioProject[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [search, setSearch] = useState(params.get('q') ?? '');

  const category = params.get('category') ?? '';
  const sort = params.get('sort') ?? 'recent';
  const page = Number.parseInt(params.get('page') ?? '1', 10) || 1;
  const query = params.get('q') ?? '';

  useEffect(() => {
    void api
      .get<{ categories: Category[] }>('/categories')
      .then((data) => setCategories(data.categories))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setProjects(null);

    void api
      .get<{ projects: PortfolioProject[]; pagination: Pagination }>('/portfolio', {
        category,
        sort,
        page,
        q: query,
        perPage: 12,
      })
      .then((data) => {
        if (cancelled) return;
        setProjects(data.projects);
        setPagination(data.pagination);
      })
      .catch(() => !cancelled && setProjects([]));

    return () => {
      cancelled = true;
    };
  }, [category, sort, page, query]);

  // Debounce the free-text filter so typing does not spam the API.
  useEffect(() => {
    const handle = setTimeout(() => {
      if (search === query) return;
      const next = new URLSearchParams(params);
      if (search) next.set('q', search);
      else next.delete('q');
      next.delete('page');
      setParams(next, { replace: true });
    }, 320);
    return () => clearTimeout(handle);
    // `params` is intentionally omitted: it changes on every URL update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const update = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      setParams(next);
      if (key === 'page') window.scrollTo({ top: 220, behavior: 'smooth' });
    },
    [params, setParams],
  );

  const activeCategory = categories.find((entry) => entry.slug === category);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Portfolio</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          {activeCategory ? activeCategory.name : 'Every project, in one place.'}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          {activeCategory?.description ??
            'Brand identities, campaign artwork, print, packaging and interface work. Filter by category or search for something specific.'}
        </p>
      </header>

      {/* Filters */}
      <div className="sticky top-16 z-20 -mx-4 mt-10 border-y border-line bg-surface/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-4 lg:top-[72px]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Icon.search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="pl-10"
            />
          </div>
          <div className="flex gap-3">
            <Select
              value={sort}
              onChange={(event) => update('sort', event.target.value)}
              aria-label="Sort projects"
              className="lg:w-44"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="scrollbar-thin -mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <CategoryChip label="All work" active={!category} onClick={() => update('category', '')} />
          {categories.map((entry) => (
            <CategoryChip
              key={entry.id}
              label={entry.name}
              count={entry.projectCount}
              active={category === entry.slug}
              onClick={() => update('category', entry.slug)}
            />
          ))}
        </div>
      </div>

      {/* Grid: 1 column on phones, 2 on tablets, 3 on desktop */}
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects === null ? (
          Array.from({ length: 6 }, (_, index) => <PortfolioCardSkeleton key={index} />)
        ) : projects.length === 0 ? (
          <EmptyState
            className="sm:col-span-2 lg:col-span-3"
            icon={<Icon.image className="h-5 w-5" />}
            title="No portfolio designs available."
            description={
              query || category
                ? 'Nothing matched those filters. Try clearing them to see the full portfolio.'
                : 'New work is added regularly — check back soon.'
            }
            action={
              (query || category) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams());
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          projects.map((project, index) => (
            <PortfolioCard key={project.id} project={project} index={index} className="animate-fade-up" />
          ))
        )}
      </div>

      {pagination && pagination.pages > 1 && (
        <nav className="mt-12 flex items-center justify-center gap-2" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => update('page', String(page - 1))}
            icon={<Icon.arrowLeft className="h-4 w-4" />}
          >
            Previous
          </Button>
          <span className="px-3 text-sm text-ink-muted">
            Page {pagination.page} of {pagination.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pagination.pages}
            onClick={() => update('page', String(page + 1))}
          >
            Next
            <Icon.arrowRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition',
        active
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-surface-raised text-ink-muted hover:border-accent/50 hover:text-ink',
      )}
    >
      {label}
      {count !== undefined && count > 0 && <span className="ml-1.5 opacity-60">{count}</span>}
    </button>
  );
}
