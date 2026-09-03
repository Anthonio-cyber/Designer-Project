import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatMoney } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { Service } from '@/lib/types';

export default function AdminServices() {
  const { success, error: toastError } = useToast();
  const [services, setServices] = useState<Service[] | null>(null);
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [removing, setRemoving] = useState<Service | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ services: Service[] }>('/services');
      setServices(data.services);
    } catch {
      setServices([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleActive = async (service: Service) => {
    try {
      await api.put(`/services/${service.id}`, { active: !service.active });
      await load();
    } catch (caught) {
      toastError('Could not update', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await api.delete(`/services/${removing.id}`);
      success('Service deleted');
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
        title="Services"
        description="What appears on the public services page, with pricing and delivery times."
        actions={
          <Button onClick={() => setEditing('new')} icon={<Icon.plus className="h-4 w-4" />}>
            Add service
          </Button>
        }
      />

      {services === null ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={<Icon.tag className="h-5 w-5" />}
          title="No services yet."
          description="Add the services you offer so visitors know what they can request."
          action={<Button onClick={() => setEditing('new')}>Add your first service</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <Card key={service.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-base font-semibold text-ink">{service.name}</h2>
                <Badge tone={service.active ? 'success' : 'neutral'}>{service.active ? 'live' : 'hidden'}</Badge>
              </div>
              {service.description && (
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-ink-muted">{service.description}</p>
              )}
              <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs">
                <div className="flex justify-between">
                  <dt className="text-ink-faint">Price</dt>
                  <dd className="text-ink">{service.priceLabel ?? formatMoney(service.priceFrom)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-faint">Delivery</dt>
                  <dd className="text-ink">{service.deliveryTime ?? '—'}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditing(service)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void toggleActive(service)}>
                  {service.active ? 'Hide' : 'Show'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-rose-500 hover:bg-rose-500/10"
                  onClick={() => setRemoving(service)}
                  aria-label={`Delete ${service.name}`}
                >
                  <Icon.trash className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ServiceModal
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          success('Service saved');
          void load();
        }}
      />

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Delete this service?"
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
          It disappears from the services page immediately. Projects already linked to it keep working.
        </p>
      </Modal>
    </div>
  );
}

function ServiceModal({
  target,
  onClose,
  onSaved,
}: {
  target: Service | 'new' | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { error: toastError } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const service = target === 'new' ? null : target;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});

    const priceValue = String(form.get('priceFrom') ?? '').trim();
    const payload = {
      name: String(form.get('name') ?? ''),
      description: String(form.get('description') ?? '') || null,
      priceFrom: priceValue ? Number(priceValue) : null,
      priceLabel: String(form.get('priceLabel') ?? '') || null,
      deliveryTime: String(form.get('deliveryTime') ?? '') || null,
      position: Number(form.get('position') ?? 99),
      active: form.get('active') === 'on',
    };

    try {
      if (service) await api.put(`/services/${service.id}`, payload);
      else await api.post('/services', payload);
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
    <Modal open={!!target} onClose={onClose} title={service ? 'Edit service' : 'Add service'}>
      {target && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" required htmlFor="service-name" error={errors.name}>
            <Input id="service-name" name="name" required maxLength={80} defaultValue={service?.name ?? ''} />
          </Field>
          <Field label="Description" htmlFor="service-description">
            <Textarea
              id="service-description"
              name="description"
              rows={4}
              maxLength={1200}
              defaultValue={service?.description ?? ''}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starting price" htmlFor="service-price" hint="Numbers only. Leave blank for “contact for pricing”.">
              <Input
                id="service-price"
                name="priceFrom"
                type="number"
                min={0}
                step={1}
                defaultValue={service?.priceFrom ?? ''}
              />
            </Field>
            <Field label="Price label" htmlFor="service-price-label" hint="Overrides the number, e.g. “From £350”.">
              <Input id="service-price-label" name="priceLabel" maxLength={60} defaultValue={service?.priceLabel ?? ''} />
            </Field>
            <Field label="Delivery time" htmlFor="service-delivery">
              <Input
                id="service-delivery"
                name="deliveryTime"
                maxLength={60}
                placeholder="5–7 days"
                defaultValue={service?.deliveryTime ?? ''}
              />
            </Field>
            <Field label="Sort position" htmlFor="service-position">
              <Input id="service-position" name="position" type="number" min={0} max={999} defaultValue={service?.position ?? 99} />
            </Field>
          </div>
          <Checkbox
            name="active"
            label="Show on the public services page"
            defaultChecked={service ? service.active : true}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Save service
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
