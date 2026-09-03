import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { AuthShell } from './AuthShell';

export default function Login() {
  const { login } = useAuth();
  const { success } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const user = await login(String(form.get('email') ?? ''), String(form.get('password') ?? ''));
      success(`Welcome back, ${user.name.split(' ')[0]}`);
      // Return the visitor to wherever they were headed before the guard stopped them.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? (user.role === 'admin' ? '/admin' : '/dashboard'), { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.details);
      } else {
        setError('Could not sign in. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your client studio."
      footer={
        <>
          No account yet?{' '}
          <Link to="/register" className="font-medium text-accent hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/8 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        <Field label="Email" required htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@company.com"
            invalid={!!fieldErrors.email}
          />
        </Field>

        <Field label="Password" required htmlFor="password" error={fieldErrors.password}>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
            invalid={!!fieldErrors.password}
          />
        </Field>

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-accent hover:underline">
            Forgot your password?
          </Link>
        </div>

        <Button type="submit" full size="lg" loading={submitting}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
