import { Router } from 'express';
import { z } from 'zod';
import { db, json } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { projectCode, uuid } from '../lib/ids.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { notify, notifyAdmins } from '../services/notifications.service.js';
import { publicUrl } from '../services/storage.service.js';
import { track } from '../services/analytics.service.js';
import { adminRecipients, sendEmailAsync, templates } from '../services/email/index.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

export const PROJECT_STATUSES = [
  'request_received',
  'discussion',
  'designing',
  'review',
  'completed',
  'cancelled',
] as const;

const PROGRESS_BY_STATUS: Record<string, number> = {
  request_received: 10,
  discussion: 30,
  designing: 55,
  review: 80,
  completed: 100,
  cancelled: 0,
};

const SELECT = `
  SELECT p.id, p.code, p.client_id AS clientId, p.request_id AS requestId, p.service_id AS serviceId,
         p.title, p.description, p.status, p.budget, p.deadline, p.progress,
         p.created_at AS createdAt, p.updated_at AS updatedAt, p.completed_at AS completedAt,
         u.name AS clientName, u.email AS clientEmail, u.avatar_file_id AS clientAvatarId,
         s.name AS serviceName
    FROM client_projects p
    JOIN users u ON u.id = p.client_id
    LEFT JOIN services s ON s.id = p.service_id`;

function serializeProject(row: Record<string, unknown>) {
  const id = row.id as string;
  const timeline = db
    .prepare(
      `SELECT id, status, note, created_at AS createdAt FROM project_status_events
        WHERE project_id = ? ORDER BY created_at ASC`,
    )
    .all(id);
  const deliveries = db
    .prepare(
      `SELECT id, version, title, note, file_ids AS fileIds, status, created_at AS createdAt, responded_at AS respondedAt
         FROM deliveries WHERE project_id = ? ORDER BY version DESC`,
    )
    .all(id) as Record<string, unknown>[];
  const files = db
    .prepare(
      `SELECT f.id, f.original_name AS name, f.mime_type AS mimeType, f.size_bytes AS size,
              f.kind, f.created_at AS createdAt, u.name AS uploaderName
         FROM files f LEFT JOIN users u ON u.id = f.uploader_id
        WHERE f.project_id = ? ORDER BY f.created_at DESC`,
    )
    .all(id) as Record<string, unknown>[];
  const revisions = db
    .prepare(
      `SELECT r.id, r.delivery_id AS deliveryId, r.message, r.file_ids AS fileIds, r.status,
              r.created_at AS createdAt, r.resolved_at AS resolvedAt, u.name AS clientName
         FROM revisions r JOIN users u ON u.id = r.client_id
        WHERE r.project_id = ? ORDER BY r.created_at DESC`,
    )
    .all(id) as Record<string, unknown>[];

  const withFiles = (entries: Record<string, unknown>[]) =>
    entries.map((entry) => {
      const ids = json<string[]>(entry.fileIds, []);
      return {
        ...entry,
        fileIds: ids,
        files: ids
          .map((fileId) =>
            db
              .prepare(
                `SELECT id, original_name AS name, mime_type AS mimeType, size_bytes AS size FROM files WHERE id = ?`,
              )
              .get(fileId),
          )
          .filter(Boolean)
          .map((file) => ({ ...(file as object), url: publicUrl((file as { id: string }).id) })),
      };
    });

  return {
    ...row,
    clientAvatarUrl: publicUrl(row.clientAvatarId as string | null),
    timeline,
    deliveries: withFiles(deliveries),
    revisions: withFiles(revisions),
    files: files.map((file) => ({ ...file, url: publicUrl(file.id as string) })),
  };
}

