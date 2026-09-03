import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { LinkButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icons';
import { PortfolioCard, PortfolioCardSkeleton } from '@/components/PortfolioCard';
import { formatMoney } from '@/lib/format';
import type { PortfolioProject, Service } from '@/lib/types';
import { useReveal } from '@/hooks/useReveal';

const PROCESS = [
  { step: '01', title: 'Brief', body: 'You describe the work — audience, tone, deadline, whatever references you have. No form-filling ritual, just the useful parts.' },
  { step: '02', title: 'Direction', body: 'I come back with two or three routes and the reasoning behind each, so you are choosing a strategy, not a picture.' },
  { step: '03', title: 'Refine', body: 'We narrow to one and sharpen it. Revisions happen in your dashboard, so nothing gets lost in an email thread.' },
  { step: '04', title: 'Handover', body: 'Final files in every format you need, plus the working sources and a short guide for your team.' },
];

export default function Home() {
  const { settings, sectionEnabled, hasFeature } = useSettings();
  const [featured, setFeatured] = useState<PortfolioProject[] | null>(null);
  const [services, setServices] = useState<Service[]>([]);

  useEffect(() => {
    void api
      .get<{ projects: PortfolioProject[] }>('/portfolio/featured')
      .then((data) => setFeatured(data.projects))
      .catch(() => setFeatured([]));
    void api
      .get<{ services: Service[] }>('/services')
      .then((data) => setServices(data.services.slice(0, 6)))
      .catch(() => setServices([]));
  }, []);

  return (
    <>
      {sectionEnabled('hero') && <Hero />}
      {sectionEnabled('stats') && <Stats />}
      {sectionEnabled('featured') && <Featured projects={featured} />}
      {sectionEnabled('services') && <ServicesPreview services={services} />}
      {sectionEnabled('process') && <Process />}
      {sectionEnabled('testimonials') && hasFeature('testimonials') && <Testimonials />}
      {sectionEnabled('cta') && <ClosingCta />}
    </>
  );

  function Hero() {
    return (
      <section className="relative overflow-hidden">
        {/* Slow-drifting gradient shapes. Motion is disabled for users who ask for reduced motion. */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute -left-32 -top-32 h-[520px] w-[520px] animate-drift rounded-full bg-accent/20 blur-[110px]" />
          <div className="absolute -right-24 top-24 h-[420px] w-[420px] animate-drift rounded-full bg-sky-400/15 blur-[100px] [animation-delay:-6s]" />
          <div className="absolute inset-0 grid-noise opacity-40" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-24">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised/70 px-3 py-1.5 text-xs font-medium text-ink-muted backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Taking new projects
            </span>

            <h1 className="mt-6 font-display text-[2.6rem] font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-[4.2rem]">
              {settings?.heroTitle ?? 'Creative design that makes your brand stand out.'}
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              {settings?.heroSubtitle}
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <LinkButton to="/portfolio" size="lg" icon={<Icon.grid className="h-[18px] w-[18px]" />}>
                {settings?.heroPrimaryCta ?? 'View My Work'}
              </LinkButton>
              <LinkButton to="/request" variant="outline" size="lg" icon={<Icon.sparkles className="h-[18px] w-[18px]" />}>
                {settings?.heroSecondaryCta ?? 'Start a Project'}
              </LinkButton>
            </div>

            <p className="mt-6 text-sm text-ink-faint">
              Already working with me?{' '}
              <Link to="/login" className="font-medium text-accent hover:underline">
                Sign in to your client studio
              </Link>
            </p>
          </div>

          <FloatingShowcase projects={featured ?? []} />
        </div>
      </section>
    );
  }

  function Stats() {
    const stats = settings?.stats ?? [];
    if (stats.length === 0) return null;
    return (
      <section className="border-y border-line bg-surface-sunken">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px overflow-hidden px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {stats.map((stat) => (
            <div key={stat.label} className="px-2 py-8 text-center sm:py-10">
              <p className="font-display text-3xl font-extrabold text-ink sm:text-4xl">{stat.value}</p>
              <p className="mt-1.5 text-xs font-medium uppercase tracking-wider text-ink-faint sm:text-sm sm:normal-case sm:tracking-normal">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>
    );
  }
}

function FloatingShowcase({ projects }: { projects: PortfolioProject[] }) {
  const cards = projects.slice(0, 3);

  return (
    <div className="relative mx-auto h-[340px] w-full max-w-md animate-fade-up sm:h-[440px] lg:h-[520px] lg:max-w-none [animation-delay:120ms]">
      {cards.length === 0 ? (
        <div className="absolute inset-6 animate-float rounded-3xl bg-gradient-to-br from-accent/25 via-accent/10 to-transparent" />
      ) : (
        cards.map((project, index) => {
          // A fan rather than a pile: staggered tops keep every card's label readable.
          const positions = [
            'left-0 top-[10%] w-[38%] rotate-[-7deg] z-10',
            'left-1/2 -translate-x-1/2 top-0 w-[40%] rotate-[1deg] z-30',
            'right-0 top-[14%] w-[38%] rotate-[7deg] z-20',
          ];
          return (
            <Link
              key={project.id}
              to={`/portfolio/${project.slug}`}
              className={`absolute animate-float overflow-hidden rounded-2xl border border-line bg-surface-raised shadow-lift transition-transform duration-500 hover:z-40 hover:scale-[1.04] ${positions[index]}`}
              style={{ animationDelay: `${index * 1.4}s` }}
            >
              <div className="aspect-[4/5] w-full">
                {project.thumbnailUrl ? (
                  <img
                    src={project.thumbnailUrl}
                    alt={project.title}
                    className="h-full w-full object-cover"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-accent/30 to-accent/5" />
                )}
              </div>
              <div className="border-t border-line px-3 py-2.5">
                <p className="truncate text-xs font-semibold text-ink">{project.title}</p>
                <p className="truncate text-[10px] text-ink-faint">{project.category?.name}</p>
              </div>
            </Link>
          );
        })
      )}
    </div>
  );
}

function Featured({ projects }: { projects: PortfolioProject[] | null }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Selected work</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
            Recent projects
          </h2>
        </div>
        <LinkButton to="/portfolio" variant="outline" icon={<Icon.arrowRight className="h-4 w-4" />}>
          See everything
        </LinkButton>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {projects === null
          ? Array.from({ length: 6 }, (_, index) => <PortfolioCardSkeleton key={index} />)
          : projects.map((project, index) => (
              <PortfolioCard key={project.id} project={project} index={index} className="animate-fade-up" />
            ))}
      </div>
    </section>
  );
}

function ServicesPreview({ services }: { services: Service[] }) {
  const ref = useReveal();
  if (services.length === 0) return null;

  return (
    <section ref={ref} className="border-y border-line bg-surface-sunken">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">What I do</p>
          <h2 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
            Design work, priced honestly.
          </h2>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service, index) => (
            <Link
              key={service.id}
              to="/services"
              className="group rounded-2xl border border-line bg-surface-raised p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-card animate-fade-up"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <h3 className="font-display text-base font-semibold text-ink">{service.name}</h3>
              {service.description && (
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-muted">{service.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-[13px]">
                <span className="font-medium text-accent">
                  {service.priceLabel ?? (service.priceFrom ? `From ${formatMoney(service.priceFrom)}` : 'Contact for pricing')}
                </span>
                {service.deliveryTime && <span className="text-ink-faint">{service.deliveryTime}</span>}
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-8">
          <LinkButton to="/services" variant="outline">
            All services & pricing
          </LinkButton>
        </div>
      </div>
    </section>
  );
}

function Process() {
  const ref = useReveal();
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">How we work</p>
        <h2 className="mt-3 font-display text-3xl font-bold text-ink sm:text-4xl">
          Four steps, no mystery.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          Every project runs through the same clear stages, and you can see exactly where yours is from your
          dashboard at any time.
        </p>
      </div>

      <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {PROCESS.map((item, index) => (
          <li
            key={item.step}
            className="relative animate-fade-up rounded-2xl border border-line bg-surface-raised p-6"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            <span className="font-display text-3xl font-extrabold text-accent/25">{item.step}</span>
            <h3 className="mt-3 font-display text-lg font-semibold text-ink">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{item.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Testimonials() {
  const ref = useReveal();
  const { settings } = useSettings();

  // Shown only when the designer enables the Testimonials feature. Quotes are
  // placeholders until real client reviews are collected.
  const quotes = [
    { quote: 'The identity landed on the first round and we have not changed a thing in two years.', name: 'Operations lead', org: 'Independent roastery' },
    { quote: 'Fast, specific and genuinely opinionated. Exactly what we needed.', name: 'Founder', org: 'Fintech startup' },
    { quote: 'The handover pack meant our team could keep building without going back for every asset.', name: 'Marketing manager', org: 'Retail brand' },
  ];

  return (
    <section ref={ref} className="border-y border-line bg-surface-sunken">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <h2 className="font-display text-3xl font-bold text-ink sm:text-4xl">What clients say</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {quotes.map((item, index) => (
            <figure
              key={item.quote}
              className="animate-fade-up rounded-2xl border border-line bg-surface-raised p-6"
              style={{ animationDelay: `${index * 70}ms` }}
            >
              <blockquote className="text-[15px] leading-relaxed text-ink">“{item.quote}”</blockquote>
              <figcaption className="mt-4 text-sm text-ink-faint">
                {item.name} · {item.org}
              </figcaption>
            </figure>
          ))}
        </div>
        <p className="mt-6 text-xs text-ink-faint">
          Testimonials shown on {settings?.brandName ?? 'this site'} are managed from the admin dashboard.
        </p>
      </div>
    </section>
  );
}

function ClosingCta() {
  const ref = useReveal();
  return (
    <section ref={ref} className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="relative overflow-hidden rounded-3xl border border-line bg-surface-raised p-8 text-center sm:p-14">
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
          <div className="absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 animate-drift rounded-full bg-accent/25 blur-[90px]" />
        </div>
        <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
          Have something that needs designing?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-ink-muted">
          Tell me what you are building. You will get a private workspace to share references, follow progress and
          approve the final files.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton to="/request" size="lg">
            Start a project
          </LinkButton>
          <LinkButton to="/contact" variant="outline" size="lg">
            Just say hello
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
