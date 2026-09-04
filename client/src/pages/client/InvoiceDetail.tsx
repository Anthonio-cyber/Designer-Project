import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { formatDate, INVOICE_STATUS_META, PAYMENT_METHOD_LABEL } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, LinkButton } from '@/components/ui/Button';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { Invoice } from '@/lib/types';

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const { success, error: toastError } = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.get<{ invoice: Invoice }>(`/invoices/${id}`);
      setInvoice(data.invoice);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this invoice.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The provider redirects back here after checkout. The invoice is only marked
   * paid by the signed webhook, so this just refreshes and explains the wait
   * rather than trusting the redirect.
   */
  useEffect(() => {
    if (!params.get('paid')) return;
    success('Payment submitted', 'It can take a few seconds to confirm.');
    const next = new URLSearchParams(params);
    next.delete('paid');
    setParams(next, { replace: true });

    const timers = [1500, 4000, 9000].map((delay) => setTimeout(() => void load(), delay));
    return () => timers.forEach(clearTimeout);
  }, [params, setParams, success, load]);

  const pay = async () => {
    if (!invoice) return;
    setPaying(true);
    try {
      const data = await api.post<{ url: string }>(`/invoices/${invoice.id}/checkout`, {});
      window.location.href = data.url;
    } catch (caught) {
      toastError('Could not open checkout', caught instanceof ApiError ? caught.message : undefined);
      setPaying(false);
    }
  };

  const copy = (value: string) => {
    void navigator.clipboard?.writeText(value).then(() => success('Copied'));
  };

  if (error) {
    return (
      <EmptyState
        title="Invoice not available"
        description={error}
        action={<LinkButton to="/dashboard/invoices">Back to invoices</LinkButton>}
      />
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  const meta = INVOICE_STATUS_META[invoice.status];
  const payable = invoice.status === 'sent';
  const cardPayable = payable && (invoice.method === 'stripe' || invoice.method === 'paystack');

  return (
    <div>
      <PageHeader
        title={invoice.number}
        description={invoice.title}
        backTo="/dashboard/invoices"
        backLabel="Invoices"
        actions={<Badge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? invoice.status}</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-ink-faint">Amount due</p>
                <p className="mt-1 font-display text-4xl font-extrabold tabular-nums text-ink">{invoice.amount}</p>
              </div>
              {invoice.dueDate && !invoice.paidAt && (
                <p className="text-sm text-ink-muted">Due {invoice.dueDate}</p>
              )}
            </div>

            {invoice.description && <p className="prose-studio mt-5">{invoice.description}</p>}

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
              {[
                ['Invoice', invoice.number],
                ['Issued', formatDate(invoice.sentAt ?? invoice.createdAt)],
                ['Project', invoice.projectTitle ?? '—'],
                ['Payment method', PAYMENT_METHOD_LABEL[invoice.method]],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-ink-faint">{label}</dt>
                  <dd className="mt-0.5 break-words text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            {invoice.paidAt && (
              <div className="mt-5 flex items-center gap-2.5 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                <Icon.check className="h-4 w-4 shrink-0" />
                Paid on {formatDate(invoice.paidAt)}. Thank you.
              </div>
            )}
          </Card>

          {invoice.method === 'bank_transfer' && invoice.bank && payable && (
            <Card>
              <h2 className="font-display text-base font-semibold text-ink">Bank transfer details</h2>
              <p className="mt-1.5 text-sm text-ink-muted">
                Transfer the amount above to this account. Use{' '}
                <span className="font-medium text-ink">{invoice.number}</span> as the reference so the studio can
                match it.
              </p>

              <dl className="mt-5 divide-y divide-line">
                {[
                  ['Account name', invoice.bank.accountName],
                  ['Account number', invoice.bank.accountNumber],
                  ['Bank', invoice.bank.bankName],
                  ['Sort code / routing', invoice.bank.routingNumber],
                  ['IBAN', invoice.bank.iban],
                  ['SWIFT / BIC', invoice.bank.swift],
                  ['Reference', invoice.number],
                ]
                  .filter(([, value]) => value)
                  .map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-3 py-3">
                      <dt className="text-sm text-ink-faint">{label}</dt>
                      <dd className="flex items-center gap-2">
                        <span className="font-mono text-sm text-ink">{value}</span>
                        <button
                          type="button"
                          onClick={() => copy(value as string)}
                          aria-label={`Copy ${label}`}
                          className="rounded-lg p-1.5 text-ink-faint transition hover:bg-ink/5 hover:text-accent dark:hover:bg-white/5"
                        >
                          <Icon.copy className="h-3.5 w-3.5" />
                        </button>
                      </dd>
                    </div>
                  ))}
              </dl>

              {invoice.bank.instructions && (
                <p className="mt-4 rounded-xl bg-surface-sunken p-4 text-sm text-ink-muted">
                  {invoice.bank.instructions}
                </p>
              )}
              <p className="mt-4 text-xs text-ink-faint">
                Transfers are confirmed by hand, so this invoice stays open until the studio sees the money land.
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Pay this invoice</h2>

            {invoice.status === 'paid' ? (
              <p className="mt-3 text-sm text-ink-muted">This invoice is settled — nothing more to do.</p>
            ) : invoice.status === 'cancelled' ? (
              <p className="mt-3 text-sm text-ink-muted">This invoice was cancelled by the studio.</p>
            ) : cardPayable ? (
              <>
                <p className="mt-2 text-sm text-ink-muted">
                  You will be taken to a secure {invoice.method === 'stripe' ? 'Stripe' : 'Paystack'} page. Card
                  details are entered there and never touch this site.
                </p>
                <Button full size="lg" className="mt-4" loading={paying} onClick={() => void pay()}>
                  Pay {invoice.amount}
                </Button>
              </>
            ) : invoice.method === 'bank_transfer' ? (
              <p className="mt-3 text-sm text-ink-muted">
                Use the bank details shown alongside. Once the transfer lands, the studio marks the invoice paid and
                you get a confirmation email.
              </p>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                This invoice is settled directly with the studio. Message them if you are not sure how.
              </p>
            )}

            <LinkButton to="/dashboard/messages" variant="outline" full className="mt-3">
              Ask about this invoice
            </LinkButton>
          </Card>

          {invoice.paymentTerms && (
            <Card>
              <h2 className="font-display text-base font-semibold text-ink">Payment terms</h2>
              <p className="mt-2 text-sm text-ink-muted">{invoice.paymentTerms}</p>
              {invoice.invoiceFooter && (
                <p className="mt-4 border-t border-line pt-4 text-xs text-ink-faint">{invoice.invoiceFooter}</p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
