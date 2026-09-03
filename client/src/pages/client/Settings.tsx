import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card } from '@/components/ui/Primitives';
import { ThemeSelector } from '@/components/ui/ThemeToggle';

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  expiresAt: string;
}

export default function Settings() {
  const { logout } = useAuth();
  const { success, error: toastError } = useToast();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [changing, setChanging] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void api
      .get<{ sessions: SessionRow[] }>('/auth/sessions')
      .then((data) => setSessions(data.sessions))
      .catch(() => setSessions([]));
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get('newPassword') ?? '');

    if (next !== String(data.get('confirm') ?? '')) {
      setErrors({ confirm: 'The two passwords do not match.' });
      return;
    }

    setChanging(true);
    setErrors({});
    try {
      await api.post('/auth/change-password', {
        currentPassword: String(data.get('currentPassword') ?? ''),
        newPassword: next,
      });
      success('Password changed');
      form.reset();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        toastError(caught.message);
      }
    } finally {
      setChanging(false);
    }
  }

  const signOutEverywhere = async () => {
    try {
      await api.post('/auth/sessions/revoke-all');
      await logout();
    } catch {
      toastError('Could not sign out everywhere.');
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Appearance, security and active sessions." />

      <div className="space-y-6">
        <Card>
          <h2 className="font-display text-base font-semibold text-ink">Appearance</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Choose light, dark, or follow your device. Your choice is remembered on this browser.
          </p>
          <div className="mt-4">
            <ThemeSelector />
          </div>
        </Card>

        <Card>
          <h2 className="font-display text-base font-semibold text-ink">Change password</h2>
          <form onSubmit={changePassword} className="mt-4 max-w-md space-y-4">
            <Field label="Current password" required htmlFor="currentPassword" error={errors.currentPassword}>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Field
              label="New password"
              required
              htmlFor="newPassword"
              error={errors.newPassword}
              hint="At least 8 characters, with letters and numbers."
            >
              <Input id="newPassword" name="newPassword" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password" required htmlFor="confirm" error={errors.confirm}>
              <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
            </Field>
            <Button type="submit" loading={changing}>
              Update password
            </Button>
          </form>
        </Card>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink">Active sessions</h2>
              <p className="mt-1 text-sm text-ink-muted">
                Devices currently signed in to your account.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void signOutEverywhere()}>
              Sign out everywhere
            </Button>
          </div>

          {sessions.length === 0 ? (
            <p className="mt-4 text-sm text-ink-faint">No other sessions.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {sessions.map((session) => (
                <li key={session.id} className="py-3 text-sm">
                  <p className="truncate text-ink">{session.userAgent || 'Unknown device'}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    Signed in {formatDate(session.createdAt)} · expires {formatDate(session.expiresAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="font-display text-base font-semibold text-ink">Privacy</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Your conversation with the studio is private to you. Other clients cannot see your messages, files,
            projects or requests — and you cannot see theirs.
          </p>
        </Card>
      </div>
    </div>
  );
}
