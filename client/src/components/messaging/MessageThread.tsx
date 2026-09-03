import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/cn';
import { formatBytes, formatDate, formatTime } from '@/lib/format';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useNotifications } from '@/context/NotificationContext';
import { Button, Spinner } from '@/components/ui/Button';
import { Avatar, EmptyState, Modal } from '@/components/ui/Primitives';
import { Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icons';
import type { AttachedFile, ConversationSummary, Message } from '@/lib/types';

interface MessageThreadProps {
  conversation: ConversationSummary | null;
  onBack?: () => void;
  className?: string;
}

/**
 * The private one-to-one thread between a client and the studio. The server
 * authorises every read and write, so a client can only ever open their own
 * conversation regardless of what the UI asks for.
 */
export function MessageThread({ conversation, onBack, className }: MessageThreadProps) {
  const { user } = useAuth();
  const { error: toastError } = useToast();
  const { reload: reloadNotifications, setUnreadMessages } = useNotifications();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<AttachedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout>>();
  const conversationId = conversation?.id ?? null;

  const scrollToEnd = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior, block: 'end' }));
  }, []);

  // Load history, join the realtime room, and mark the thread read.
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);

    void api
      .get<{ messages: Message[] }>(`/messaging/conversations/${conversationId}/messages`, { limit: 60 })
      .then((data) => {
        if (cancelled) return;
        setMessages(data.messages);
        scrollToEnd('instant' as ScrollBehavior);
        // Attachments and web fonts can change bubble heights after the first
        // paint, so settle the scroll once more when layout has stabilised.
        setTimeout(() => !cancelled && scrollToEnd('instant' as ScrollBehavior), 350);
      })
      .catch((caught) => {
        if (!cancelled) {
          toastError('Could not load the conversation', caught instanceof ApiError ? caught.message : undefined);
        }
      })
      .finally(() => !cancelled && setLoading(false));

    const socket = getSocket();
    socket.emit('conversation:join', conversationId);

    void api
      .post(`/messaging/conversations/${conversationId}/read`)
      .then(() => {
        setUnreadMessages(0);
        void reloadNotifications();
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      socket.emit('conversation:leave', conversationId);
    };
  }, [conversationId, scrollToEnd, toastError, reloadNotifications, setUnreadMessages]);

  // Live events: new messages, deletions, read receipts and typing.
  useEffect(() => {
    if (!conversationId) return;
    const socket = getSocket();

    const onNew = (message: Message) => {
      if (message.conversationId !== conversationId) return;
      setMessages((current) =>
        current.some((entry) => entry.id === message.id) ? current : [...current, message],
      );
      scrollToEnd();
      if (message.sender.id !== user?.id) {
        void api.post(`/messaging/conversations/${conversationId}/read`).catch(() => undefined);
      }
    };

    const onDeleted = ({ id }: { id: string }) =>
      setMessages((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, deleted: true, body: '', attachments: [] } : entry)),
      );

    const onRead = ({ readerId }: { readerId: string }) => {
      if (readerId === user?.id) return;
      setMessages((current) =>
        current.map((entry) =>
          entry.sender.id === user?.id && !entry.readAt ? { ...entry, readAt: new Date().toISOString() } : entry,
        ),
      );
    };

    const onTyping = (payload: { conversationId: string; userId: string; name: string; typing: boolean }) => {
      if (payload.conversationId !== conversationId || payload.userId === user?.id) return;
      setTypingUser(payload.typing ? payload.name : null);
      if (payload.typing) setTimeout(() => setTypingUser(null), 3500);
    };

    socket.on('message:new', onNew);
    socket.on('message:deleted', onDeleted);
    socket.on('message:read', onRead);
    socket.on('typing', onTyping);

    return () => {
      socket.off('message:new', onNew);
      socket.off('message:deleted', onDeleted);
      socket.off('message:read', onRead);
      socket.off('typing', onTyping);
    };
  }, [conversationId, user?.id, scrollToEnd]);

  const emitTyping = useCallback(
    (typing: boolean) => {
      if (!conversationId) return;
      getSocket().emit('typing', { conversationId, typing });
    },
    [conversationId],
  );

  const onBodyChange = (value: string) => {
    setBody(value);
    emitTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => emitTyping(false), 1400);
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const file of Array.from(files).slice(0, 10)) form.append('files', file);
      const data = await api.upload<{ files: AttachedFile[] }>('/messaging/attachments', form);
      setAttachments((current) => [...current, ...data.files]);
    } catch (caught) {
      toastError('Upload failed', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (!conversationId) return;
    const trimmed = body.trim();
    if (!trimmed && attachments.length === 0) return;

    setSending(true);
    emitTyping(false);
    try {
      const data = await api.post<{ message: Message }>(
        `/messaging/conversations/${conversationId}/messages`,
        { body: trimmed, attachmentIds: attachments.map((file) => file.id) },
      );
      // The socket echo is de-duplicated by id, so appending here is safe.
      setMessages((current) =>
        current.some((entry) => entry.id === data.message.id) ? current : [...current, data.message],
      );
      setBody('');
      setAttachments([]);
      scrollToEnd();
    } catch (caught) {
      toastError('Message not sent', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSending(false);
    }
  };

  const remove = async (message: Message) => {
    try {
      await api.delete(`/messaging/messages/${message.id}`);
      setMessages((current) =>
        current.map((entry) =>
          entry.id === message.id ? { ...entry, deleted: true, body: '', attachments: [] } : entry,
        ),
      );
    } catch (caught) {
      toastError('Could not delete the message', caught instanceof ApiError ? caught.message : undefined);
    }
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return messages;
    return messages.filter((message) => message.body.toLowerCase().includes(term));
  }, [messages, search]);

  const grouped = useMemo(() => {
    const groups: { day: string; items: Message[] }[] = [];
    for (const message of visible) {
      const day = formatDate(message.createdAt, { day: 'numeric', month: 'long', year: 'numeric' });
      const last = groups[groups.length - 1];
      if (last?.day === day) last.items.push(message);
      else groups.push({ day, items: [message] });
    }
    return groups;
  }, [visible]);

  if (!conversation) {
    return (
      <div className={cn('flex items-center justify-center', className)}>
        <EmptyState
          className="border-0"
          icon={<Icon.chat className="h-5 w-5" />}
          title="No conversation selected"
          description="Choose a conversation from the list to read and reply."
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to conversations"
            className="-ml-1.5 rounded-lg p-1.5 text-ink-muted transition hover:bg-ink/5 lg:hidden dark:hover:bg-white/5"
          >
            <Icon.arrowLeft className="h-5 w-5" />
          </button>
        )}
        <Avatar
          name={conversation.participant.name}
          src={conversation.participant.avatarUrl}
          size="sm"
          online={conversation.participant.online}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{conversation.participant.name}</p>
          <p className="truncate text-xs text-ink-faint">
            {typingUser ? <span className="text-accent">typing…</span> : conversation.participant.online ? 'Online' : 'Offline'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSearch((value) => !value)}
          aria-label="Search this conversation"
          className={cn(
            'rounded-lg p-2 transition',
            showSearch ? 'bg-accent/12 text-accent' : 'text-ink-faint hover:bg-ink/5 hover:text-ink dark:hover:bg-white/5',
          )}
        >
          <Icon.search className="h-[18px] w-[18px]" />
        </button>
      </header>

      {showSearch && (
        <div className="shrink-0 border-b border-line px-4 py-2.5">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search messages in this conversation…"
            autoFocus
          />
        </div>
      )}

      <div className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-5 w-5 text-accent" />
          </div>
        ) : grouped.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={<Icon.chat className="h-5 w-5" />}
            title={search ? 'No messages matched' : 'No messages yet.'}
            description={
              search
                ? 'Try a different search term.'
                : 'Say hello — attach files, ask questions, share direction. This thread is private.'
            }
          />
        ) : (
          grouped.map((group) => (
            <div key={group.day} className="space-y-3">
              <div className="flex justify-center">
                <span className="rounded-full bg-ink/5 px-3 py-1 text-[11px] font-medium text-ink-faint dark:bg-white/8">
                  {group.day}
                </span>
              </div>

              {group.items.map((message) => {
                const mine = message.sender.id === user?.id;
                return (
                  <div key={message.id} className={cn('group flex gap-2.5', mine && 'flex-row-reverse')}>
                    {!mine && (
                      <Avatar name={message.sender.name} src={message.sender.avatarUrl} size="xs" className="mt-auto" />
                    )}

                    <div className={cn('flex max-w-[85%] flex-col sm:max-w-[72%]', mine && 'items-end')}>
                      <div
                        className={cn(
                          'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                          message.deleted
                            ? 'border border-dashed border-line bg-transparent italic text-ink-faint'
                            : mine
                              ? 'bg-accent text-white'
                              : 'border border-line bg-surface-raised text-ink',
                        )}
                      >
                        {message.deleted ? (
                          'This message was deleted.'
                        ) : (
                          <>
                            {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                            {message.attachments.length > 0 && (
                              <div className={cn('space-y-1.5', message.body && 'mt-2')}>
                                {message.attachments.map((file) => (
                                  <Attachment
                                    key={file.id}
                                    file={file}
                                    mine={mine}
                                    onPreview={() => file.url && setPreview(file.url)}
                                  />
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div
                        className={cn(
                          'mt-1 flex items-center gap-2 px-1 text-[10.5px] text-ink-faint',
                          mine && 'flex-row-reverse',
                        )}
                      >
                        <span>{formatTime(message.createdAt)}</span>
                        {mine && !message.deleted && (
                          <span title={message.readAt ? 'Read' : 'Delivered'}>{message.readAt ? '✓✓' : '✓'}</span>
                        )}
                        {!message.deleted && (
                          <span className="flex gap-1.5 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                            {mine ? (
                              <button
                                type="button"
                                onClick={() => void remove(message)}
                                className="hover:text-rose-500"
                              >
                                Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setReporting(message)}
                                className="hover:text-amber-500"
                              >
                                Report
                              </button>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {typingUser && (
          <div className="flex items-center gap-2 px-1 text-xs text-ink-faint">
            <span className="flex gap-1">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-accent"
                  style={{ animationDelay: `${dot * 140}ms` }}
                />
              ))}
            </span>
            {typingUser} is typing
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer — stays pinned above the mobile keyboard and bottom nav. */}
      <div className="shrink-0 border-t border-line bg-surface-raised px-3 py-3">
        {attachments.length > 0 && (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-line bg-surface-sunken py-1 pl-2 pr-1 text-xs"
              >
                <Icon.file className="h-3.5 w-3.5 text-ink-faint" />
                <span className="max-w-[140px] truncate text-ink">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((current) => current.filter((entry) => entry.id !== file.id))}
                  aria-label={`Remove ${file.name}`}
                  className="rounded p-0.5 text-ink-faint hover:text-rose-500"
                >
                  <Icon.x className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,.pdf,.ai,.psd,.zip"
            className="sr-only"
            onChange={(event) => {
              void uploadFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Attach a file"
            className="mb-0.5 shrink-0 rounded-xl p-2.5 text-ink-faint transition hover:bg-ink/5 hover:text-accent disabled:opacity-50 dark:hover:bg-white/5"
          >
            {uploading ? <Spinner /> : <Icon.paperclip className="h-5 w-5" />}
          </button>

          <Textarea
            value={body}
            onChange={(event) => onBodyChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Write a message…"
            aria-label="Message"
            className="max-h-40 min-h-[44px] resize-none py-3"
          />

          <Button
            onClick={() => void send()}
            loading={sending}
            disabled={!body.trim() && attachments.length === 0}
            aria-label="Send message"
            className="mb-0.5 h-11 w-11 shrink-0 rounded-xl p-0"
          >
            {!sending && <Icon.send className="h-[18px] w-[18px]" />}
          </Button>
        </div>
      </div>

      <ReportModal message={reporting} onClose={() => setReporting(null)} />

      {preview && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950/92 p-4"
          onClick={() => setPreview(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Attachment preview"
        >
          <img src={preview} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </div>
  );
}

function Attachment({ file, mine, onPreview }: { file: AttachedFile; mine: boolean; onPreview: () => void }) {
  if (file.mimeType?.startsWith('image/') && file.url) {
    return (
      <button type="button" onClick={onPreview} className="block overflow-hidden rounded-xl">
        <img
          src={file.url}
          alt={file.name}
          loading="lazy"
          className="max-h-56 w-full rounded-xl object-cover transition hover:opacity-90"
        />
      </button>
    );
  }

  return (
    <a
      href={file.url ?? '#'}
      target="_blank"
      rel="noreferrer noopener"
      className={cn(
        'flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition',
        mine ? 'bg-white/15 hover:bg-white/25' : 'bg-ink/5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/12',
      )}
    >
      <Icon.file className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{file.name}</span>
        <span className="block text-[10px] opacity-70">{formatBytes(file.size)}</span>
      </span>
      <Icon.download className="h-4 w-4 shrink-0 opacity-70" />
    </a>
  );
}

function ReportModal({ message, onClose }: { message: Message | null; onClose: () => void }) {
  const { success, error: toastError } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!message || reason.trim().length < 4) return;
    setSubmitting(true);
    try {
      await api.post(`/messaging/messages/${message.id}/report`, { reason: reason.trim() });
      success('Reported', 'The studio has been notified.');
      setReason('');
      onClose();
    } catch (caught) {
      toastError('Could not send the report', caught instanceof ApiError ? caught.message : undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={!!message}
      onClose={onClose}
      title="Report a problem"
      description="Tell us what is wrong with this message."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={submitting}
            onClick={() => void submit()}
            disabled={reason.trim().length < 4}
          >
            Send report
          </Button>
        </div>
      }
    >
      <Textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={4}
        maxLength={600}
        placeholder="What is the problem with this message?"
      />
    </Modal>
  );
}
