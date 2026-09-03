import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/cn';
import { formatDate, relativeTime } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Button, Spinner } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { Badge, Card, EmptyState, Skeleton, Tabs } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icons';
import type { AiAction } from '@/lib/types';

interface AiStatus {
  configured: boolean;
  model: string;
  requireApproval: boolean;
  tone: string;
  tasks: { value: string; label: string }[];
  tools: { name: string; risk: 'read' | 'write' | 'dangerous'; summary: string }[];
}

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

type Tab = 'assistant' | 'builder' | 'log';

export default function AiAssistant() {
  const [tab, setTab] = useState<Tab>('assistant');
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    void api
      .get<AiStatus>('/ai/status')
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  return (
    <div>
      <PageHeader
        title="Designer’s AI"
        description="Your studio assistant: copy, planning, client replies — and new website features you approve before anything changes."
        actions={
          status && (
            <Badge tone={status.configured ? 'success' : 'warning'}>
              {status.configured ? `Live · ${status.model}` : 'Offline mode'}
            </Badge>
          )
        }
      />

      {status && !status.configured && (
        <Card className="mb-6 border-amber-500/40 bg-amber-500/8">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold text-ink">
            <Icon.shield className="h-4 w-4 text-amber-500" />
            No AI provider configured
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            The assistant is running on local heuristics built from your studio data. To enable full answers, set{' '}
            <code className="rounded bg-surface-sunken px-1.5 py-0.5 text-xs">ANTHROPIC_API_KEY</code> in the server
            environment. The key stays on the server — the browser never sees it and never calls the provider directly.
          </p>
        </Card>
      )}

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'assistant', label: 'Ask anything' },
          { value: 'builder', label: 'Add new feature' },
          { value: 'log', label: 'Change log' },
        ]}
      />

      {tab === 'assistant' && <AssistantPanel status={status} />}
      {tab === 'builder' && <FeatureBuilder status={status} />}
      {tab === 'log' && <ChangeLog />}
    </div>
  );
}

// --------------------------------------------------------------- assistant ---