/** Enforces that a client can only reach their own project. */
function authorizeProject(id: string, viewer: { id: string; role: 'client' | 'admin' }) {
  const row = db.prepare(`${SELECT} WHERE p.id = ? OR p.code = ?`).get(id, id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw notFound('Project not found.');
  if (viewer.role !== 'admin' && row.clientId !== viewer.id) {
    throw forbidden('This project belongs to another client.');
  }
  return row;
}

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const clientId = typeof req.query.clientId === 'string' ? req.query.clientId : '';

    const rows = db
      .prepare(
        `${SELECT}
          WHERE (@viewerRole = 'admin' OR p.client_id = @viewerId)
            AND (@clientId = '' OR p.client_id = @clientId)
            AND (@status = '' OR p.status = @status)
            AND (@search = '' OR p.title LIKE @like OR p.code LIKE @like OR u.name LIKE @like)
          ORDER BY p.updated_at DESC LIMIT 200`,
      )
      .all({
        viewerRole: viewer.role,
        viewerId: viewer.id,
        clientId,
        status,
        search,
        like: `%${search}%`,
      }) as Record<string, unknown>[];

    res.json({
      projects: rows.map((row) => ({ ...row, clientAvatarUrl: publicUrl(row.clientAvatarId as string | null) })),
    });
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ project: serializeProject(authorizeProject(req.params.id, req.auth!)) });
  }),
);

const createSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(2).max(140),
  description: z.string().trim().max(6000).optional(),
  serviceId: z.string().uuid().nullable().optional(),
  budget: z.string().trim().max(60).optional(),
  deadline: z.string().trim().max(60).optional(),
});

projectsRouter.post(
  '/',
  requireAdmin,
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createSchema>;
    const client = db
      .prepare(`SELECT id, role FROM users WHERE id = ?`)
      .get(input.clientId) as { id: string; role: string } | undefined;
    if (!client || client.role !== 'client') throw badRequest('Choose a valid client account.');

    const id = uuid();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO client_projects (id, code, client_id, service_id, title, description, budget, deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        projectCode(),
        input.clientId,
        input.serviceId ?? null,
        input.title,
        input.description ?? null,
        input.budget ?? null,
        input.deadline ?? null,
      );
      db.prepare(
        `INSERT INTO project_status_events (id, project_id, status, note, actor_id)
         VALUES (?, ?, 'request_received', 'Project created', ?)`,
      ).run(uuid(), id, req.auth!.id);
    })();

    notify({
      userId: input.clientId,
      type: 'project_status',
      title: 'A new project was opened for you',
      body: input.title,
      link: `/dashboard/projects/${id}`,
    });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'project.created',
      entityType: 'client_project',
      entityId: id,
      meta: { title: input.title },
    });
    res.status(201).json({ project: serializeProject(db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as Record<string, unknown>) });
  }),
);

projectsRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(
    z.object({
      title: z.string().trim().min(2).max(140).optional(),
      description: z.string().trim().max(6000).nullable().optional(),
      status: z.enum(PROJECT_STATUSES).optional(),
      statusNote: z.string().trim().max(500).optional(),
      budget: z.string().trim().max(60).nullable().optional(),
      deadline: z.string().trim().max(60).nullable().optional(),
      progress: z.number().int().min(0).max(100).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const project = authorizeProject(req.params.id, req.auth!);
    const input = req.body as {
      title?: string;
      description?: string | null;
      status?: (typeof PROJECT_STATUSES)[number];
      statusNote?: string;
      budget?: string | null;
      deadline?: string | null;
      progress?: number;
    };
    const id = project.id as string;
    const statusChanged = input.status && input.status !== project.status;

    db.transaction(() => {
      db.prepare(
        `UPDATE client_projects SET
           title = COALESCE(@title, title),
           description = COALESCE(@description, description),
           status = COALESCE(@status, status),
           budget = COALESCE(@budget, budget),
           deadline = COALESCE(@deadline, deadline),
           progress = COALESCE(@progress, progress),
           completed_at = CASE WHEN @status = 'completed' THEN datetime('now') ELSE completed_at END,
           updated_at = datetime('now')
         WHERE id = @id`,
      ).run({
        id,
        title: input.title ?? null,
        description: input.description ?? null,
        status: input.status ?? null,
        budget: input.budget ?? null,
        deadline: input.deadline ?? null,
        progress: input.progress ?? (input.status ? PROGRESS_BY_STATUS[input.status] : null),
      });

      if (statusChanged) {
        db.prepare(
          `INSERT INTO project_status_events (id, project_id, status, note, actor_id) VALUES (?, ?, ?, ?, ?)`,
        ).run(uuid(), id, input.status, input.statusNote ?? null, req.auth!.id);
      }
    })();

    if (statusChanged) {
      if (input.status === 'completed') track('project_completed');
      notify({
        userId: project.clientId as string,
        type: 'project_status',
        title: `Project status: ${String(input.status).replace(/_/g, ' ')}`,
        body: input.statusNote ?? project.title as string,
        link: `/dashboard/projects/${id}`,
      });

      const statusRecipient = db
        .prepare(`SELECT email FROM users WHERE id = ?`)
        .get(project.clientId) as { email: string } | undefined;
      if (statusRecipient) {
        sendEmailAsync({
          to: statusRecipient.email,
          template: 'project-status',
          notifyKey: 'projectStatus',
          email: templates.projectStatus({
            title: project.title as string,
            status: input.status as string,
            note: input.statusNote,
            projectId: id,
          }),
        });
      }
      logActivity({
        actorId: req.auth!.id,
        actorType: 'admin',
        action: 'project.status_changed',
        entityType: 'client_project',
        entityId: id,
        meta: { from: project.status, to: input.status },
      });
    }

    res.json({ project: serializeProject(db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as Record<string, unknown>) });
  }),
);

