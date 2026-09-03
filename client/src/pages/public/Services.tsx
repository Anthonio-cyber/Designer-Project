import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import { LinkButton } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import { useReveal } from '@/hooks/useReveal';
import type { Service } from '@/lib/types';

export default function Services() {
  const [services, setServices] = useState<Service[] | null>(null);
  const ref = useReveal();

  useEffect(() => {
    void api
      .get<{ services: Service[] }>('/services')
      .then((data) => setServices(data.services))
      .catch(() => setServices([]));
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Services</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          What I can design for you.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          Prices below are starting points for a typical scope. Send a brief and you will get a fixed quote before
          any work begins — no hourly surprises.
        </p>
      </header>

      <div ref={ref} className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {services === null ? (
          Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-64" />)
        ) : services.length === 0 ? (
          <EmptyState
            className="md:col-span-2 lg:col-span-3"
            title="No services listed yet."
            description="The studio has not published its service list. Send a message and describe what you need."
            action={<LinkButton to="/contact">Get in touch</LinkButton>}
          />
        ) : (
          services.map((service, index) => (
            <article
              key={service.id}
              id={service.slug}
              className="flex animate-fade-up scroll-mt-28 flex-col rounded-2xl border border-line bg-surface-raised p-6 transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-card"
              style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Icon.sparkles className="h-5 w-5" />
              </span>

              <h2 className="font-display text-lg font-semibold text-ink">{service.name}</h2>
              {service.description && (
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-ink-muted">{service.description}</p>
              )}

              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-ink-faint">Starting at</dt>
                  <dd className="font-semibold text-ink">
                    {service.priceLabel ?? formatMoney(service.priceFrom)}
                  </dd>
                </div>
                {service.deliveryTime && (
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-faint">Typical delivery</dt>
                    <dd className="text-ink">{service.deliveryTime}</dd>
                  </div>
                )}
              </dl>

              <LinkButton
                to={`/request?service=${service.id}&type=${encodeURIComponent(service.name)}`}
                variant="outline"
                full
                className="mt-5"
              >
                Request this service
              </LinkButton>
            </article>
          ))
        )}
      </div>

      <section className="mt-16 rounded-3xl border border-line bg-surface-sunken p-8 text-center sm:p-12">
        <h2 className="font-display text-2xl font-bold text-ink sm:text-3xl">Not sure which one you need?</h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-muted">
          Describe the problem rather than the deliverable. I will tell you what the work actually needs — even if
          that turns out to be less than you expected.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton to="/request" size="lg">
            Describe your project
          </LinkButton>
          <Link
            to="/portfolio"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-ink-muted transition hover:text-accent"
          >
            Browse past work
            <Icon.arrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
