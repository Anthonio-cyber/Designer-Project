import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { useSettings } from '@/context/SettingsContext';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { Feature } from '@/lib/types';

interface VersionRow {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  changeNote: string | null;
  createdBy: string;
  createdAt: string;
}

export default function FeatureManager() {
  const { success, error: toastError } = useToast();
  const { reload: reloadSettings } = useSettings();
  const [features, setFeatures] = useState<Feature[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [configuring, setConfiguring] = useState<Feature | null>(null);
  const [history, setHistory] = useState<Feature | null>(null);
  const [removing, setRemoving] = useState<Feature | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ features: Feature[] }>('/features');
      setFeatures(data.features);
    } catch {
      setFeatures([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (feature: Feature) => {
    const next = feature.status === 'enabled' ? 'disabled' : 'enabled';
    try {
      await api.post(`/features/${feature.key}/toggle`, { status: next });
      success(`${feature.name} ${next}`);
      await load();
      await reloadSettings();
    } catch (caught) {
      toastError('Could not change the feature', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/features/${removing.key}`);
      success('Feature removed');
      setRemoving(null);
      await load();
    } catch (caught) {
      toastError('Could not remove', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const grouped = (features ?? []).reduce<Record<string, Feature[]>>((accumulator, feature) => {
    (accumulator[feature.category] ??= []).push(feature);
    return accumulator;
  }, {});

  return (
    <div>
      <PageHeader
        title="Feature Manager"
        description="Turn parts of the platform on and off. Every change is versioned, so you can always go back."
        actions={
          <Button onClick={() => setCreating(true)} icon={<Icon.plus className="h-4 w-4" />}>
            New feature
          </Button>
        }
      />

      {features === null ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : features.length === 0 ? (
        <EmptyState
          icon={<Icon.toggle className="h-5 w-5" />}
          title="No features registered."
          description="Create one here, or ask Designer’s AI to propose one."
        />
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, entries]) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-faint">{category}</h2>
              <Card className="p-0">
                <ul className="divide-y divide-line">
                  {entries.map((feature) => (
                    <li key={feature.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                      <button
                        type="button"
                        onClick={() => void toggle(feature)}
                        role="switch"
                        aria-checked={feature.status === 'enabled'}
                        aria-label={`${feature.status === 'enabled' ? 'Disable' : 'Enable'} ${feature.name}`}
                        className={cn(
                          'relative h-6 w-11 shrink-0 rounded-full transition',
                          feature.status === 'enabled' ? 'bg-accent' : 'bg-ink/15 dark:bg-white/20',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all',
                            feature.status === 'enabled' ? 'left-[22px]' : 'left-0.5',
                          )}
                        />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-display text-sm font-semibold text-ink">{feature.name}</h3>
                          {feature.isCore && <Badge tone="neutral">core</Badge>}
                          <Badge tone={feature.status === 'enabled' ? 'success' : 'neutral'}>{feature.status}</Badge>
                          <span className="text-[11px] text-ink-faint">v{feature.version}</span>
                        </div>
                        {feature.description && (
                          <p className="mt-1 text-sm text-ink-muted">{feature.description}</p>
                        )}
                        <p className="mt-1 text-[11px] text-ink-faint">
                          Added {formatDate(feature.createdAt)} by {feature.createdBy}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setConfiguring(feature)}>
                          Configure
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setHistory(feature)} title="Version history">
                          <Icon.clock className="h-4 w-4" />
                        </Button>
                        {!feature.isCore && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-500 hover:bg-rose-500/10"
                            onClick={() => setRemoving(feature)}
                            aria-label={`Remove ${feature.name}`}
                          >
                            <Icon.trash className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}

      <CreateFeatureModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          success('Feature created', 'It starts disabled — switch it on when you are ready.');
          void load();
        }}
      />

      <ConfigureModal
        feature={configuring}
        onClose={() => setConfiguring(null)}
        onSaved={() => {
          setConfiguring(null);
          success('Feature updated');
          void load();
        }}
      />

      <HistoryModal
        feature={history}
        onClose={() => setHistory(null)}
        onRestored={() => {
          setHistory(null);
          success('Version restored');
          void load();
        }}
      />

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove this feature?"
        description={removing?.name}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Remove
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          The feature is removed from the registry. A version snapshot is kept in the change log, so it can be
          recreated later.
        </p>
      </Modal>
    </div>
  );
}

function CreateFeatureModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});
    try {
      await api.post('/features', {
        name: String(form.get('name') ?? ''),
        key: String(form.get('key') ?? '') || undefined,
        description: String(form.get('description') ?? '') || undefined,
        category: String(form.get('category') ?? 'website'),
      });
      onCreated();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        toastError(caught.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New feature" description="Register a feature you can switch on later.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Name" required htmlFor="feature-name" error={errors.name}>
          <Input id="feature-name" name="name" required maxLength={80} placeholder="Testimonials" />
        </Field>
        <Field label="Key" htmlFor="feature-key" hint="Leave blank to generate from the name.">
          <Input id="feature-key" name="key" maxLength={60} placeholder="testimonials" />
        </Field>
        <Field label="Description" htmlFor="feature-description">
          <Textarea id="feature-description" name="description" rows={3} maxLength={600} />
        </Field>
        <Field label="Category" htmlFor="feature-category">
          <Select id="feature-category" name="category" defaultValue="website">
            <option value="website">Website</option>
            <option value="clients">Clients</option>
            <option value="admin">Admin</option>
            <option value="marketing">Marketing</option>
            <option value="general">General</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            Create feature
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConfigureModal({
  feature,
  onClose,
  onSaved,
}: {
  feature: Feature | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { error: toastError } = useToast();
  const [config, setConfig] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (feature) setConfig(JSON.stringify(feature.config ?? {}, null, 2));
  }, [feature]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!feature) return;
    const form = new FormData(event.currentTarget);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(config || '{}') as Record<string, unknown>;
    } catch {
      setJsonError('That is not valid JSON.');
      return;
    }

    setSubmitting(true);
    setJsonError(null);
    try {
      await api.put(`/features/${feature.key}`, {
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        config: parsed,
        changeNote: String(form.get('changeNote') ?? '') || undefined,
      });
      onSaved();
    } catch (caught) {
      toastError('Could not save', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!feature} onClose={onClose} title="Configure feature" description={feature?.key}>
      {feature && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="config-name">
            <Input id="config-name" name="name" defaultValue={feature.name} maxLength={80} />
          </Field>
          <Field label="Description" htmlFor="config-description">
            <Textarea id="config-description" name="description" rows={3} defaultValue={feature.description ?? ''} />
          </Field>
          <Field
            label="Configuration (JSON)"
            htmlFor="config-json"
            error={jsonError ?? undefined}
            hint="Feature-specific settings. Leave as {} if the feature needs none."
          >
            <Textarea
              id="config-json"
              rows={7}
              value={config}
              onChange={(event) => setConfig(event.target.value)}
              className="font-mono text-xs"
              invalid={!!jsonError}
            />
          </Field>
          <Field label="Change note" htmlFor="config-note" hint="Shown in the version history.">
            <Input id="config-note" name="changeNote" maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save changes
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function HistoryModal({
  feature,
  onClose,
  onRestored,
}: {
  feature: Feature | null;
  onClose: () => void;
  onRestored: () => void;
}) {
  const { error: toastError } = useToast();
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!feature) {
      setVersions(null);
      return;
    }
    void api
      .get<{ history: VersionRow[] }>(`/features/${feature.key}/history`)
      .then((data) => setVersions(data.history))
      .catch(() => setVersions([]));
  }, [feature]);

  const restore = async (versionId: string) => {
    if (!feature) return;
    setBusy(versionId);
    try {
      await api.post(`/features/${feature.id}/restore/${versionId}`);
      onRestored();
    } catch (caught) {
      toastError('Could not restore', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={!!feature} onClose={onClose} title="Version history" description={feature?.name} size="lg">
      {versions === null ? (
        <Skeleton className="h-40" />
      ) : versions.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-faint">No versions recorded yet.</p>
      ) : (
        <ul className="space-y-3">
          {versions.map((version) => (
            <li key={version.id} className="rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Version {version.version}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {version.changeNote ?? 'No note'} · {version.createdBy} · {formatDate(version.createdAt)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={busy === version.id}
                  onClick={() => void restore(version.id)}
                >
                  Restore
                </Button>
              </div>
              <pre className="scrollbar-thin mt-3 max-h-40 overflow-auto rounded-lg bg-surface-sunken p-3 text-[11px] text-ink-muted">
                {JSON.stringify(version.snapshot, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
