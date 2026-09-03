import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { Button, LinkButton } from '@/components/ui/Button';
import { Badge, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import { PortfolioCard } from '@/components/PortfolioCard';
import { useAuth } from '@/context/AuthContext';
import type { PortfolioProject } from '@/lib/types';

export default function ProjectDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState<PortfolioProject | null>(null);
  const [related, setRelated] = useState<PortfolioProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setProject(null);
    setError(null);

    void api
      .get<{ project: PortfolioProject; related: PortfolioProject[] }>(`/portfolio/${slug}`)
      .then((data) => {
        if (cancelled) return;
        setProject(data.project);
        setRelated(data.related);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'That project could not be loaded.');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setLightbox(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox]);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="font-display text-3xl font-bold text-ink">Project not found</h1>
        <p className="mt-3 text-ink-muted">{error}</p>
        <LinkButton to="/portfolio" className="mt-8">
          Back to the portfolio
        </LinkButton>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-12 sm:px-6 lg:px-8">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-14 w-3/4" />
        <Skeleton className="aspect-[16/10] w-full" />
      </div>
    );
  }

  const requestHref = `/request?inspiration=${project.id}&type=${encodeURIComponent(project.category?.name ?? '')}`;

  return (
    <article className="pb-8">
      <div className="mx-auto max-w-5xl px-4 pt-8 sm:px-6 lg:px-8">
        <Link
          to="/portfolio"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted transition hover:text-accent"
        >
          <Icon.arrowLeft className="h-4 w-4" />
          All work
        </Link>

        <header className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            {project.category && <Badge tone="accent">{project.category.name}</Badge>}
            <span className="text-sm text-ink-faint">
              {formatDate(project.projectDate ?? project.createdAt)}
            </span>
            {project.status === 'draft' && <Badge tone="warning">Draft — visible to admins only</Badge>}
          </div>

          <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            {project.title}
          </h1>

          {project.summary && (
            <p className="mt-5 max-w-3xl text-lg leading-relaxed text-ink-muted">{project.summary}</p>
          )}
        </header>
      </div>

      {/* Hero artwork */}
      {project.mainImageUrl && (
        <div className="mx-auto mt-10 max-w-6xl px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setLightbox(project.mainImageUrl)}
            className="group block w-full overflow-hidden rounded-2xl border border-line bg-surface-sunken"
            aria-label="View artwork full size"
          >
            <img
              src={project.mainImageUrl}
              alt={project.title}
              className="h-auto w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              loading="eager"
              decoding="async"
            />
          </button>
        </div>
      )}

      <div className="mx-auto mt-12 grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_300px] lg:gap-14 lg:px-8">
        <div className="min-w-0">
          {project.description && (
            <section>
              <h2 className="font-display text-xl font-semibold text-ink">About this project</h2>
              <div className="prose-studio mt-4">
                {project.description.split('\n\n').map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            </section>
          )}

          {project.designerNotes && (
            <section className="mt-10 rounded-2xl border border-line bg-surface-sunken p-6">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                <Icon.edit className="h-4 w-4 text-accent" />
                Designer’s notes
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{project.designerNotes}</p>
            </section>
          )}

          {project.gallery.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-xl font-semibold text-ink">Gallery & mockups</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {project.gallery.map((image, index) => (
                  <button
                    key={image}
                    type="button"
                    onClick={() => setLightbox(image)}
                    className="group overflow-hidden rounded-xl border border-line bg-surface-sunken"
                    aria-label={`View image ${index + 1} full size`}
                  >
                    <img
                      src={image}
                      alt={`${project.title} — view ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[4/3] w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Sidebar */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-surface-raised p-5">
            <dl className="space-y-4 text-sm">
              {project.clientName && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">Client</dt>
                  <dd className="mt-1 text-ink">{project.clientName}</dd>
                </div>
              )}
              {project.category && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">Category</dt>
                  <dd className="mt-1">
                    <Link
                      to={`/portfolio?category=${project.category.slug}`}
                      className="text-accent hover:underline"
                    >
                      {project.category.name}
                    </Link>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">Date</dt>
                <dd className="mt-1 text-ink">{formatDate(project.projectDate ?? project.createdAt)}</dd>
              </div>
              {project.tools.length > 0 && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wider text-ink-faint">Tools used</dt>
                  <dd className="mt-2 flex flex-wrap gap-1.5">
                    {project.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-lg bg-ink/6 px-2 py-1 text-xs text-ink-muted dark:bg-white/8"
                      >
                        {tool}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            <div className="mt-6 space-y-2.5 border-t border-line pt-5">
              <Button full onClick={() => navigate(requestHref)} icon={<Icon.sparkles className="h-4 w-4" />}>
                Request Similar Design
              </Button>
              <LinkButton
                to={user ? (user.role === 'admin' ? '/admin/messages' : '/dashboard/messages') : '/register'}
                variant="outline"
                full
                icon={<Icon.chat className="h-4 w-4" />}
              >
                Message Designer
              </LinkButton>
              <p className="pt-1 text-center text-xs text-ink-faint">
                {project.views.toLocaleString()} views
              </p>
            </div>
          </div>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mx-auto mt-20 max-w-7xl border-t border-line px-4 pt-14 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl font-bold text-ink">More like this</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((entry, index) => (
              <PortfolioCard key={entry.id} project={entry} index={index} />
            ))}
          </div>
        </section>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/92 p-4 animate-fade-in"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full size artwork"
        >
          <img
            src={lightbox}
            alt={project.title}
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setLightbox(null)}
            aria-label="Close"
            className="absolute right-4 top-4 rounded-xl bg-white/10 p-2.5 text-white backdrop-blur transition hover:bg-white/20"
          >
            <Icon.x className="h-5 w-5" />
          </button>
        </div>
      )}
    </article>
  );
}