function AssistantPanel({ status }: { status: AiStatus | null }) {
  const { error: toastError } = useToast();
  const [task, setTask] = useState('chat');
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const send = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 2) return;

    const optimistic: AiMessage = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: trimmed,
      meta: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);
    setPrompt('');
    setThinking(true);

    try {
      const data = await api.post<{ conversationId: string; reply: { text: string; live: boolean; model: string } }>(
        '/ai/ask',
        { task, prompt: trimmed, conversationId },
      );
      setConversationId(data.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.reply.text,
          meta: { live: data.reply.live, model: data.reply.model },
          createdAt: new Date().toISOString(),
        },
      ]);
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    } catch (caught) {
      toastError('The assistant could not respond', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setThinking(false);
    }
  };

  const suggestions = [
    'Suggest three ways to make the homepage convert better.',
    'Write a project description for a coffee packaging refresh.',
    'Draft a polite reply asking a client for their brand assets.',
    'Which portfolio categories am I missing?',
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card className="flex min-h-[560px] flex-col p-0">
        <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <div className="py-8">
              <EmptyState
                className="border-0"
                icon={<Icon.sparkles className="h-5 w-5" />}
                title="What do you need?"
                description="Pick a task above, or just ask. The assistant knows your portfolio, services, clients and settings."
              />
              <ul className="mx-auto mt-6 grid max-w-lg gap-2">
                {suggestions.map((suggestion) => (
                  <li key={suggestion}>
                    <button
                      type="button"
                      onClick={() => setPrompt(suggestion)}
                      className="w-full rounded-xl border border-line px-4 py-2.5 text-left text-sm text-ink-muted transition hover:border-accent/50 hover:text-ink"
                    >
                      {suggestion}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={cn('flex gap-3', message.role === 'user' && 'flex-row-reverse')}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-semibold',
                    message.role === 'user' ? 'bg-ink/8 text-ink dark:bg-white/10' : 'bg-accent/12 text-accent',
                  )}
                >
                  {message.role === 'user' ? 'You' : <Icon.sparkles className="h-4 w-4" />}
                </span>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'bg-accent text-white'
                      : 'border border-line bg-surface-sunken text-ink',
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  {message.role === 'assistant' && message.meta.live === false && (
                    <p className="mt-2 text-[11px] italic opacity-60">Generated offline from your studio data.</p>
                  )}
                </div>
              </div>
            ))
          )}

          {thinking && (
            <div className="flex items-center gap-3 text-sm text-ink-faint">
              <Spinner className="h-4 w-4 text-accent" />
              Thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="shrink-0 space-y-3 border-t border-line p-4">
          <Select value={task} onChange={(event) => setTask(event.target.value)} aria-label="Assistant task">
            {(status?.tasks ?? [{ value: 'chat', label: 'Ask anything' }]).map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>

          <div className="flex items-end gap-2">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={2}
              maxLength={6000}
              placeholder="Ask the assistant… (⌘↵ to send)"
              className="resize-none"
            />
            <Button onClick={() => void send()} loading={thinking} disabled={prompt.trim().length < 2} className="mb-0.5">
              <Icon.send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-6">
        <Card>
          <h2 className="font-display text-base font-semibold text-ink">What it can do</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-muted">
            {(status?.tasks ?? []).slice(0, 12).map((entry) => (
              <li key={entry.value} className="flex gap-2">
                <Icon.check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                {entry.label}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Icon.shield className="h-4 w-4 text-accent" />
            Safety
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            The assistant has no direct database or server access. It can only propose calls to a fixed list of
            approved actions, and nothing runs until you approve it.
          </p>
          {status?.tools?.length ? (
            <ul className="mt-4 space-y-2">
              {status.tools.map((tool) => (
                <li key={tool.name} className="flex items-start gap-2 text-xs">
                  <Badge
                    tone={tool.risk === 'dangerous' ? 'danger' : tool.risk === 'write' ? 'warning' : 'neutral'}
                    className="mt-0.5 shrink-0"
                  >
                    {tool.risk}
                  </Badge>
                  <span className="min-w-0">
                    <code className="text-[11px] text-ink">{tool.name}</code>
                    <span className="block text-ink-faint">{tool.summary}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- feature builder ---

function FeatureBuilder({ status }: { status: AiStatus | null }) {
  const { success, error: toastError } = useToast();
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<AiAction | null>(null);
  const [planning, setPlanning] = useState(false);
  const [applying, setApplying] = useState(false);

  const propose = async () => {
    const trimmed = prompt.trim();
    if (trimmed.length < 4) return;
    setPlanning(true);
    setPlan(null);
    try {
      const data = await api.post<{ action: AiAction }>('/ai/plan', { prompt: trimmed });
      setPlan(data.action);
    } catch (caught) {
      toastError('Could not build a plan', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setPlanning(false);
    }
  };

  const approve = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const data = await api.post<{ messages: string[]; undoable: boolean }>(`/ai/actions/${plan.id}/approve`);
      success('Change applied', data.messages.join(' '));
      setPlan(null);
      setPrompt('');
    } catch (caught) {
      toastError('Could not apply the change', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setApplying(false);
    }
  };

  const reject = async () => {
    if (!plan) return;
    try {
      await api.post(`/ai/actions/${plan.id}/reject`);
      setPlan(null);
    } catch {
      setPlan(null);
    }
  };

  const examples = [
    'Add a testimonials section to the homepage.',
    'Create a booking system so clients can schedule a discovery call.',
    'Add an FAQ page answering common client questions.',
    'Change the hero headline to something shorter and punchier.',
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Card>
          <h2 className="font-display text-base font-semibold text-ink">Describe the feature you want</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Write it in plain English. The assistant produces a plan you review before anything changes.
          </p>

          <Textarea
            className="mt-4"
            rows={3}
            maxLength={2000}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Add a testimonials section to the homepage."
          />

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {examples.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded-lg border border-line px-2.5 py-1.5 text-[11px] text-ink-muted transition hover:border-accent/50 hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
            <Button loading={planning} disabled={prompt.trim().length < 4} onClick={() => void propose()}>
              Plan this change
            </Button>
          </div>
        </Card>

        {planning && (
          <Card>
            <div className="flex items-center gap-3 text-sm text-ink-muted">
              <Spinner className="h-4 w-4 text-accent" />
              Working out what would need to change…
            </div>
          </Card>
        )}

        {plan && (
          <Card className="border-accent/40">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge tone="accent">Proposed change</Badge>
                <h2 className="mt-2 font-display text-lg font-semibold text-ink">{plan.summary}</h2>
              </div>
              <Badge tone={plan.risk === 'dangerous' ? 'danger' : plan.risk === 'write' ? 'warning' : 'neutral'}>
                {plan.risk} access
              </Badge>
            </div>

            {plan.reasoning && <p className="prose-studio mt-3">{plan.reasoning}</p>}

            {plan.warnings && plan.warnings.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {plan.warnings.map((warning) => (
                  <li key={warning} className="flex gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <Icon.shield className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Plan · {plan.plan.length} step{plan.plan.length === 1 ? '' : 's'}
              </h3>
              {plan.plan.length === 0 ? (
                <p className="mt-3 rounded-xl bg-surface-sunken p-4 text-sm text-ink-muted">
                  Nothing can be done with the approved actions. Try describing the change differently.
                </p>
              ) : (
                <ol className="mt-3 space-y-3">
                  {plan.plan.map((step, index) => (
                    <li key={`${step.tool}-${index}`} className="rounded-xl border border-line p-4">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/12 text-[11px] font-semibold text-accent">
                          {index + 1}
                        </span>
                        <code className="text-xs font-semibold text-ink">{step.tool}</code>
                      </div>
                      <p className="mt-2 text-sm text-ink-muted">{step.explanation}</p>
                      <pre className="scrollbar-thin mt-3 overflow-x-auto rounded-lg bg-surface-sunken p-3 text-[11px] leading-relaxed text-ink-muted">
                        {JSON.stringify(step.input, null, 2)}
                      </pre>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="mt-6 flex flex-col gap-2.5 border-t border-line pt-5 sm:flex-row">
              <Button
                loading={applying}
                disabled={plan.plan.length === 0}
                onClick={() => void approve()}
                icon={<Icon.check className="h-4 w-4" />}
              >
                Approve and apply
              </Button>
              <Button variant="outline" onClick={() => void reject()}>
                Reject
              </Button>
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
            <Icon.shield className="h-4 w-4 text-accent" />
            How this stays safe
          </h2>
          <ol className="mt-4 space-y-3 text-sm text-ink-muted">
            {[
              'The AI can only propose calls to a fixed list of approved actions — never raw SQL, never arbitrary code.',
              'Anything outside that list is dropped before you ever see the plan.',
              'Nothing runs until you press approve. Every step runs in one transaction.',
              'New features are created switched off, so the live site does not change until you enable them.',
              'Every change is logged, and most can be undone with one click.',
            ].map((line, index) => (
              <li key={line} className="flex gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/12 text-[10px] font-semibold text-accent">
                  {index + 1}
                </span>
                {line}
              </li>
            ))}
          </ol>
        </Card>

        {status?.tools?.length ? (
          <Card>
            <h2 className="font-display text-base font-semibold text-ink">Approved actions</h2>
            <ul className="mt-3 space-y-2">
              {status.tools.map((tool) => (
                <li key={tool.name} className="text-xs">
                  <div className="flex items-center gap-2">
                    <code className="text-[11px] font-semibold text-ink">{tool.name}</code>
                    <Badge
                      tone={tool.risk === 'dangerous' ? 'danger' : tool.risk === 'write' ? 'warning' : 'neutral'}
                    >
                      {tool.risk}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-ink-faint">{tool.summary}</p>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

// --------------------------------------------------------------- change log ---

function ChangeLog() {
  const { success, error: toastError } = useToast();
  const [actions, setActions] = useState<AiAction[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ actions: AiAction[] }>('/ai/actions');
      setActions(data.actions);
    } catch {
      setActions([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const undo = async (action: AiAction) => {
    setBusy(action.id);
    try {
      const data = await api.post<{ messages: string[] }>(`/ai/actions/${action.id}/undo`);
      success('Change undone', data.messages.join(' '));
      await load();
    } catch (caught) {
      toastError('Could not undo', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  if (actions === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <EmptyState
        icon={<Icon.sparkles className="h-5 w-5" />}
        title="No AI changes yet."
        description="Every proposal, approval and undo is recorded here."
      />
    );
  }

  const TONE: Record<string, 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
    proposed: 'accent',
    applied: 'success',
    rejected: 'neutral',
    failed: 'danger',
    undone: 'warning',
  };

  return (
    <div className="space-y-3">
      {actions.map((action) => (
        <Card key={action.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-ink">{action.summary}</h2>
              <p className="mt-1 text-xs text-ink-faint">
                “{action.prompt}” · {relativeTime(action.createdAt)}
                {action.adminName ? ` · ${action.adminName}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={TONE[action.status] ?? 'neutral'}>{action.status}</Badge>
              <Badge tone={action.risk === 'dangerous' ? 'danger' : action.risk === 'write' ? 'warning' : 'neutral'}>
                {action.risk}
              </Badge>
            </div>
          </div>

          {action.result && action.result.length > 0 && (
            <ul className="mt-3 space-y-1">
              {action.result.map((entry, index) => (
                <li key={index} className="flex gap-2 text-sm text-ink-muted">
                  <Icon.check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  {entry.message}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-xs text-ink-faint">
            <span>{action.plan.length} step{action.plan.length === 1 ? '' : 's'}</span>
            {action.appliedAt && <span>Applied {formatDate(action.appliedAt)}</span>}
            {action.undoneAt && <span>Undone {formatDate(action.undoneAt)}</span>}
            {action.status === 'applied' && (
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                loading={busy === action.id}
                onClick={() => void undo(action)}
                icon={<Icon.undo className="h-3.5 w-3.5" />}
              >
                Undo change
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
