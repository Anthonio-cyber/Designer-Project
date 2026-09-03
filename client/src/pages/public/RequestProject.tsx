import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Button, LinkButton } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icons';
import { FileDropzone } from '@/components/FileDropzone';
import type { AttachedFile, Service } from '@/lib/types';

const BUDGETS = [
  'Under $250',
  '$250 – $500',
  '$500 – $1,000',
  '$1,000 – $2,500',
  '$2,500 – $5,000',
  '$5,000+',
  'Not sure yet',
];

const STYLES = [
  'Minimal & clean',
  'Bold & loud',
  'Warm & editorial',
  'Playful & illustrative',
  'Luxury & refined',
  'Technical & precise',
  'Open to suggestions',
];

export default function RequestProject() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [services, setServices] = useState<Service[]>([]);
  const [references, setReferences] = useState<AttachedFile[]>([]);
  const [styleExamples, setStyleExamples] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const inspirationId = params.get('inspiration');
  const presetService = params.get('service') ?? '';
  const presetType = params.get('type') ?? '';

  useEffect(() => {
    void api
      .get<{ services: Service[] }>('/services')
      .then((data) => setServices(data.services))
      .catch(() => setServices([]));
  }, []);

  const uploadTo = async (target: 'references' | 'styles', incoming: File[]) => {
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of incoming) form.append('files', file);
      const data = await api.upload<{ files: AttachedFile[] }>('/requests/references', form);
      const setter = target === 'references' ? setReferences : setStyleExamples;
      setter((current) => [...current, ...data.files]);
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});

    const payload = {
      name: String(form.get('name') ?? ''),
      email: String(form.get('email') ?? ''),
      projectType: String(form.get('projectType') ?? '') || undefined,
      serviceId: String(form.get('serviceId') ?? '') || null,
      budgetRange: String(form.get('budgetRange') ?? '') || undefined,
      deadline: String(form.get('deadline') ?? '') || undefined,
      preferredStyle: String(form.get('preferredStyle') ?? '') || undefined,
      brandName: String(form.get('brandName') ?? '') || undefined,
      colors: String(form.get('colors') ?? '') || undefined,
      dimensions: String(form.get('dimensions') ?? '') || undefined,
      targetAudience: String(form.get('targetAudience') ?? '') || undefined,
      description: String(form.get('description') ?? ''),
      styleExampleNote: String(form.get('styleExampleNote') ?? '') || undefined,
      referenceFileIds: [...references, ...styleExamples].map((file) => file.id),
      inspirationProjectId: inspirationId ?? null,
    };

    try {
      await api.post('/requests', payload);
      setSubmitted(true);
      success('Request sent', 'Your project request has been sent successfully.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        toastError(caught.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <Icon.check className="h-8 w-8" />
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-ink">
          Your project request has been sent successfully.
        </h1>
        <p className="mt-4 text-ink-muted">
          The studio has it and will come back to you within two working days.
          {user
            ? ' You can follow it from your dashboard.'
            : ' Create an account to track progress, share files and message the designer privately.'}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          {user ? (
            <LinkButton to="/dashboard/requests" size="lg">
              View my requests
            </LinkButton>
          ) : (
            <LinkButton to="/register" size="lg">
              Create a client account
            </LinkButton>
          )}
          <LinkButton to="/portfolio" variant="outline" size="lg">
            Keep browsing work
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:py-16">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Start a project</p>
        <h1 className="mt-3 font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
          Describe what you want designed.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-ink-muted">
          The more you tell me here, the faster you get a real quote instead of a range. Everything you send is
          private — only the studio sees it.
        </p>
        {!user && (
          <p className="mt-4 text-sm text-ink-faint">
            Already a client?{' '}
            <Link to="/login" className="font-medium text-accent hover:underline">
              Sign in first
            </Link>{' '}
            so this request lands in your dashboard.
          </p>
        )}
      </header>

      <form onSubmit={onSubmit} className="mt-10 space-y-8">
        <fieldset className="rounded-2xl border border-line bg-surface-raised p-6 sm:p-8">
          <legend className="px-2 font-display text-sm font-semibold uppercase tracking-wider text-accent">
            About you
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Your name" required htmlFor="name" error={errors.name}>
              <Input id="name" name="name" required defaultValue={user?.name ?? ''} maxLength={80} invalid={!!errors.name} />
            </Field>
            <Field label="Email" required htmlFor="email" error={errors.email}>
              <Input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={user?.email ?? ''}
                invalid={!!errors.email}
              />
            </Field>
            <Field label="Brand or company name" htmlFor="brandName" className="sm:col-span-2">
              <Input
                id="brandName"
                name="brandName"
                defaultValue={user?.profile.company ?? ''}
                placeholder="Kola Coffee Roasters"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-surface-raised p-6 sm:p-8">
          <legend className="px-2 font-display text-sm font-semibold uppercase tracking-wider text-accent">
            The project
          </legend>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Project type" htmlFor="projectType">
              <Input
                id="projectType"
                name="projectType"
                defaultValue={presetType}
                placeholder="Logo, packaging, social campaign…"
              />
            </Field>
            <Field label="Closest service" htmlFor="serviceId" hint="Optional — helps me quote faster.">
              <Select id="serviceId" name="serviceId" defaultValue={presetService}>
                <option value="">Not sure / something else</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Budget range" htmlFor="budgetRange">
              <Select id="budgetRange" name="budgetRange" defaultValue="">
                <option value="">Select a range</option>
                {BUDGETS.map((budget) => (
                  <option key={budget} value={budget}>
                    {budget}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline" htmlFor="deadline" hint="A date or a rough window is both fine.">
              <Input id="deadline" name="deadline" placeholder="End of March, or 3 weeks" />
            </Field>
            <Field label="Preferred style" htmlFor="preferredStyle">
              <Select id="preferredStyle" name="preferredStyle" defaultValue="">
                <option value="">Select a direction</option>
                {STYLES.map((style) => (
                  <option key={style} value={style}>
                    {style}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Colours" htmlFor="colors" hint="Brand colours, or ones to avoid.">
              <Input id="colors" name="colors" placeholder="Deep green, cream, one warm accent" />
            </Field>
            <Field label="Design dimensions" htmlFor="dimensions" hint="Sizes, formats or print specs.">
              <Input id="dimensions" name="dimensions" placeholder="A2 poster, 1080×1350 for social" />
            </Field>
            <Field label="Target audience" htmlFor="targetAudience">
              <Input id="targetAudience" name="targetAudience" placeholder="Home brewers, 25–45, specialty grocers" />
            </Field>
          </div>

          <Field
            label="Describe your design"
            required
            htmlFor="description"
            className="mt-5"
            error={errors.description}
            hint="What is it for, what has to be in it, and what would make it a success?"
          >
            <Textarea
              id="description"
              name="description"
              required
              rows={8}
              minLength={20}
              maxLength={6000}
              placeholder="We need the retail bags redrawn across three roast levels. The roast level is impossible to find on shelf right now. Keep the existing mark, fix everything else…"
              invalid={!!errors.description}
            />
          </Field>
        </fieldset>

        <fieldset className="rounded-2xl border border-line bg-surface-raised p-6 sm:p-8">
          <legend className="px-2 font-display text-sm font-semibold uppercase tracking-wider text-accent">
            References
          </legend>

          <p className="text-sm text-ink-muted">
            Upload anything that helps: existing assets, brand guidelines, photos, a sketch on a napkin.
          </p>
          <FileDropzone
            className="mt-4"
            files={references}
            uploading={uploading}
            onAdd={(incoming) => uploadTo('references', incoming)}
            onRemove={(id) => setReferences((current) => current.filter((file) => file.id !== id))}
            label="Add reference files"
          />

          <div className="mt-8 border-t border-line pt-6">
            <h3 className="font-display text-base font-semibold text-ink">
              Do you have an example of the style you want?
            </h3>
            <Field className="mt-3" htmlFor="styleExampleNote">
              <Textarea
                id="styleExampleNote"
                name="styleExampleNote"
                rows={3}
                maxLength={1000}
                placeholder="Links or a description of work you like — and what specifically you like about it."
              />
            </Field>
            <FileDropzone
              className="mt-4"
              files={styleExamples}
              uploading={uploading}
              onAdd={(incoming) => uploadTo('styles', incoming)}
              onRemove={(id) => setStyleExamples((current) => current.filter((file) => file.id !== id))}
              label="Add style examples"
              hint="Screenshots or images of the look you are after"
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-ink-faint sm:max-w-sm">
            Your request is sent privately to the studio. Nothing you upload is published anywhere.
          </p>
          <Button type="submit" size="lg" loading={submitting} className="sm:w-auto" full>
            Send project request
          </Button>
        </div>
      </form>
    </div>
  );
}
