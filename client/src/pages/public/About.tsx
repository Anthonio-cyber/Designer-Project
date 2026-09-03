import { useSettings } from '@/context/SettingsContext';
import { LinkButton } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import { useReveal } from '@/hooks/useReveal';

export default function About() {
  const { settings, loading } = useSettings();
  const ref = useReveal();

  if (loading || !settings) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-16 sm:px-6">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { about, stats } = settings;

  return (
    <div className="pb-8">
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:gap-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">About</p>
            <h1 className="mt-3 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl">
              {about.headline}
            </h1>
            <div className="prose-studio mt-6 max-w-2xl text-base">
              {about.bio.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>

            <blockquote className="mt-8 border-l-2 border-accent pl-5 font-display text-lg font-medium leading-relaxed text-ink">
              “{about.philosophy}”
            </blockquote>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <LinkButton to="/request" size="lg">
                Work with me
              </LinkButton>
              <LinkButton to="/portfolio" variant="outline" size="lg">
                See the work
              </LinkButton>
            </div>
          </div>

          <div className="lg:pt-12">
            <div className="overflow-hidden rounded-3xl border border-line bg-surface-sunken">
              {about.photoUrl ? (
                <img
                  src={about.photoUrl}
                  alt={settings.brandName}
                  className="aspect-[4/5] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center bg-gradient-to-br from-accent/25 to-accent/5">
                  <span className="font-display text-6xl font-extrabold text-accent/40">
                    {settings.logoText.slice(0, 2)}
                  </span>
                </div>
              )}
            </div>
            <p className="mt-3 text-center text-sm text-ink-faint">
              {settings.brandName} · {settings.tagline}
            </p>
          </div>
        </div>
      </section>

      {stats.length > 0 && (
        <section className="border-y border-line bg-surface-sunken">
          <div className="mx-auto grid max-w-7xl grid-cols-2 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
            {stats.map((stat) => (
              <div key={stat.label} className="px-2 py-8 text-center sm:py-10">
                <p className="font-display text-3xl font-extrabold text-ink sm:text-4xl">{stat.value}</p>
                <p className="mt-1.5 text-sm text-ink-faint">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section ref={ref} className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="space-y-10">
            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Icon.sparkles className="h-5 w-5 text-accent" />
                Skills
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {about.skills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-xl border border-line bg-surface-raised px-3 py-1.5 text-sm text-ink-muted"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                <Icon.layers className="h-5 w-5 text-accent" />
                Tools & software
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {about.tools.map((tool) => (
                  <li
                    key={tool}
                    className="rounded-xl bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent"
                  >
                    {tool}
                  </li>
                ))}
              </ul>
            </div>

            {about.achievements.length > 0 && (
              <div>
                <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
                  <Icon.shield className="h-5 w-5 text-accent" />
                  Achievements
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {about.achievements.map((achievement) => (
                    <li key={achievement} className="flex gap-3 text-sm text-ink-muted">
                      <Icon.check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      {achievement}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
              <Icon.briefcase className="h-5 w-5 text-accent" />
              Experience
            </h2>
            <ol className="mt-6 space-y-6 border-l border-line pl-6">
              {about.experience.map((entry) => (
                <li key={`${entry.role}-${entry.org}`} className="relative">
                  <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent" />
                  <p className="font-display text-base font-semibold text-ink">{entry.role}</p>
                  <p className="text-sm text-accent">{entry.org}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">{entry.period}</p>
                  {entry.detail && <p className="mt-2 text-sm text-ink-muted">{entry.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}
