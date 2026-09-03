import { useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, Spinner } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Avatar, Card } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { User } from '@/lib/types';

export default function Profile() {
  const { user, setUser } = useAuth();
  const { success, error: toastError } = useToast();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const avatarRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setErrors({});
    try {
      const data = await api.put<{ user: User }>('/profile', {
        name: String(form.get('name') ?? ''),
        company: String(form.get('company') ?? ''),
        phone: String(form.get('phone') ?? ''),
        website: String(form.get('website') ?? ''),
        location: String(form.get('location') ?? ''),
        bio: String(form.get('bio') ?? ''),
      });
      setUser(data.user);
      success('Profile updated');
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        toastError(caught.message);
      }
    } finally {
      setSaving(false);
    }
  }

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await api.upload<{ user: User }>('/profile/avatar', form);
      setUser(data.user);
      success('Photo updated');
    } catch (caught) {
      toastError('Could not upload the photo', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <PageHeader title="Profile" description="How the studio sees you." />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit text-center">
          <div className="relative mx-auto w-fit">
            <Avatar name={user.name} src={user.avatarUrl} size="lg" />
            <button
              type="button"
              onClick={() => avatarRef.current?.click()}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 rounded-full border border-line bg-surface-raised p-2 text-ink-muted shadow-card transition hover:text-accent"
            >
              {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Icon.edit className="h-3.5 w-3.5" />}
            </button>
            <input
              ref={avatarRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(event) => {
                void uploadAvatar(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>

          <h2 className="mt-4 font-display text-lg font-semibold text-ink">{user.name}</h2>
          <p className="text-sm text-ink-muted">{user.email}</p>
          <p className="mt-3 text-xs text-ink-faint">Client since {formatDate(user.createdAt)}</p>
        </Card>

        <Card>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" htmlFor="name" error={errors.name}>
                <Input id="name" name="name" defaultValue={user.name} required maxLength={80} />
              </Field>
              <Field label="Email" htmlFor="email" hint="Contact the studio to change your email.">
                <Input id="email" value={user.email} disabled />
              </Field>
              <Field label="Company" htmlFor="company">
                <Input id="company" name="company" defaultValue={user.profile.company ?? ''} maxLength={120} />
              </Field>
              <Field label="Phone" htmlFor="phone">
                <Input id="phone" name="phone" defaultValue={user.profile.phone ?? ''} maxLength={40} />
              </Field>
              <Field label="Website" htmlFor="website">
                <Input id="website" name="website" defaultValue={user.profile.website ?? ''} maxLength={200} />
              </Field>
              <Field label="Location" htmlFor="location">
                <Input id="location" name="location" defaultValue={user.profile.location ?? ''} maxLength={120} />
              </Field>
            </div>

            <Field label="About your brand" htmlFor="bio" hint="Context that helps with every project you send.">
              <Textarea id="bio" name="bio" rows={4} defaultValue={user.profile.bio ?? ''} maxLength={1000} />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
