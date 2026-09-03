import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { MessageThread } from '@/components/messaging/MessageThread';
import { PageHeader } from '@/components/PageHeader';
import type { ConversationSummary } from '@/lib/types';

export default function Messages() {
  const [conversation, setConversation] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<{ conversations: ConversationSummary[] }>('/messaging/conversations')
      .then((data) => setConversation(data.conversations[0] ?? null))
      .catch(() => setConversation(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Your private conversation with the studio. Nobody else can read it."
      />

      <div className="card flex h-[calc(100vh-16rem)] min-h-[440px] flex-col overflow-hidden p-0 lg:h-[calc(100vh-13rem)]">
        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-ink-faint">Loading conversation…</div>
        ) : (
          <MessageThread conversation={conversation} className="flex-1" />
        )}
      </div>
    </div>
  );
}
