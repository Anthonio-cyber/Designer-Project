import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '@/lib/api';
import { formatDate, INVOICE_STATUS_META, PAYMENT_METHOD_LABEL, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/Primitives';
import { StatTile } from '@/components/ui/Charts';
import { Icon } from '@/components/ui/Icons';
import type { Invoice } from '@/lib/types';

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [totals, setTotals] = useState<{ paid: string; outstanding: string } | null>(null);

  useEffect(() => {
    void api
      .get<{ invoices: Invoice[]; totals: { paid: string; outstanding: string } }>('/invoices')
      .then((data) => {
        setInvoices(data.invoices);
        setTotals(data.totals);
      })
      .catch(() => setInvoices([]));
  }, []);

  const outstanding = invoices?.filter((invoice) => invoice.status === 'sent') ?? [];

  return (
    <div>
      <PageHeader title="Invoices" description="Everything the studio has billed you for, and what is still open." />

      {totals && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <StatTile label="Outstanding" value={totals.outstanding} icon={<Icon.clock className="h-4 w-4" />} />
          <StatTile label="Paid to date" value={totals.paid} icon={<Icon.check className="h-4 w-4" />} />
          <StatTile label="Invoices" value={invoices?.length ?? 0} icon={<Icon.card className="h-4 w-4" />} />
        </div>
      )}

      {outstanding.length > 0 && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/8">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Icon.clock className="h-4 w-4 text-amber-500" />
            {outstanding.length === 1 ? 'One invoice is' : `${outstanding.length} invoices are`} awaiting payment
          </h2>
          <ul className="mt-4 space-y-2">
            {outstanding.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  to={`/dashboard/invoices/${invoice.id}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-surface-raised px-4 py-3 transition hover:shadow-card"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{invoice.title}</span>
                    <span className="block text-xs text-ink-faint">
                      {invoice.number} · {PAYMENT_METHOD_LABEL[invoice.method]}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold tabular-nums text-ink">{invoice.amount}</span>
                    <Icon.arrowRight className="h-4 w-4 text-accent" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {invoices === null ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={<Icon.card className="h-5 w-5" />}
          title="No invoices yet."
          description="When the studio bills for a project, the invoice appears here with everything you need to pay it."
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-line">
            {invoices.map((invoice) => {
              const meta = INVOICE_STATUS_META[invoice.status];
              return (
                <li key={invoice.id}>
                  <Link
                    to={`/dashboard/invoices/${invoice.id}`}
                    className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-ink/3 dark:hover:bg-white/4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-ink-faint">{invoice.number}</span>
                        <Badge tone={meta?.tone ?? 'neutral'}>{meta?.label ?? invoice.status}</Badge>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-ink">{invoice.title}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {invoice.projectTitle ?? 'Studio work'} · issued {formatDate(invoice.sentAt ?? invoice.createdAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-base font-semibold tabular-nums text-ink">{invoice.amount}</p>
                      <p className="text-[11px] text-ink-faint">
                        {invoice.paidAt ? `Paid ${relativeTime(invoice.paidAt)}` : invoice.dueDate ? `Due ${invoice.dueDate}` : ''}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
