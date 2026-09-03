import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { AuthShell } from './AuthShell';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const token = params.get('token') ?? '';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');

    if (password !== String(form.get('confirm') ?? '')) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.post('/auth/reset-password', { token, password });
      success('Password updated', 'You can sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reset your password.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Reset link missing" subtitle="This page needs a valid reset token.">
        <p className="text-sm text-ink-muted">
          Request a new link from the{' '}
          <Link to="/forgot-password" className="font-medium text-accent hover:underline">
            forgot password
          </Link>{' '}
          page.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Signing in everywhere else will be required again.">
      <form onSubmit={onSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}
        <Field label="New password" required htmlFor="password" hint="At least 8 characters, letters and numbers.">
          <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm password" required htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" full size="lg" loading={submitting}>
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}
