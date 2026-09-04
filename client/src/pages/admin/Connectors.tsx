import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Modal, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { Connector, ConnectorsResponse, EmailLogEntry } from '@/lib/types';

const CATEGORY_LABEL: Record<Connector['category'], string> = {
  email: 'Email',
  payments: 'Payments',
  ai: 'AI',
};

const CATEGORY_ICON: Record<Connector['category'], keyof typeof Icon> = {
  email: 'mail',
  payments: 'card',
  ai: 'sparkles',
};

export default function Connectors() {
  const { success, error: toastError } = useToast();
  const [data, setData] = useState<ConnectorsResponse | null>(null);
  const [tab, setTab] = useState<'all' | Connector['category']>('all');
  const [testing, setTesting] = useState<string | null>(null);
  const [emailTest, setEmailTest] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.get<ConnectorsResponse>('/connectors'));
    } catch {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const testPayments = async (provider: 'stripe' | 'paystack') => {
    setTesting(provider);
    try {
      const result = await api.post<{ message: string }>('/connectors/payments/test', { provider });
      success('Connection works', result.message);
    } catch (caught) {
      toastError('Connection failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setTesting(null);
    }
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-56" />
          ))}
        </div>
      </div>
    );
  }

  const visible = tab === 'all' ? data.connectors : data.connectors.filter((c) => c.category === tab);
  const live = data.connectors.filter((c) => c.configured && c.enabled).length;

  return (
    <div>
      <PageHeader
        title="Connectors"
        description="The outside services this platform can talk to. Keys live in the server environment — this screen only ever shows whether one is present."
        actions={
          <>
            <Button variant="outline" onClick={() => setShowLog(true)} icon={<Icon.mail className="h-4 w-4" />}>
              Email log
            </Button>
            <Button variant="outline" onClick={() => setEmailTest(true)}>
              Send test email
            </Button>
          </>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <span className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', live > 0 ? 'bg-emerald-500' : 'bg-amber-500')} />
            <span className="text-ink">
              {live} of {data.connectors.length} connectors live
            </span>
          </span>
          <span className="text-ink-muted">
            Email: <span className="text-ink">{data.email.activeProvider === 'none' ? 'not configured' : data.email.activeProvider}</span>
          </span>
          <span className="text-ink-muted">
            Sending as <span className="text-ink">{data.email.from}</span>
          </span>
          <span className="text-ink-muted">
            Currency <span className="text-ink">{data.payments.currency}</span>
          </span>
        </div>
      </Card>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'all', label: 'All', count: data.connectors.length },
          { value: 'email', label: 'Email' },
          { value: 'payments', label: 'Payments' },
          { value: 'ai', label: 'AI' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {visible.map((connector) => {
          const Glyph = Icon[CATEGORY_ICON[connector.category]];
          const state = !connector.configured
            ? { label: 'Not configured', tone: 'neutral' as const }
            : connector.enabled
              ? { label: 'Live', tone: 'success' as const }
              : { label: 'Configured, switched off', tone: 'warning' as const };

          return (
            <Card key={connector.key} className="flex flex-col">
              <div className="flex items-start gap-3.5">
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    connector.configured && connector.enabled
                      ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                      : 'bg-accent/10 text-accent',
                  )}
                >
                  <Glyph className="h-5 w-5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-ink">{connector.name}</h2>
                    {connector.recommended && <Badge tone="accent">Recommended</Badge>}
                    {connector.testMode && <Badge tone="warning">Test mode</Badge>}
                  </div>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-faint">
                    {CATEGORY_LABEL[connector.category]}
                  </p>
                </div>

                <Badge tone={state.tone}>{state.label}</Badge>
              </div>

              <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">{connector.summary}</p>

              {connector.notes.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {connector.notes.map((note) => (
                    <li key={note} className="flex gap-2 text-xs text-ink-faint">
                      <Icon.shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent/70" />
                      {note}
                    </li>
                  ))}
                </ul>
              )}

              {connector.envVars.length > 0 && (
                <div className="mt-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                    Environment variables
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {connector.envVars.map((name) => (
                      <code
                        key={name}
                        className="rounded-lg bg-surface-sunken px-2 py-1 text-[11px] text-ink-muted"
                      >
                        {name}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
                {connector.setupUrl && (
                  <a
                    href={connector.setupUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-[13px] font-medium text-ink-muted transition hover:border-accent/50 hover:text-accent"
                  >
                    Get a key
                    <Icon.external className="h-3.5 w-3.5" />
                  </a>
                )}
                {(connector.key === 'stripe' || connector.key === 'paystack') && connector.configured && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={testing === connector.key}
                    onClick={() => void testPayments(connector.key as 'stripe' | 'paystack')}
                  >
                    Test connection
                  </Button>
                )}
                {connector.category === 'email' && connector.configured && (
                  <Button size="sm" variant="outline" onClick={() => setEmailTest(true)}>
                    Send test email
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {(tab === 'all' || tab === 'payments') && (
        <Card className="mt-6">
          <h2 className="font-display text-base font-semibold text-ink">Webhook endpoints</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Add these in your provider dashboard so a completed payment marks its invoice paid automatically.
            Every call is signature-checked and replay-protected.
          </p>
          <div className="mt-4 space-y-2.5">
            <WebhookRow label="Stripe" hint="Listen to checkout.session.completed" url={data.webhookUrls.stripe} />
            <WebhookRow label="Paystack" hint="Listen to charge.success" url={data.webhookUrls.paystack} />
          </div>
        </Card>
      )}

      <EmailTestModal open={emailTest} onClose={() => setEmailTest(false)} />
      <EmailLogModal open={showLog} onClose={() => setShowLog(false)} />
    </div>
  );
}

function WebhookRow({ label, hint, url }: { label: string; hint: string; url: string }) {
  const { success } = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{label}</p>
        <code className="mt-0.5 block break-all text-[11px] text-ink-faint">{url}</code>
        <p className="mt-0.5 text-[11px] text-ink-faint">{hint}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => success('Copied'));
        }}
        icon={<Icon.copy className="h-3.5 w-3.5" />}
      >
        Copy
      </Button>
    </div>
  );
}

function EmailTestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { success, error: toastError } = useToast();
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      const result = await api.post<{ provider: string; to: string }>('/connectors/email/test', {
        to: to.trim() || undefined,
      });
      success('Test email sent', `Delivered to ${result.to} via ${result.provider}.`);
      onClose();
    } catch (caught) {
      toastError('Could not send', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send a test email"
      description="Proves the transport works end to end, not just that a key is present."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={sending} onClick={() => void send()}>
            Send test
          </Button>
        </div>
      }
    >
      <Field label="Send to" hint="Leave blank to send to your own address.">
        <Input
          type="email"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          placeholder="you@example.com"
        />
      </Field>
    </Modal>
  );
}

function EmailLogModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [emails, setEmails] = useState<EmailLogEntry[] | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmails(null);
    void api
      .get<{ emails: EmailLogEntry[] }>('/connectors/email/log')
      .then((data) => setEmails(data.emails))
      .catch(() => setEmails([]));
  }, [open]);

  return (
    <Modal open={open} onClose={onClose} title="Email log" description="The last 60 delivery attempts." size="lg">
      {emails === null ? (
        <Skeleton className="h-64" />
      ) : emails.length === 0 ? (
        <EmptyState
          className="border-dashed"
          icon={<Icon.mail className="h-5 w-5" />}
          title="No emails yet."
          description="Sent, skipped and failed messages all appear here."
        />
      ) : (
        <ul className="divide-y divide-line">
          {emails.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-start gap-3 py-3">
              <Badge
                tone={entry.status === 'sent' ? 'success' : entry.status === 'failed' ? 'danger' : 'neutral'}
                className="mt-0.5 shrink-0"
              >
                {entry.status}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">{entry.subject}</p>
                <p className="truncate text-xs text-ink-faint">
                  {entry.toEmail} · {entry.template} · {entry.provider}
                </p>
                {entry.error && <p className="mt-0.5 text-xs text-rose-500">{entry.error}</p>}
              </div>
              <span className="shrink-0 text-xs text-ink-faint">{relativeTime(entry.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
