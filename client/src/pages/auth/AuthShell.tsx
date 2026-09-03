import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSettings } from '@/context/SettingsContext';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { settings } = useSettings();

  return (
    <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center px-4 py-12 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -left-40 top-0 h-[420px] w-[420px] animate-drift rounded-full bg-accent/15 blur-[110px]" />
      </div>

      <div className="grid w-full items-center gap-12 lg:grid-cols-2">
        <div className="hidden lg:block">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Client studio</p>
          <h2 className="mt-4 font-display text-4xl font-extrabold leading-tight text-ink">
            Your projects, files and conversation — in one private place.
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-ink-muted">
            {[
              'Follow every project through a clear five-stage timeline.',
              'Message the designer privately, with file attachments.',
              'Approve designs or request revisions in one click.',
              'Keep every deliverable in one downloadable place.',
            ].map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-line bg-surface-raised p-6 shadow-card sm:p-8">
            <Link to="/" className="mb-6 inline-flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent font-display text-sm font-bold text-white">
                {(settings?.logoText ?? 'AS').slice(0, 2)}
              </span>
              <span className="font-display text-[15px] font-bold text-ink">
                {settings?.brandName ?? 'Studio'}
              </span>
            </Link>

            <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
            <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>

            <div className="mt-6">{children}</div>
          </div>

          {footer && <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
