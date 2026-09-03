import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { AuthShell } from './AuthShell';

export default function ForgotPassword() {
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    try {
      const response = await api.post<{ ok: true; devToken?: string }>('/auth/forgot-password', {
        email: String(form.get('email') ?? ''),
      });
      setDevToken(response.devToken ?? null);
      setSent(true);
    } catch {
      // The endpoint answers identically for known and unknown addresses.
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We will send you a link to choose a new one."
      footer={
        <Link to="/login" className="font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
            If an account exists for that address, a reset link is on its way.
          </div>

          {devToken && (
            /* Development convenience: no mail transport is wired up in this build. */
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-200">Development mode</p>
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                No mail service is configured, so the token is shown here:
              </p>
              <code className="mt-2 block break-all rounded-lg bg-surface-sunken px-2 py-1.5 text-[11px] text-ink">
                {devToken}
              </code>
              <Link
                to={`/reset-password?token=${devToken}`}
                className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
              >
                Continue to reset →
              </Link>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" required htmlFor="email">
            <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
          </Field>
          <Button type="submit" full size="lg" loading={submitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
