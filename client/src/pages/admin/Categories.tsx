import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Card, EmptyState, Modal, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { Category } from '@/lib/types';

export default function Categories() {
  const { success, error: toastError } = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [removing, setRemoving] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ categories: Category[] }>('/categories');
      setCategories(data.categories);
    } catch {
      setCategories([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/categories/${removing.id}`);
      success('Category deleted');
      setRemoving(null);
      await load();
    } catch (caught) {
      toastError('Could not delete', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Portfolio categories"
        description="Custom categories your visitors can filter by. Create as many as you need."
        actions={
          <Button onClick={() => setEditing('new')} icon={<Icon.plus className="h-4 w-4" />}>
            Add category
          </Button>
        }
      />

      {categories === null ? (
        <Skeleton className="h-64" />
      ) : categories.length === 0 ? (
        <EmptyState
          icon={<Icon.layers className="h-5 w-5" />}
          title="No categories yet."
          description="Categories organise your portfolio and power the filters on the public site."
          action={<Button onClick={() => setEditing('new')}>Add a category</Button>}
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {categories.map((category) => (
              <li key={category.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-sm font-semibold text-ink">{category.name}</h2>
                    <code className="rounded bg-ink/5 px-1.5 py-0.5 text-[11px] text-ink-faint dark:bg-white/8">
                      /{category.slug}
                    </code>
                    <span className="text-xs text-ink-faint">
                      {category.projectCount ?? 0} project{category.projectCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  {category.description && <p className="mt-1 text-sm text-ink-muted">{category.description}</p>}
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setEditing(category)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-rose-500 hover:bg-rose-500/10"
                    onClick={() => setRemoving(category)}
                    aria-label={`Delete ${category.name}`}
                  >
                    <Icon.trash className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <CategoryModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          success('Category saved');
          void load();
        }}
      />

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Delete this category?"
        description={removing?.name}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void remove()}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          Categories still holding projects cannot be deleted — move those projects to another category first.
        </p>
      </Modal>
    </div>
  );
}

function CategoryModal({
  target,
  onClose,
  onSaved,
}: {
  target: Category | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const category = target === 'new' ? null : target;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});

    const payload = {
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? '') || null,
      position: Number(form.get('position') ?? 99),
    };

    try {
      if (category) await api.put(`/categories/${category.id}`, payload);
      else await api.post('/categories', payload);
      onSaved();
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
    <Modal open={!!target} onClose={onClose} title={category ? 'Edit category' : 'Add category'} size="sm">
      {target && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" required htmlFor="category-name" error={errors.name}>
            <Input
              id="category-name"
              name="name"
              required
              maxLength={60}
              defaultValue={category?.name ?? ''}
              placeholder="Packaging"
            />
          </Field>
          <Field label="Description" htmlFor="category-description" hint="Shown at the top of the filtered portfolio page.">
            <Textarea
              id="category-description"
              name="description"
              rows={3}
              maxLength={300}
              defaultValue={category?.description ?? ''}
            />
          </Field>
          <Field label="Sort position" htmlFor="category-position">
            <Input
              id="category-position"
              name="position"
              type="number"
              min={0}
              max={999}
              defaultValue={category?.position ?? 99}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save category
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
