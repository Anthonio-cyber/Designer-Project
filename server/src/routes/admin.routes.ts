import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest, notFound } from '../lib/errors.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { publicUrl } from '../services/storage.service.js';
import { series, totalFor } from '../services/analytics.service.js';
import { isOnline } from '../realtime/index.js';
import { ensureConversationForClient } from '../services/messaging.service.js';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const count = (sql: string, ...params: unknown[]): number =>
  (db.prepare(sql).get(...params) as { n: number }).n;

adminRouter.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const stats = {
      totalProjects: count(`SELECT COUNT(*) AS n FROM client_projects`),
      activeProjects: count(
        `SELECT COUNT(*) AS n FROM client_projects WHERE status IN ('discussion','designing','review')`,
      ),
      completedProjects: count(`SELECT COUNT(*) AS n FROM client_projects WHERE status = 'completed'`),
      totalClients: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'client'`),
      activeClients: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'client' AND status = 'active'`),
      unreadMessages: count(
        `SELECT COUNT(*) AS n FROM messages m JOIN users u ON u.id = m.sender_id
          WHERE u.role = 'client' AND m.read_at IS NULL AND m.deleted_at IS NULL`,
      ),
      pendingRequests: count(`SELECT COUNT(*) AS n FROM project_requests WHERE status IN ('new','reviewing')`),
      openRevisions: count(`SELECT COUNT(*) AS n FROM revisions WHERE status = 'open'`),
      portfolioProjects: count(`SELECT COUNT(*) AS n FROM portfolio_projects`),
      publishedProjects: count(
        `SELECT COUNT(*) AS n FROM portfolio_projects WHERE status = 'published' AND visibility = 'public'`,
      ),
      portfolioViews: (
        db.prepare(`SELECT COALESCE(SUM(views), 0) AS n FROM portfolio_projects`).get() as { n: number }
      ).n,
      viewsLast30: totalFor('portfolio_view', 30),
      requestsLast30: totalFor('project_request', 30),
    };

    const recentRequests = db
      .prepare(
        `SELECT id, name, email, project_type AS projectType, status, created_at AS createdAt
           FROM project_requests ORDER BY created_at DESC LIMIT 5`,
      )
      .all();
    const recentProjects = db
      .prepare(
        `SELECT p.id, p.code, p.title, p.status, p.progress, p.updated_at AS updatedAt, u.name AS clientName
           FROM client_projects p JOIN users u ON u.id = p.client_id
          ORDER BY p.updated_at DESC LIMIT 5`,
      )
      .all();
    const recentActivity = db
      .prepare(
        `SELECT a.id, a.action, a.actor_type AS actorType, a.entity_type AS entityType,
                a.entity_id AS entityId, a.meta, a.created_at AS createdAt, u.name AS actorName
           FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id
          ORDER BY a.created_at DESC LIMIT 8`,
      )
      .all();

    res.json({ stats, recentRequests, recentProjects, recentActivity });
  }),
);

adminRouter.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const days = Math.min(Math.max(Number.parseInt(String(req.query.days ?? '30'), 10) || 30, 7), 365);

    const topProjects = db
      .prepare(
        `SELECT p.id, p.title, p.slug, p.views, c.name AS categoryName
           FROM portfolio_projects p LEFT JOIN portfolio_categories c ON c.id = p.category_id
          WHERE p.status = 'published' ORDER BY p.views DESC LIMIT 8`,
      )
      .all();

    const categoryBreakdown = db
      .prepare(
        `SELECT c.id, c.name, COUNT(p.id) AS projects, COALESCE(SUM(p.views), 0) AS views
           FROM portfolio_categories c LEFT JOIN portfolio_projects p ON p.category_id = c.id
          GROUP BY c.id ORDER BY views DESC`,
      )
      .all();

    const projectsByStatus = db
      .prepare(`SELECT status, COUNT(*) AS count FROM client_projects GROUP BY status`)
      .all();

    const newClients = db
      .prepare(
        `SELECT date(created_at) AS day, COUNT(*) AS count FROM users
          WHERE role = 'client' AND created_at >= date('now', ?) GROUP BY day ORDER BY day`,
      )
      .all(`-${days} days`);

    res.json({
      days,
      series: {
        portfolioViews: series('portfolio_view', days),
        requests: series('project_request', days),
        messages: series('message_sent', days),
        completed: series('project_completed', days),
      },
      topProjects,
      categoryBreakdown,
      projectsByStatus,
      newClients,
      totals: {
        views: totalFor('portfolio_view', days),
        requests: totalFor('project_request', days),
        messages: totalFor('message_sent', days),
        completed: totalFor('project_completed', days),
      },
    });
  }),
);

// ----------------------------------------------------------------- clients ---

