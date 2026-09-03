import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/cn';
import { formatDate, PROJECT_STATUS_META } from '@/lib/format';
import { ConversationList } from '@/components/messaging/ConversationList';
import { MessageThread } from '@/components/messaging/MessageThread';
import { Avatar, Badge, Card } from '@/components/ui/Primitives';
import { LinkButton } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile, ConversationSummary, ProjectSummary } from '@/lib/types';

/** Three-pane messaging centre: conversations · thread · client context. */
export default function AdminMessages() {
  const [params, setParams] = useSearchParams();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<ConversationSummary | null>(null);

  const activeId = params.get('conversation');

  const load = useCallback(
    async (term = '') => {
      try {
        const data = await api.get<{ conversations: ConversationSummary[] }>('/messaging/conversations', {
          q: term,
        });
        setConversations(data.conversations);
        return data.conversations;
      } catch {
        setConversations([]);
        return [];
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const handle = setTimeout(() => void load(search), search ? 280 : 0);
    return () => clearTimeout(handle);
  }, [load, search]);

  // Keep the selected thread in sync with the ?conversation= parameter. With no
  // parameter, desktop opens the newest thread rather than showing an empty pane;
  // on phones the list stays visible until the user picks one.
  useEffect(() => {
    if (!activeId) {
      const wideEnough = window.matchMedia('(min-width: 1024px)').matches;
      setActive(wideEnough ? (conversations[0] ?? null) : null);
      return;
    }
    const match = conversations.find((conversation) => conversation.id === activeId);
    if (match) setActive(match);
  }, [activeId, conversations]);

  // A new message anywhere refreshes the list so previews and badges stay live.
  useEffect(() => {
    const socket = getSocket();
    const refresh = () => void load(search);
    socket.on('message:new', refresh);
    return () => {
      socket.off('message:new', refresh);
    };
  }, [load, search]);

  const select = (conversation: ConversationSummary) => {
    setActive(conversation);
    const next = new URLSearchParams(params);
    next.set('conversation', conversation.id);
    setParams(next, { replace: true });
  };

  const clear = () => {
    setActive(null);
    const next = new URLSearchParams(params);
    next.delete('conversation');
    setParams(next, { replace: true });
  };

  return (
    <div className="h-[calc(100vh-9rem)] min-h-[520px]">
      <div className="grid h-full gap-4 lg:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_300px]">
        {/* Conversation list — hidden on phones once a thread is open */}
        <Card className={cn('overflow-hidden p-0', active && 'hidden lg:flex lg:flex-col')}>
          <ConversationList
            conversations={conversations}
            activeId={active?.id ?? null}
            onSelect={select}
            search={search}
            onSearch={setSearch}
            loading={loading}
            className="h-full"
          />
        </Card>

        <Card className={cn('overflow-hidden p-0', !active && 'hidden lg:flex lg:flex-col')}>
          <MessageThread conversation={active} onBack={clear} className="h-full" />
        </Card>

        <div className={cn('hidden xl:block', !active && 'xl:hidden')}>
          {active && <ClientContext conversation={active} />}
        </div>
      </div>
    </div>
  );
}

function ClientContext({ conversation }: { conversation: ConversationSummary }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const clientId = conversation.participant.id;

  useEffect(() => {
    if (!clientId) return;
    void api
      .get<{ projects: ProjectSummary[] }>('/projects', { clientId })
      .then((data) => setProjects(data.projects))
      .catch(() => setProjects([]));
    void api
      .get<{ client: unknown; files: AttachedFile[] }>(`/admin/clients/${clientId}`)
      .then((data) => setFiles(data.files.slice(0, 6)))
      .catch(() => setFiles([]));
  }, [clientId]);

  return (
    <Card className="flex h-full flex-col overflow-y-auto p-5 scrollbar-thin">
      <div className="text-center">
        <Avatar
          name={conversation.participant.name}
          src={conversation.participant.avatarUrl}
          size="lg"
          online={conversation.participant.online}
          className="mx-auto"
        />
        <h2 className="mt-3 font-display text-base font-semibold text-ink">{conversation.participant.name}</h2>
        {conversation.participant.email && (
          <p className="truncate text-xs text-ink-muted">{conversation.participant.email}</p>
        )}
        <LinkButton to={`/admin/clients/${clientId}`} variant="outline" size="sm" full className="mt-4">
          Open client record
        </LinkButton>
      </div>

      <section className="mt-6 border-t border-line pt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Projects</h3>
        {projects.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">No projects yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/admin/projects/${project.id}`}
                  className="block rounded-xl border border-line p-3 transition hover:border-accent/50"
                >
                  <p className="truncate text-sm font-medium text-ink">{project.title}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <Badge className={PROJECT_STATUS_META[project.status]?.chip}>
                      {PROJECT_STATUS_META[project.status]?.label ?? project.status}
                    </Badge>
                    <span className="text-[11px] text-ink-faint">{project.progress}%</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 border-t border-line pt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">Recent files</h3>
        {files.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">No files shared yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {files.map((file) => (
              <li key={file.id}>
                <a
                  href={file.url ?? '#'}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-ink/5 dark:hover:bg-white/5"
                >
                  <Icon.file className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-ink">{file.name}</span>
                    <span className="block text-[10px] text-ink-faint">{formatDate(file.createdAt)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Card>
  );
}
