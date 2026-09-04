import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { uuid } from '../lib/ids.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { authorizeConversation, ensureConversationForClient } from '../services/messaging.service.js';
import { notify, notifyAdmins } from '../services/notifications.service.js';
import { emitToAdmins, emitToConversation, emitToUser, isOnline } from '../realtime/index.js';
import { publicUrl, recordFile, upload } from '../services/storage.service.js';
import { track } from '../services/analytics.service.js';
import { adminRecipients, sendEmailAsync, templates } from '../services/email/index.js';
import { db as database } from '../db/index.js';

export const messagesRouter = Router();
messagesRouter.use(requireAuth);

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderRole: 'client' | 'admin';
  senderAvatarId: string | null;
  body: string;
  projectId: string | null;
  readAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

const attachmentsFor = db.prepare(
  `SELECT f.id, f.original_name AS name, f.mime_type AS mimeType, f.size_bytes AS size
     FROM message_attachments ma JOIN files f ON f.id = ma.file_id
    WHERE ma.message_id = ?`,
);

function serializeMessage(row: MessageRow) {
  const attachments = (attachmentsFor.all(row.id) as {
    id: string;
    name: string;
    mimeType: string;
    size: number;
  }[]).map((file) => ({ ...file, url: publicUrl(file.id) }));

  return {
    id: row.id,
    conversationId: row.conversationId,
    body: row.deletedAt ? '' : row.body,
    deleted: !!row.deletedAt,
    projectId: row.projectId,
    readAt: row.readAt,
    createdAt: row.createdAt,
    sender: {
      id: row.senderId,
      name: row.senderName,
      role: row.senderRole,
      avatarUrl: publicUrl(row.senderAvatarId),
      online: isOnline(row.senderId),
    },
    attachments: row.deletedAt ? [] : attachments,
  };
}

const messageSelect = `
  SELECT m.id, m.conversation_id AS conversationId, m.sender_id AS senderId, m.body,
         m.project_id AS projectId, m.read_at AS readAt, m.deleted_at AS deletedAt, m.created_at AS createdAt,
         u.name AS senderName, u.role AS senderRole, u.avatar_file_id AS senderAvatarId
    FROM messages m JOIN users u ON u.id = m.sender_id`;

/** Conversation list. Admins see every client thread; a client sees only theirs. */
messagesRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    if (viewer.role === 'client') {
      const conversation = ensureConversationForClient(viewer.id);
      const preview = db
        .prepare(`${messageSelect} WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 1`)
        .get(conversation.id) as MessageRow | undefined;
      const unread = db
        .prepare(
          `SELECT COUNT(*) AS n FROM messages m JOIN users u ON u.id = m.sender_id
            WHERE m.conversation_id = ? AND u.role = 'admin' AND m.read_at IS NULL AND m.deleted_at IS NULL`,
        )
        .get(conversation.id) as { n: number };

      res.json({
        conversations: [
          {
            id: conversation.id,
            subject: conversation.subject,
            lastMessageAt: conversation.last_message_at,
            unread: unread.n,
            lastMessage: preview ? serializeMessage(preview) : null,
            participant: { id: 'studio', name: 'The Studio', role: 'admin', online: true, avatarUrl: null },
          },
        ],
      });
      return;
    }

    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = db
      .prepare(
        `SELECT c.id, c.subject, c.last_message_at AS lastMessageAt,
                u.id AS clientId, u.name AS clientName, u.email AS clientEmail,
                u.avatar_file_id AS clientAvatarId, u.status AS clientStatus,
                (SELECT COUNT(*) FROM messages m JOIN users s ON s.id = m.sender_id
                  WHERE m.conversation_id = c.id AND s.role = 'client'
                    AND m.read_at IS NULL AND m.deleted_at IS NULL) AS unread
           FROM conversations c JOIN users u ON u.id = c.client_id
          WHERE (? = '' OR u.name LIKE ? OR u.email LIKE ?)
          ORDER BY COALESCE(c.last_message_at, c.created_at) DESC`,
      )
      .all(search, `%${search}%`, `%${search}%`) as {
      id: string;
      subject: string | null;
      lastMessageAt: string | null;
      clientId: string;
      clientName: string;
      clientEmail: string;
      clientAvatarId: string | null;
      clientStatus: string;
      unread: number;
    }[];

    res.json({
      conversations: rows.map((row) => {
        const preview = db
          .prepare(`${messageSelect} WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 1`)
          .get(row.id) as MessageRow | undefined;
        return {
          id: row.id,
          subject: row.subject,
          lastMessageAt: row.lastMessageAt,
          unread: row.unread,
          lastMessage: preview ? serializeMessage(preview) : null,
          participant: {
            id: row.clientId,
            name: row.clientName,
            email: row.clientEmail,
            role: 'client' as const,
            status: row.clientStatus,
            avatarUrl: publicUrl(row.clientAvatarId),
            online: isOnline(row.clientId),
          },
        };
      }),
    });
  }),
);

