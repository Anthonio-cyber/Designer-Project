import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import {
  formatDate,
  INVOICE_STATUS_META,
  PAYMENT_METHOD_LABEL,
  relativeTime,
} from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton, Tabs } from '@/components/ui/Primitives';
import { StatTile } from '@/components/ui/Charts';
import { Icon } from '@/components/ui/Icons';
import type { Invoice, PaymentMethodStatus, ProjectSummary, Service } from '@/lib/types';

interface ClientOption {
  id: string;
  name: string;
  email: string;
}

export default function AdminInvoices() {
  const { success, error: toastError } = useToast();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [totals, setTotals] = useState<{ paid: string; outstanding: string } | null>(null);
  const [methods, setMethods] = useState<PaymentMethodStatus[]>([]);
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Invoice | null>(null);

  const load = useCallback(async () => {
    setInvoices(null);
    try {
      const data = await api.get<{
        invoices: Invoice[];
        totals: { paid: string; outstanding: string };
      }>('/invoices', { status });
      setInvoices(data.invoices);
      setTotals(data.totals);
    } catch {
      setInvoices([]);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void api
      .get<{ methods: PaymentMethodStatus[] }>('/invoices/methods')
      .then((data) => setMethods(data.methods))
      .catch(() => setMethods([]));
  }, []);

  const act = async (invoice: Invoice, action: 'send' | 'mark-paid') => {
    try {
      const data = await api.post<{ invoice: Invoice }>(`/invoices/${invoice.id}/${action}`, {});
      success(action === 'send' ? 'Invoice sent' : 'Marked as paid', `${data.invoice.number} · ${data.invoice.amount}`);
      setDetail(data.invoice);
      await load();
    } catch (caught) {
      toastError('Could not update', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const usable = methods.filter((method) => method.enabled && method.configured);

  return (
    <div>
      <PageHeader
        title="Invoices"
        description="Charge a fixed price, take a card payment, or send your account details for a transfer."
        actions={
          <Button onClick={() => setCreating(true)} icon={<Icon.plus className="h-4 w-4" />}>
            New invoice
          </Button>
        }
      />

      {usable.length === 0 && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/8">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <Icon.shield className="h-4 w-4 text-amber-500" />
            No payment method is ready yet
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Add your bank account in{' '}
            <Link to="/admin/settings" className="font-medium text-accent hover:underline">
              Settings → Payments
            </Link>{' '}
            — that works with no provider at all — or set up a card provider in{' '}
            <Link to="/admin/connectors" className="font-medium text-accent hover:underline">
              Connectors
            </Link>
            .
          </p>
        </Card>
      )}

      {totals && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Paid" value={totals.paid} icon={<Icon.check className="h-4 w-4" />} />
          <StatTile label="Outstanding" value={totals.outstanding} icon={<Icon.clock className="h-4 w-4" />} />
          <StatTile
            label="Invoices"
            value={invoices?.length ?? 0}
            hint={`${invoices?.filter((i) => i.status === 'draft').length ?? 0} draft`}
            icon={<Icon.file className="h-4 w-4" />}
          />
          <StatTile
            label="Methods live"
            value={usable.length}
            hint={usable.map((m) => m.label.split(' (')[0]).join(', ') || 'none'}
            icon={<Icon.card className="h-4 w-4" />}
          />
        </div>
      )}

      <Tabs
        className="mb-5"
        value={status}
        onChange={setStatus}
        tabs={[
          { value: '', label: 'All' },
          { value: 'draft', label: 'Drafts' },
          { value: 'sent', label: 'Awaiting payment' },
          { value: 'paid', label: 'Paid' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
      />

      {invoices === null ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={<Icon.card className="h-5 w-5" />}
          title="No invoices yet."
          description="Raise one against a project, or straight from a fixed-price service."
          action={<Button onClick={() => setCreating(true)}>Create an invoice</Button>}
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {invoices.map((invoice) => {
              const meta = INVOICE_STATUS_META[invoice.status];
              return (
                <li key={invoice.id}>
                  <button
                    type="button"
                    onClick={() => setDetail(invoice)}
                    className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left transition hover:bg-ink/3 dark:hover:bg-white/4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink-faint">{invoice.number}</span>
                        <Badge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? invoice.status}</Badge>
                        {invoice.status === 'draft' && <Badge tone="neutral">not sent</Badge>}
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-ink">{invoice.title}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {invoice.clientName} · {PAYMENT_METHOD_LABEL[invoice.method]}
                        {invoice.projectCode ? ` · ${invoice.projectCode}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-base font-semibold tabular-nums text-ink">{invoice.amount}</p>
                      <p className="text-[11px] text-ink-faint">
                        {invoice.paidAt
                          ? `Paid ${relativeTime(invoice.paidAt)}`
                          : invoice.dueDate
                            ? `Due ${invoice.dueDate}`
                            : relativeTime(invoice.createdAt)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <CreateInvoiceModal
        open={creating}
        methods={methods}
        onClose={() => setCreating(false)}
        onCreated={(invoice) => {
          setCreating(false);
          success(invoice.status === 'sent' ? 'Invoice sent' : 'Draft saved', invoice.number);
          void load();
        }}
      />

      <InvoiceDetailModal
        invoice={detail}
        onClose={() => setDetail(null)}
        onAction={(invoice, action) => void act(invoice, action)}
        onDeleted={() => {
          setDetail(null);
          success('Invoice deleted');
          void load();
        }}
      />
    </div>
  );
}

function CreateInvoiceModal({
  open,
  methods,
  onClose,
  onCreated,
}: {
  open: boolean;
  methods: PaymentMethodStatus[];
  onClose: () => void;
  onCreated: (invoice: Invoice) => void;
}) {
  const { error: toastError } = useToast();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [clientId, setClientId] = useState('');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    void api.get<{ clients: ClientOption[] }>('/admin/clients').then((d) => setClients(d.clients)).catch(() => undefined);
    void api.get<{ projects: ProjectSummary[] }>('/projects').then((d) => setProjects(d.projects)).catch(() => undefined);
    void api.get<{ services: Service[] }>('/services').then((d) => setServices(d.services)).catch(() => undefined);
  }, [open]);

  const usable = methods.filter((method) => method.enabled && method.configured);

  /** Picking a fixed-price service fills in the title and amount for you. */
  const applyService = (serviceId: string) => {
    const service = services.find((entry) => entry.id === serviceId);
    if (!service) return;
    setTitle((current) => current || service.name);
    if (service.priceMode === 'fixed' && service.priceFixed !== null) {
      setAmount(String(service.priceFixed));
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>, send: boolean) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setErrors({});
    try {
      const data = await api.post<{ invoice: Invoice }>('/invoices', {
        clientId: String(form.get('clientId') ?? ''),
        projectId: String(form.get('projectId') ?? '') || null,
        serviceId: String(form.get('serviceId') ?? '') || null,
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? '') || null,
        amount: Number(form.get('amount') ?? 0),
        method: String(form.get('method') ?? 'bank_transfer'),
        dueDate: String(form.get('dueDate') ?? '') || null,
        notes: String(form.get('notes') ?? '') || null,
        send,
      });
      onCreated(data.invoice);
    } catch (caught) {
      if (caught instanceof ApiError) {
        setErrors(caught.details);
        toastError(caught.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const clientProjects = projects.filter((project) => !clientId || project.clientId === clientId);

  return (
    <Modal open={open} onClose={onClose} title="New invoice" description="Charge for a project or a fixed-price service.">
      <form onSubmit={(event) => void submit(event, false)} className="space-y-4">
        <Field label="Client" required htmlFor="inv-client" error={errors.clientId}>
          <Select
            id="inv-client"
            name="clientId"
            required
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name} — {client.email}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project" htmlFor="inv-project" hint="Optional — links the invoice to a project.">
            <Select id="inv-project" name="projectId" defaultValue="">
              <option value="">None</option>
              {clientProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} — {project.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Service" htmlFor="inv-service" hint="A fixed-price service fills in the amount.">
            <Select id="inv-service" name="serviceId" defaultValue="" onChange={(e) => applyService(e.target.value)}>
              <option value="">Custom work</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} — {service.priceDisplay}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="What is being charged for" required htmlFor="inv-title" error={errors.title}>
          <Input
            id="inv-title"
            name="title"
            required
            maxLength={140}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Packaging refresh — 50% deposit"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Amount" required htmlFor="inv-amount" error={errors.amount}>
            <Input
              id="inv-amount"
              name="amount"
              type="number"
              min={0.5}
              step="0.01"
              required
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="600"
            />
          </Field>
          <Field label="Payment method" required htmlFor="inv-method" error={errors.method}>
            <Select id="inv-method" name="method" defaultValue={usable[0]?.method ?? 'bank_transfer'}>
              {usable.map((method) => (
                <option key={method.method} value={method.method}>
                  {method.label}
                </option>
              ))}
              <option value="other">Arranged with the studio</option>
            </Select>
          </Field>
          <Field label="Due" htmlFor="inv-due">
            <Input id="inv-due" name="dueDate" maxLength={40} placeholder="14 days" />
          </Field>
        </div>

        <Field label="Description" htmlFor="inv-description" hint="Shown on the invoice the client sees.">
          <Textarea id="inv-description" name="description" rows={3} maxLength={2000} />
        </Field>

        <Field label="Private note" htmlFor="inv-notes" hint="Only you see this.">
          <Input id="inv-notes" name="notes" maxLength={2000} />
        </Field>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="outline" loading={submitting}>
            Save as draft
          </Button>
          <Button
            type="button"
            loading={submitting}
            onClick={(event) => {
              const form = event.currentTarget.closest('form');
              if (form?.reportValidity()) {
                void submit({ preventDefault() {}, currentTarget: form } as unknown as React.FormEvent<HTMLFormElement>, true);
              }
            }}
          >
            Create and send
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function InvoiceDetailModal({
  invoice,
  onClose,
  onAction,
  onDeleted,
}: {
  invoice: Invoice | null;
  onClose: () => void;
  onAction: (invoice: Invoice, action: 'send' | 'mark-paid') => void;
  onDeleted: () => void;
}) {
  const { error: toastError } = useToast();
  const [deleting, setDeleting] = useState(false);

  if (!invoice) return null;
  const meta = INVOICE_STATUS_META[invoice.status];

  const remove = async () => {
    setDeleting(true);
    try {
      await api.delete(`/invoices/${invoice.id}`);
      onDeleted();
    } catch (caught) {
      toastError('Could not delete', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={invoice.number}
      description={`${invoice.clientName} · ${invoice.amount}`}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {invoice.status !== 'paid' && (
            <Button
              variant="ghost"
              className="mr-auto text-rose-500 hover:bg-rose-500/10"
              loading={deleting}
              onClick={() => void remove()}
            >
              Delete
            </Button>
          )}
          {invoice.status === 'draft' && <Button onClick={() => onAction(invoice, 'send')}>Send to client</Button>}
          {invoice.status === 'sent' && (
            <Button variant="outline" onClick={() => onAction(invoice, 'mark-paid')}>
              Mark as paid
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? invoice.status}</Badge>
          <Badge tone="neutral">{PAYMENT_METHOD_LABEL[invoice.method]}</Badge>
        </div>

        <div>
          <h3 className="font-display text-base font-semibold text-ink">{invoice.title}</h3>
          {invoice.description && <p className="mt-2 text-sm text-ink-muted">{invoice.description}</p>}
        </div>

        <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
          {[
            ['Amount', invoice.amount],
            ['Client', `${invoice.clientName} · ${invoice.clientEmail}`],
            ['Project', invoice.projectTitle ?? '—'],
            ['Due', invoice.dueDate ?? 'On receipt'],
            ['Issued', invoice.sentAt ? formatDate(invoice.sentAt) : 'Not sent yet'],
            ['Paid', invoice.paidAt ? `${formatDate(invoice.paidAt)} (${invoice.paidMethod ?? '—'})` : '—'],
            ['Reference', invoice.providerRef ?? '—'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-ink-faint">{label}</dt>
              <dd className="mt-0.5 break-words text-ink">{value}</dd>
            </div>
          ))}
        </dl>

        {invoice.method === 'bank_transfer' && invoice.bank && (
          <div className="rounded-xl bg-surface-sunken p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
              Account shown to the client
            </h4>
            <dl className="mt-3 space-y-1.5 text-sm">
              {[
                ['Account name', invoice.bank.accountName],
                ['Account number', invoice.bank.accountNumber],
                ['Bank', invoice.bank.bankName],
                ['Sort / routing', invoice.bank.routingNumber],
                ['IBAN', invoice.bank.iban],
                ['SWIFT/BIC', invoice.bank.swift],
              ]
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-ink-faint">{label}</dt>
                    <dd className="font-mono text-ink">{value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        )}

        {invoice.notes && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">Private note</h4>
            <p className="mt-1.5 text-sm text-ink-muted">{invoice.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
