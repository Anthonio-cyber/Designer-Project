import { db } from '../db/index.js';
import { forbidden, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';

export interface Conversation {
  id: string;
  client_id: string;
  subject: string | null;
  last_message_at: string | null;
  created_at: string;
}

/** Every client has exactly one private thread with the studio. */
export function ensureConversationForClient(clientId: string): Conversation {
  const existing = db
    .prepare(`SELECT * FROM conversations WHERE client_id = ?`)
    .get(clientId) as Conversation | undefined;
  if (existing) return existing;

  const id = uuid();
  db.prepare(`INSERT INTO conversations (id, client_id, subject) VALUES (?, ?, ?)`).run(
    id,
    clientId,
    'Studio conversation',
  );
  return db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(id) as Conversation;
}

/**
 * Resolves a conversation the viewer is allowed to open. Clients can only ever
 * reach their own thread; there is no client-to-client channel by design.
 */
export function authorizeConversation(
  conversationId: string,
  viewer: { id: string; role: 'client' | 'admin' },
): Conversation {
  const conversation = db
    .prepare(`SELECT * FROM conversations WHERE id = ?`)
    .get(conversationId) as Conversation | undefined;
  if (!conversation) throw notFound('Conversation not found.');
  if (viewer.role !== 'admin' && conversation.client_id !== viewer.id) {
    throw forbidden('This conversation is private.');
  }
  return conversation;
}

export function unreadForUser(userId: string, role: 'client' | 'admin'): number {
  if (role === 'admin') {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS n FROM messages m
           JOIN users u ON u.id = m.sender_id
          WHERE u.role = 'client' AND m.read_at IS NULL AND m.deleted_at IS NULL`,
      )
      .get() as { n: number };
    return row.n;
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages m
         JOIN conversations c ON c.id = m.conversation_id
         JOIN users u ON u.id = m.sender_id
        WHERE c.client_id = ? AND u.role = 'admin' AND m.read_at IS NULL AND m.deleted_at IS NULL`,
    )
    .get(userId) as { n: number };
  return row.n;
}
