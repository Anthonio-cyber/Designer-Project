import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icons';

export default function Contact() {
  const { settings } = useSettings();
  const { success } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});

    try {
      // The public contact form goes through the same request pipeline as a full
      // brief. It never touches private client conversations.
      await api.post('/requests', {
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        projectType: 'General enquiry',
        description: String(form.get('message') ?? ''),
      });
      setSent(true);
      success('Message sent', 'The studio will reply by email.');
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.details);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Contact</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          Let’s talk about your project.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          For a full design brief with references and files, use the project request form — it gives me everything
          I need to quote properly. For anything else, this form is fine.
        </p>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
        <div className="order-2 lg:order-1">
          {sent ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/8 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Icon.check className="h-6 w-6" />
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold text-ink">Your message has been sent.</h2>
              <p className="mt-2 text-sm text-ink-muted">
                Expect a reply within two working days. If it is urgent, email{' '}
                <a href={`mailto:${settings?.contactEmail}`} className="text-accent hover:underline">
                  {settings?.contactEmail}
                </a>
                .
              </p>
              <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>
                Send another message
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-line bg-surface-raised p-6 sm:p-8">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Your name" required htmlFor="name" error={errors.name}>
                  <Input id="name" name="name" required maxLength={80} placeholder="Ada Nwosu" invalid={!!errors.name} />
                </Field>
                <Field label="Email" required htmlFor="email" error={errors.email}>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    placeholder="you@company.com"
                    invalid={!!errors.email}
                  />
                </Field>
              </div>

              <Field
                label="Message"
                required
                htmlFor="message"
                error={errors.description}
                hint="A sentence or two about what you need is plenty to start."
              >
                <Textarea
                  id="message"
                  name="message"
                  required
                  rows={6}
                  minLength={20}
                  placeholder="Tell me a little about the project…"
                  invalid={!!errors.description}
                />
              </Field>

              <Button type="submit" loading={submitting} size="lg" full>
                Send message
              </Button>

              <p className="text-center text-xs text-ink-faint">
                This form emails the studio. It does not create an account or open a client conversation.
              </p>
            </form>
          )}
        </div>

        <aside className="order-1 space-y-4 lg:order-2">
          <div className="rounded-2xl border border-line bg-surface-raised p-6">
            <h2 className="font-display text-base font-semibold text-ink">Direct</h2>
            <ul className="mt-4 space-y-4 text-sm">
              {settings?.contactEmail && (
                <li className="flex gap-3">
                  <Icon.inbox className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <a href={`mailto:${settings.contactEmail}`} className="text-ink transition hover:text-accent">
                    {settings.contactEmail}
                  </a>
                </li>
              )}
              {settings?.contactPhone && (
                <li className="flex gap-3">
                  <Icon.chat className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-ink">{settings.contactPhone}</span>
                </li>
              )}
              {settings?.location && (
                <li className="flex gap-3">
                  <Icon.home className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span className="text-ink-muted">{settings.location}</span>
                </li>
              )}
            </ul>
          </div>

          {settings?.socialLinks?.length ? (
            <div className="rounded-2xl border border-line bg-surface-raised p-6">
              <h2 className="font-display text-base font-semibold text-ink">Elsewhere</h2>
              <ul className="mt-4 space-y-2">
                {settings.socialLinks.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-ink-muted transition hover:bg-ink/5 hover:text-accent dark:hover:bg-white/5"
                    >
                      {social.label}
                      <Icon.arrowRight className="h-4 w-4 opacity-50" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-2xl border border-accent/30 bg-accent/6 p-6">
            <h2 className="font-display text-base font-semibold text-ink">Ready with a brief?</h2>
            <p className="mt-2 text-sm text-ink-muted">
              The project request form captures budget, deadline, style and reference files in one go.
            </p>
            <LinkButton to="/request" full className="mt-4">
              Start a project
            </LinkButton>
            <p className="mt-3 text-center text-xs text-ink-faint">
              Existing client?{' '}
              <Link to="/login" className="text-accent hover:underline">
                Sign in to message privately
              </Link>
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