// ------------------------------------------------------------- deliveries ---

projectsRouter.post(
  '/:id/deliveries',
  requireAdmin,
  validateBody(
    z.object({
      title: z.string().trim().min(2).max(140),
      note: z.string().trim().max(2000).optional(),
      fileIds: z.array(z.string().uuid()).min(1, 'Attach at least one design file.').max(20),
    }),
  ),
  asyncHandler(async (req, res) => {
    const project = authorizeProject(req.params.id, req.auth!);
    const input = req.body as { title: string; note?: string; fileIds: string[] };
    const id = project.id as string;

    const nextVersion =
      ((db.prepare(`SELECT MAX(version) AS v FROM deliveries WHERE project_id = ?`).get(id) as { v: number | null }).v ?? 0) + 1;

    const deliveryId = uuid();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO deliveries (id, project_id, version, title, note, file_ids) VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(deliveryId, id, nextVersion, input.title, input.note ?? null, JSON.stringify(input.fileIds));

      for (const fileId of input.fileIds) {
        db.prepare(`UPDATE files SET project_id = ?, kind = 'deliverable' WHERE id = ?`).run(id, fileId);
      }
      db.prepare(
        `UPDATE client_projects SET status = 'review', progress = 80, updated_at = datetime('now') WHERE id = ?`,
      ).run(id);
      db.prepare(
        `INSERT INTO project_status_events (id, project_id, status, note, actor_id)
         VALUES (?, ?, 'review', ?, ?)`,
      ).run(uuid(), id, `Design v${nextVersion} sent for review`, req.auth!.id);
    })();

    notify({
      userId: project.clientId as string,
      type: 'delivery',
      title: `New design ready for review: ${input.title}`,
      body: 'Approve it or request a revision from your project page.',
      link: `/dashboard/projects/${id}`,
    });

    const deliveryRecipient = db
      .prepare(`SELECT email FROM users WHERE id = ?`)
      .get(project.clientId) as { email: string } | undefined;
    if (deliveryRecipient) {
      sendEmailAsync({
        to: deliveryRecipient.email,
        template: 'delivery-ready',
        notifyKey: 'delivery',
        email: templates.deliveryReady({
          title: input.title,
          version: nextVersion,
          projectId: id,
          note: input.note,
        }),
      });
    }
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'delivery.sent',
      entityType: 'delivery',
      entityId: deliveryId,
      meta: { projectId: id, version: nextVersion },
    });

    res.status(201).json({ project: serializeProject(db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as Record<string, unknown>) });
  }),
);

