import { db } from '../db/index.js';
import { uuid } from '../lib/ids.js';
import { emitToAdmins, emitToUser } from '../realtime/index.js';

export type NotificationType =
  | 'project_request'
  | 'message'
  | 'revision_request'
  | 'project_status'
  | 'design_approved'
  | 'delivery'
  | 'file_upload'
  | 'system';

export interface NotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

const insert = db.prepare(
  `INSERT INTO notifications (id, user_id, type, title, body, link)
   VALUES (@id, @userId, @type, @title, @body, @link)`,
);
const adminIds = db.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active'`);

export function notify(input: NotificationInput) {
  const record = {
    id: uuid(),
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  };
  insert.run(record);
  emitToUser(input.userId, 'notification:new', { ...record, createdAt: new Date().toISOString() });
  return record;
}

/** Fans a notification out to every active administrator. */
export function notifyAdmins(input: Omit<NotificationInput, 'userId'>): void {
  const admins = adminIds.all() as { id: string }[];
  for (const admin of admins) notify({ ...input, userId: admin.id });
  emitToAdmins('admin:activity', { type: input.type, title: input.title, link: input.link });
}

export function unreadCount(userId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`)
    .get(userId) as { n: number };
  return row.n;
}