const CLIENT_SELECT = `
  SELECT u.id, u.name, u.email, u.status, u.created_at AS createdAt, u.last_seen_at AS lastSeenAt,
         u.avatar_file_id AS avatarFileId, p.company, p.phone, p.location,
         (SELECT COUNT(*) FROM client_projects cp WHERE cp.client_id = u.id) AS totalProjects,
         (SELECT COUNT(*) FROM client_projects cp WHERE cp.client_id = u.id
            AND cp.status IN ('discussion','designing','review')) AS activeProjects,
         (SELECT COUNT(*) FROM client_projects cp WHERE cp.client_id = u.id AND cp.status = 'completed') AS completedProjects,
         (SELECT COUNT(*) FROM project_requests r WHERE r.user_id = u.id) AS totalRequests,
         (SELECT m.body FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.client_id = u.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS lastMessage,
         (SELECT m.created_at FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.client_id = u.id ORDER BY m.created_at DESC LIMIT 1) AS lastMessageAt
    FROM users u LEFT JOIN profiles p ON p.user_id = u.id
   WHERE u.role = 'client'`;

adminRouter.get(
  '/clients',
  asyncHandler(async (req, res) => {
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const rows = db
      .prepare(
        `${CLIENT_SELECT}
           AND (@search = '' OR u.name LIKE @like OR u.email LIKE @like)
           AND (@status = '' OR u.status = @status)
         ORDER BY u.created_at DESC LIMIT 300`,
      )
      .all({ search, like: `%${search}%`, status }) as Record<string, unknown>[];

    res.json({
      clients: rows.map((row) => ({
        ...row,
        avatarUrl: publicUrl(row.avatarFileId as string | null),
        online: isOnline(row.id as string),
      })),
    });
  }),
);

adminRouter.get(
  '/clients/:id',
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${CLIENT_SELECT} AND u.id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw notFound('Client not found.');

    const projects = db
      .prepare(
        `SELECT id, code, title, status, progress, created_at AS createdAt, updated_at AS updatedAt
           FROM client_projects WHERE client_id = ? ORDER BY updated_at DESC`,
      )
      .all(req.params.id);
    const requests = db
      .prepare(
        `SELECT id, project_type AS projectType, status, description, created_at AS createdAt
           FROM project_requests WHERE user_id = ? OR email = ? ORDER BY created_at DESC`,
      )
      .all(req.params.id, row.email);
    const files = db
      .prepare(
        `SELECT f.id, f.original_name AS name, f.mime_type AS mimeType, f.size_bytes AS size, f.created_at AS createdAt
           FROM files f WHERE f.uploader_id = ? ORDER BY f.created_at DESC LIMIT 50`,
      )
      .all(req.params.id) as Record<string, unknown>[];

    res.json({
      client: {
        ...row,
        avatarUrl: publicUrl(row.avatarFileId as string | null),
        online: isOnline(row.id as string),
      },
      projects,
      requests,
      files: files.map((file) => ({ ...file, url: publicUrl(file.id as string) })),
      conversation: ensureConversationForClient(req.params.id),
    });
  }),
);

adminRouter.patch(
  '/clients/:id',
  validateBody(z.object({ status: z.enum(['active', 'blocked', 'deactivated']) })),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: 'active' | 'blocked' | 'deactivated' };
    const client = db
      .prepare(`SELECT id, name, role FROM users WHERE id = ?`)
      .get(req.params.id) as { id: string; name: string; role: string } | undefined;
    if (!client) throw notFound('Client not found.');
    if (client.role === 'admin') throw badRequest('Administrator accounts cannot be changed here.');

    db.transaction(() => {
      db.prepare(`UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, client.id);
      // Blocking or deactivating immediately kills every open session.
      if (status !== 'active') {
        db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ?`).run(client.id);
      }
    })();

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: `client.${status}`,
      entityType: 'user',
      entityId: client.id,
      meta: { name: client.name },
    });
    res.json({ ok: true, status });
  }),
);

// ------------------------------------------------------------ activity log ---

adminRouter.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number.parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
    const actorType = typeof req.query.actorType === 'string' ? req.query.actorType : '';
    const rows = db
      .prepare(
        `SELECT a.id, a.action, a.actor_type AS actorType, a.entity_type AS entityType,
                a.entity_id AS entityId, a.meta, a.created_at AS createdAt, u.name AS actorName
           FROM activity_logs a LEFT JOIN users u ON u.id = a.actor_id
          WHERE (@actorType = '' OR a.actor_type = @actorType)
          ORDER BY a.created_at DESC LIMIT @limit`,
      )
      .all({ actorType, limit });
    res.json({ activity: rows });
  }),
);

// --------------------------------------------------------------- reporting ---

adminRouter.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    const reports = db
      .prepare(
        `SELECT r.id, r.reason, r.status, r.created_at AS createdAt,
                u.name AS reporterName, m.body AS messageBody, m.conversation_id AS conversationId
           FROM message_reports r
           JOIN users u ON u.id = r.reporter_id
           JOIN messages m ON m.id = r.message_id
          ORDER BY r.created_at DESC LIMIT 100`,
      )
      .all();
    res.json({ reports });
  }),
);