/** Admin helper: open (or create) the thread for a specific client. */
messagesRouter.post(
  '/conversations/for-client/:clientId',
  asyncHandler(async (req, res) => {
    if (req.auth!.role !== 'admin') throw forbidden();
    const client = db
      .prepare(`SELECT id, role FROM users WHERE id = ?`)
      .get(req.params.clientId) as { id: string; role: string } | undefined;
    if (!client || client.role !== 'client') throw notFound('Client not found.');
    res.json({ conversation: ensureConversationForClient(client.id) });
  }),
);

messagesRouter.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = authorizeConversation(req.params.id, req.auth!);
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const before = typeof req.query.before === 'string' ? req.query.before : null;
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';

    const rows = db
      .prepare(
        `${messageSelect}
          WHERE m.conversation_id = @conversationId
            AND (@before IS NULL OR m.created_at < @before)
            AND (@search = '' OR m.body LIKE @like)
          ORDER BY m.created_at DESC LIMIT @limit`,
      )
      .all({
        conversationId: conversation.id,
        before,
        search,
        like: `%${search}%`,
        limit,
      }) as MessageRow[];

    res.json({
      conversation: {
        id: conversation.id,
        subject: conversation.subject,
        clientId: conversation.client_id,
      },
      messages: rows.reverse().map(serializeMessage),
      hasMore: rows.length === limit,
    });
  }),
);

const sendSchema = z.object({
  body: z.string().trim().max(5000).default(''),
  attachmentIds: z.array(z.string().uuid()).max(10).default([]),
  projectId: z.string().uuid().nullable().optional(),
});

messagesRouter.post(
  '/conversations/:id/messages',
  rateLimit({ scope: 'send-message', windowMs: 60_000, max: 60 }),
  validateBody(sendSchema),
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const conversation = authorizeConversation(req.params.id, viewer);
    const { body, attachmentIds, projectId } = req.body as z.infer<typeof sendSchema>;

    if (!body && attachmentIds.length === 0) throw badRequest('Write a message or attach a file.');

    const messageId = uuid();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, sender_id, body, project_id)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(messageId, conversation.id, viewer.id, body, projectId ?? null);

      for (const fileId of attachmentIds) {
        const file = db
          .prepare(`SELECT id, uploader_id AS uploaderId FROM files WHERE id = ?`)
          .get(fileId) as { id: string; uploaderId: string | null } | undefined;
        // Only files the sender uploaded can be attached, so ids cannot be guessed
        // to leak somebody else's artwork into a thread.
        if (!file || (file.uploaderId !== viewer.id && viewer.role !== 'admin')) {
          throw badRequest('One of the attachments is not available.');
        }
        db.prepare(`INSERT INTO message_attachments (message_id, file_id) VALUES (?, ?)`).run(
          messageId,
          fileId,
        );
        db.prepare(`UPDATE files SET conversation_id = ? WHERE id = ?`).run(conversation.id, fileId);
      }

      db.prepare(`UPDATE conversations SET last_message_at = datetime('now') WHERE id = ?`).run(
        conversation.id,
      );
    })();

    const row = db.prepare(`${messageSelect} WHERE m.id = ?`).get(messageId) as MessageRow;
    const payload = serializeMessage(row);

    emitToConversation(conversation.id, 'message:new', payload);
    track('message_sent');

    if (viewer.role === 'client') {
      notifyAdmins({
        type: 'message',
        title: `New message from ${viewer.name}`,
        body: body.slice(0, 140),
        link: `/admin/messages?conversation=${conversation.id}`,
      });
      emitToAdmins('message:new', payload);
      for (const admin of adminRecipients()) {
        sendEmailAsync({
          to: admin.email,
          template: 'new-message-admin',
          notifyKey: 'newMessage',
          email: templates.newMessage({ fromName: viewer.name, preview: body.slice(0, 200), toAdmin: true }),
        });
      }
    } else {
      notify({
        userId: conversation.client_id,
        type: 'message',
        title: 'New message from the studio',
        body: body.slice(0, 140),
        link: '/dashboard/messages',
      });
      emitToUser(conversation.client_id, 'message:new', payload);

      const client = database
        .prepare(`SELECT email FROM users WHERE id = ?`)
        .get(conversation.client_id) as { email: string } | undefined;
      if (client) {
        sendEmailAsync({
          to: client.email,
          template: 'new-message-client',
          notifyKey: 'newMessage',
          email: templates.newMessage({ fromName: viewer.name, preview: body.slice(0, 200), toAdmin: false }),
        });
      }
    }

    res.status(201).json({ message: payload });
  }),
);

