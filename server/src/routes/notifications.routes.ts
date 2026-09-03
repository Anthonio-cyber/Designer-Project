import { Router } from 'express';
import { db } from '../db/index.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { unreadForUser } from '../services/messaging.service.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const onlyUnread = req.query.unread === 'true';
    const rows = db
      .prepare(
        `SELECT id, type, title, body, link, read_at AS readAt, created_at AS createdAt
           FROM notifications
          WHERE user_id = ? AND (? = 0 OR read_at IS NULL)
          ORDER BY created_at DESC LIMIT 100`,
      )
      .all(req.auth!.id, onlyUnread ? 1 : 0);

    const unread = (
      db
        .prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`)
        .get(req.auth!.id) as { n: number }
    ).n;

    res.json({
      notifications: rows,
      unread,
      unreadMessages: unreadForUser(req.auth!.id, req.auth!.role),
    });
  }),
);

notificationsRouter.post(
  '/:id/read',
  asyncHandler(async (req, res) => {
    db.prepare(
      `UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ? AND read_at IS NULL`,
    ).run(req.params.id, req.auth!.id);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    db.prepare(
      `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`,
    ).run(req.auth!.id);
    res.json({ ok: true });
  }),
);

notificationsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    db.prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`).run(req.params.id, req.auth!.id);
    res.json({ ok: true });
  }),
);
