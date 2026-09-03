import { Link } from 'react-router-dom';
import { useSettings } from '@/context/SettingsContext';

const COLUMNS = [
  {
    title: 'Studio',
    links: [
      { to: '/portfolio', label: 'Portfolio' },
      { to: '/services', label: 'Services' },
      { to: '/about', label: 'About' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Work with me',
    links: [
      { to: '/request', label: 'Start a project' },
      { to: '/login', label: 'Client login' },
      { to: '/register', label: 'Create an account' },
    ],
  },
];

export function Footer() {
  const { settings, hasFeature } = useSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line bg-surface-sunken">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr_1.2fr]">
          <div>
            <p className="font-display text-lg font-bold text-ink">{settings?.brandName ?? 'Studio'}</p>
            <p className="mt-2 max-w-xs text-sm text-ink-muted">{settings?.tagline}</p>
            {settings?.socialLinks?.length ? (
              <ul className="mt-5 flex flex-wrap gap-2">
                {settings.socialLinks.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-accent/50 hover:text-accent"
                    >
                      {social.label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">
                {column.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-sm text-ink-muted transition hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="text-[13px] font-semibold uppercase tracking-wider text-ink-faint">Get in touch</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-ink-muted">
              {settings?.contactEmail && (
                <li>
                  <a href={`mailto:${settings.contactEmail}`} className="transition hover:text-accent">
                    {settings.contactEmail}
                  </a>
                </li>
              )}
              {settings?.contactPhone && <li>{settings.contactPhone}</li>}
              {settings?.location && <li>{settings.location}</li>}
            </ul>

            {hasFeature('newsletter') && (
              <form
                className="mt-5 flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  event.currentTarget.reset();
                }}
              >
                <input
                  type="email"
                  required
                  placeholder="you@email.com"
                  aria-label="Email address"
                  className="input-base h-10 py-2 text-[13px]"
                />
                <button
                  type="submit"
                  className="h-10 shrink-0 rounded-xl bg-accent px-3.5 text-[13px] font-medium text-white transition hover:brightness-110"
                >
                  Join
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-line pt-6 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {settings?.brandName ?? 'Studio'}. All rights reserved.
          </p>
          <p>Built as a portfolio, client workspace and studio admin in one.</p>
        </div>
      </div>
    </footer>
  );
}
