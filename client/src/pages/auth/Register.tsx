import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { AuthShell } from './AuthShell';

/** Simple strength read-out; the server enforces the real rules. */
function strengthOf(password: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^\w\s]/.test(password)) score += 1;

  if (score <= 2) return { score, label: 'Weak', tone: 'bg-rose-500' };
  if (score === 3) return { score, label: 'Fair', tone: 'bg-amber-500' };
  if (score === 4) return { score, label: 'Good', tone: 'bg-sky-500' };
  return { score, label: 'Strong', tone: 'bg-emerald-500' };
}

export default function Register() {
  const { register } = useAuth();
  const { settings } = useSettings();
  const { success } = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const strength = strengthOf(password);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const user = await register({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        password: String(form.get('password') ?? ''),
        company: String(form.get('company') ?? '') || undefined,
      });
      success(`Welcome, ${user.name.split(' ')[0]}`, 'Your client studio is ready.');
      navigate('/dashboard', { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.details);
      } else {
        setError('Could not create your account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (settings && !settings.allowRegistration) {
    return (
      <AuthShell
        title="Registration is closed"
        subtitle="The studio is not accepting new client accounts right now."
        footer={
          <Link to="/contact" className="font-medium text-accent hover:underline">
            Get in touch instead
          </Link>
        }
      >
        <p className="text-sm text-ink-muted">
          If you were invited to work with the studio, ask for an account to be created for you.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Track projects, share files and message the designer privately."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent hover:underline">
            Sign in
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

        <Field label="Full name" required htmlFor="name" error={fieldErrors.name}>
          <Input id="name" name="name" required autoComplete="name" placeholder="Ada Nwosu" invalid={!!fieldErrors.name} />
        </Field>

        <Field label="Email" required htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            invalid={!!fieldErrors.email}
          />
        </Field>

        <Field label="Company" htmlFor="company" hint="Optional">
          <Input id="company" name="company" autoComplete="organization" placeholder="Kola Coffee Roasters" />
        </Field>

        <Field
          label="Password"
          required
          htmlFor="password"
          error={fieldErrors.password}
          hint="At least 8 characters, with letters and numbers."
        >
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            invalid={!!fieldErrors.password}
          />
        </Field>

        {password && (
          <div className="flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/8 dark:bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-300 ${strength.tone}`}
                style={{ width: `${(strength.score / 5) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs text-ink-muted">{strength.label}</span>
          </div>
        )}

        <Button type="submit" full size="lg" loading={submitting}>
          Create account
        </Button>

        <p className="text-center text-xs text-ink-faint">
          Your conversation with the studio is private to you. Clients cannot see each other.
        </p>
      </form>
    </AuthShell>
  );
}