messagesRouter.post(
  '/conversations/:id/read',
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const conversation = authorizeConversation(req.params.id, viewer);
    const counterRole = viewer.role === 'admin' ? 'client' : 'admin';

    db.prepare(
      `UPDATE messages SET read_at = datetime('now')
        WHERE conversation_id = ? AND read_at IS NULL
          AND sender_id IN (SELECT id FROM users WHERE role = ?)`,
    ).run(conversation.id, counterRole);

    emitToConversation(conversation.id, 'message:read', {
      conversationId: conversation.id,
      readerId: viewer.id,
      readerRole: viewer.role,
    });
    res.json({ ok: true });
  }),
);

messagesRouter.delete(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const message = db
      .prepare(`SELECT id, sender_id AS senderId, conversation_id AS conversationId FROM messages WHERE id = ?`)
      .get(req.params.id) as { id: string; senderId: string; conversationId: string } | undefined;
    if (!message) throw notFound('Message not found.');
    if (message.senderId !== viewer.id && viewer.role !== 'admin') {
      throw forbidden('You can only delete your own messages.');
    }

    // Soft delete keeps the thread order intact and leaves an audit trail.
    db.prepare(`UPDATE messages SET deleted_at = datetime('now'), body = '' WHERE id = ?`).run(message.id);
    emitToConversation(message.conversationId, 'message:deleted', { id: message.id });
    logActivity({
      actorId: viewer.id,
      actorType: viewer.role === 'admin' ? 'admin' : 'client',
      action: 'message.deleted',
      entityType: 'message',
      entityId: message.id,
    });
    res.json({ ok: true });
  }),
);

messagesRouter.post(
  '/messages/:id/report',
  rateLimit({ scope: 'report', windowMs: 60 * 60_000, max: 20 }),
  validateBody(z.object({ reason: z.string().trim().min(4).max(600) })),
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const message = db
      .prepare(`SELECT id, conversation_id AS conversationId FROM messages WHERE id = ?`)
      .get(req.params.id) as { id: string; conversationId: string } | undefined;
    if (!message) throw notFound('Message not found.');
    authorizeConversation(message.conversationId, viewer);

    db.prepare(
      `INSERT INTO message_reports (id, message_id, reporter_id, reason) VALUES (?, ?, ?, ?)`,
    ).run(uuid(), message.id, viewer.id, (req.body as { reason: string }).reason);

    notifyAdmins({
      type: 'system',
      title: 'A message was reported',
      body: (req.body as { reason: string }).reason.slice(0, 140),
      link: '/admin/messages',
    });
    res.status(201).json({ ok: true });
  }),
);

/** Uploads an attachment before it is referenced by a message. */
messagesRouter.post(
  '/attachments',
  rateLimit({ scope: 'attachment', windowMs: 60_000, max: 30 }),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No file received.');

    const stored = files.map((file) =>
      recordFile({ file, uploaderId: req.auth!.id, kind: 'attachment', visibility: 'private' }),
    );
    res.status(201).json({
      files: stored.map((file) => ({
        id: file.id,
        name: file.original_name,
        mimeType: file.mime_type,
        size: file.size_bytes,
        url: publicUrl(file.id),
      })),
    });
  }),
);