projectsRouter.post(
  '/:id/deliveries/:deliveryId/approve',
  asyncHandler(async (req, res) => {
    const project = authorizeProject(req.params.id, req.auth!);
    if (req.auth!.role !== 'client') throw forbidden('Only the client can approve a design.');

    const delivery = db
      .prepare(`SELECT id, status, title FROM deliveries WHERE id = ? AND project_id = ?`)
      .get(req.params.deliveryId, project.id) as { id: string; status: string; title: string } | undefined;
    if (!delivery) throw notFound('Design not found.');
    if (delivery.status !== 'pending') throw badRequest('This design has already been answered.');

    db.transaction(() => {
      db.prepare(
        `UPDATE deliveries SET status = 'approved', responded_at = datetime('now') WHERE id = ?`,
      ).run(delivery.id);
      db.prepare(
        `UPDATE client_projects SET status = 'completed', progress = 100,
                completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
      ).run(project.id);
      db.prepare(
        `INSERT INTO project_status_events (id, project_id, status, note, actor_id)
         VALUES (?, ?, 'completed', 'Client approved the design', ?)`,
      ).run(uuid(), project.id, req.auth!.id);
    })();

    track('project_completed');
    notifyAdmins({
      type: 'design_approved',
      title: `${req.auth!.name} approved "${delivery.title}"`,
      link: `/admin/projects/${project.id}`,
    });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'client',
      action: 'delivery.approved',
      entityType: 'delivery',
      entityId: delivery.id,
    });

    res.json({ project: serializeProject(db.prepare(`${SELECT} WHERE p.id = ?`).get(project.id) as Record<string, unknown>) });
  }),
);

projectsRouter.post(
  '/:id/deliveries/:deliveryId/revisions',
  validateBody(
    z.object({
      message: z.string().trim().min(5, 'Tell the designer what to change.').max(3000),
      fileIds: z.array(z.string().uuid()).max(10).default([]),
    }),
  ),
  asyncHandler(async (req, res) => {
    const project = authorizeProject(req.params.id, req.auth!);
    if (req.auth!.role !== 'client') throw forbidden('Only the client can request a revision.');

    const delivery = db
      .prepare(`SELECT id, status, title FROM deliveries WHERE id = ? AND project_id = ?`)
      .get(req.params.deliveryId, project.id) as { id: string; status: string; title: string } | undefined;
    if (!delivery) throw notFound('Design not found.');
    if (delivery.status === 'approved') throw badRequest('This design has already been approved.');

    const input = req.body as { message: string; fileIds: string[] };
    const revisionId = uuid();

    db.transaction(() => {
      db.prepare(
        `INSERT INTO revisions (id, delivery_id, project_id, client_id, message, file_ids)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(revisionId, delivery.id, project.id, req.auth!.id, input.message, JSON.stringify(input.fileIds));
      db.prepare(
        `UPDATE deliveries SET status = 'revision_requested', responded_at = datetime('now') WHERE id = ?`,
      ).run(delivery.id);
      db.prepare(
        `UPDATE client_projects SET status = 'designing', progress = 55, updated_at = datetime('now') WHERE id = ?`,
      ).run(project.id);
      db.prepare(
        `INSERT INTO project_status_events (id, project_id, status, note, actor_id)
         VALUES (?, ?, 'designing', 'Client requested a revision', ?)`,
      ).run(uuid(), project.id, req.auth!.id);
      for (const fileId of input.fileIds) {
        db.prepare(`UPDATE files SET project_id = ?, kind = 'reference' WHERE id = ?`).run(project.id, fileId);
      }
    })();

    notifyAdmins({
      type: 'revision_request',
      title: `${req.auth!.name} requested a revision`,
      body: input.message.slice(0, 140),
      link: `/admin/projects/${project.id}`,
    });
    for (const admin of adminRecipients()) {
      sendEmailAsync({
        to: admin.email,
        template: 'revision-requested',
        notifyKey: 'revision',
        email: templates.revisionRequested({
          clientName: req.auth!.name,
          message: input.message,
          projectId: project.id as string,
        }),
      });
    }
    logActivity({
      actorId: req.auth!.id,
      actorType: 'client',
      action: 'revision.requested',
      entityType: 'revision',
      entityId: revisionId,
      meta: { projectId: project.id },
    });

    res.status(201).json({ project: serializeProject(db.prepare(`${SELECT} WHERE p.id = ?`).get(project.id) as Record<string, unknown>) });
  }),
);

projectsRouter.post(
  '/:id/revisions/:revisionId/resolve',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const project = authorizeProject(req.params.id, req.auth!);
    db.prepare(
      `UPDATE revisions SET status = 'resolved', resolved_at = datetime('now') WHERE id = ? AND project_id = ?`,
    ).run(req.params.revisionId, project.id);
    res.json({ project: serializeProject(db.prepare(`${SELECT} WHERE p.id = ?`).get(project.id) as Record<string, unknown>) });
  }),
);
