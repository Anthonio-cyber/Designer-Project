import { Router } from 'express';
import { z } from 'zod';
import { db, json } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { projectCode, uuid } from '../lib/ids.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { notify, notifyAdmins } from '../services/notifications.service.js';
import { track } from '../services/analytics.service.js';
import { publicUrl, recordFile, upload } from '../services/storage.service.js';
import { ensureConversationForClient } from '../services/messaging.service.js';

export const requestsRouter = Router();

const requestSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name.').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  projectType: z.string().trim().max(80).optional(),
  serviceId: z.string().uuid().nullable().optional(),
  budgetRange: z.string().trim().max(60).optional(),
  deadline: z.string().trim().max(60).optional(),
  preferredStyle: z.string().trim().max(200).optional(),
  brandName: z.string().trim().max(120).optional(),
  colors: z.string().trim().max(200).optional(),
  dimensions: z.string().trim().max(120).optional(),
  targetAudience: z.string().trim().max(300).optional(),
  description: z.string().trim().min(20, 'Please describe your design in at least 20 characters.').max(6000),
  styleExampleNote: z.string().trim().max(1000).optional(),
  referenceFileIds: z.array(z.string().uuid()).max(10).default([]),
  inspirationProjectId: z.string().uuid().nullable().optional(),
});

const SELECT = `
  SELECT r.id, r.user_id AS userId, r.name, r.email, r.project_type AS projectType,
         r.budget_range AS budgetRange, r.deadline, r.preferred_style AS preferredStyle,
         r.brand_name AS brandName, r.colors, r.dimensions, r.target_audience AS targetAudience,
         r.description, r.style_example_note AS styleExampleNote, r.reference_file_ids AS referenceFileIds,
         r.inspiration_project_id AS inspirationProjectId, r.service_id AS serviceId,
         r.status, r.admin_notes AS adminNotes, r.converted_project_id AS convertedProjectId,
         r.created_at AS createdAt, r.updated_at AS updatedAt,
         p.title AS inspirationTitle, p.slug AS inspirationSlug, s.name AS serviceName,
         u.name AS accountName
    FROM project_requests r
    LEFT JOIN portfolio_projects p ON p.id = r.inspiration_project_id
    LEFT JOIN services s ON s.id = r.service_id
    LEFT JOIN users u ON u.id = r.user_id`;

function serializeRequest(row: Record<string, unknown>) {
  const fileIds = json<string[]>(row.referenceFileIds, []);
  const files = fileIds
    .map((id) =>
      db
        .prepare(`SELECT id, original_name AS name, mime_type AS mimeType, size_bytes AS size FROM files WHERE id = ?`)
        .get(id),
    )
    .filter(Boolean)
    .map((file) => ({ ...(file as object), url: publicUrl((file as { id: string }).id) }));

  return { ...row, referenceFileIds: fileIds, referenceFiles: files };
}

/** Public endpoint — a visitor can send a brief without an account. */
requestsRouter.post(
  '/',
  rateLimit({ scope: 'project-request', windowMs: 60 * 60_000, max: 8, message: 'You have sent several requests already. Please wait before sending another.' }),
  validateBody(requestSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof requestSchema>;
    const id = uuid();

    // Signed-in clients are linked automatically so the request shows in their dashboard.
    const userId = req.auth?.role === 'client' ? req.auth.id : null;

    db.prepare(
      `INSERT INTO project_requests
        (id, user_id, name, email, project_type, budget_range, deadline, preferred_style, brand_name,
         colors, dimensions, target_audience, description, style_example_note, reference_file_ids,
         inspiration_project_id, service_id)
       VALUES (@id, @userId, @name, @email, @projectType, @budgetRange, @deadline, @preferredStyle, @brandName,
               @colors, @dimensions, @targetAudience, @description, @styleExampleNote, @referenceFileIds,
               @inspirationProjectId, @serviceId)`,
    ).run({
      id,
      userId,
      name: input.name,
      email: input.email,
      projectType: input.projectType ?? null,
      budgetRange: input.budgetRange ?? null,
      deadline: input.deadline ?? null,
      preferredStyle: input.preferredStyle ?? null,
      brandName: input.brandName ?? null,
      colors: input.colors ?? null,
      dimensions: input.dimensions ?? null,
      targetAudience: input.targetAudience ?? null,
      description: input.description,
      styleExampleNote: input.styleExampleNote ?? null,
      referenceFileIds: JSON.stringify(input.referenceFileIds),
      inspirationProjectId: input.inspirationProjectId ?? null,
      serviceId: input.serviceId ?? null,
    });

    track('project_request');
    notifyAdmins({
      type: 'project_request',
      title: `New project request from ${input.name}`,
      body: input.description.slice(0, 140),
      link: `/admin/requests/${id}`,
    });
    logActivity({
      actorId: userId,
      actorType: userId ? 'client' : 'visitor',
      action: 'request.submitted',
      entityType: 'project_request',
      entityId: id,
      meta: { email: input.email },
    });

    res.status(201).json({
      ok: true,
      requestId: id,
      message: 'Your project request has been sent successfully.',
    });
  }),
);

/** Reference uploads are open to visitors but tightly rate limited. */
requestsRouter.post(
  '/references',
  rateLimit({ scope: 'request-upload', windowMs: 60 * 60_000, max: 30 }),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No file received.');

    const stored = files.map((file) =>
      recordFile({ file, uploaderId: req.auth?.id ?? null, kind: 'reference', visibility: 'private' }),
    );
    res.status(201).json({
      files: stored.map((file) => ({
        id: file.id,
        name: file.original_name,
        mimeType: file.mime_type,
        size: file.size_bytes,
      })),
    });
  }),
);

/** A client's own requests. */
requestsRouter.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare(`${SELECT} WHERE r.user_id = ? OR r.email = ? ORDER BY r.created_at DESC`)
      .all(req.auth!.id, req.auth!.email) as Record<string, unknown>[];
    res.json({ requests: rows.map(serializeRequest) });
  }),
);

requestsRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const rows = db
      .prepare(
        `${SELECT}
          WHERE (@status = '' OR r.status = @status)
            AND (@search = '' OR r.name LIKE @like OR r.email LIKE @like OR r.description LIKE @like)
          ORDER BY r.created_at DESC LIMIT 200`,
      )
      .all({ status, search, like: `%${search}%` }) as Record<string, unknown>[];
    res.json({ requests: rows.map(serializeRequest) });
  }),
);

requestsRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${SELECT} WHERE r.id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw notFound('Request not found.');
    if (req.auth!.role !== 'admin' && row.userId !== req.auth!.id && row.email !== req.auth!.email) {
      throw forbidden('This request belongs to another client.');
    }
    res.json({ request: serializeRequest(row) });
  }),
);

requestsRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(
    z.object({
      status: z.enum(['new', 'reviewing', 'converted', 'declined']).optional(),
      adminNotes: z.string().trim().max(4000).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const existing = db.prepare(`SELECT id FROM project_requests WHERE id = ?`).get(req.params.id);
    if (!existing) throw notFound('Request not found.');

    const input = req.body as { status?: string; adminNotes?: string | null };
    db.prepare(
      `UPDATE project_requests
          SET status = COALESCE(@status, status),
              admin_notes = COALESCE(@adminNotes, admin_notes),
              updated_at = datetime('now')
        WHERE id = @id`,
    ).run({ id: req.params.id, status: input.status ?? null, adminNotes: input.adminNotes ?? null });

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'request.updated',
      entityType: 'project_request',
      entityId: req.params.id,
      meta: { status: input.status },
    });
    res.json({ request: serializeRequest(db.prepare(`${SELECT} WHERE r.id = ?`).get(req.params.id) as Record<string, unknown>) });
  }),
);

/** Turns an accepted brief into a tracked client project. */
requestsRouter.post(
  '/:id/convert',
  requireAdmin,
  validateBody(
    z.object({
      title: z.string().trim().min(2).max(140).optional(),
      clientId: z.string().uuid().optional(),
      budget: z.string().trim().max(60).optional(),
      deadline: z.string().trim().max(60).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const request = db
      .prepare(
        `SELECT id, user_id AS userId, email, name, description, project_type AS projectType,
                budget_range AS budgetRange, deadline, service_id AS serviceId, converted_project_id AS convertedProjectId
           FROM project_requests WHERE id = ?`,
      )
      .get(req.params.id) as
      | {
          id: string;
          userId: string | null;
          email: string;
          name: string;
          description: string;
          projectType: string | null;
          budgetRange: string | null;
          deadline: string | null;
          serviceId: string | null;
          convertedProjectId: string | null;
        }
      | undefined;
    if (!request) throw notFound('Request not found.');
    if (request.convertedProjectId) throw badRequest('This request has already become a project.');

    const input = req.body as { title?: string; clientId?: string; budget?: string; deadline?: string };
    const clientId =
      input.clientId ??
      request.userId ??
      (db.prepare(`SELECT id FROM users WHERE email = ? AND role = 'client'`).get(request.email) as
        | { id: string }
        | undefined)?.id;

    if (!clientId) {
      throw badRequest(
        'This request has no client account yet. Ask them to register, or pick an existing client.',
      );
    }

    const projectId = uuid();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO client_projects (id, code, client_id, request_id, service_id, title, description, budget, deadline, status, progress)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'request_received', 10)`,
      ).run(
        projectId,
        projectCode(),
        clientId,
        request.id,
        request.serviceId,
        input.title ?? request.projectType ?? `Project for ${request.name}`,
        request.description,
        input.budget ?? request.budgetRange,
        input.deadline ?? request.deadline,
      );
      db.prepare(
        `INSERT INTO project_status_events (id, project_id, status, note, actor_id)
         VALUES (?, ?, 'request_received', 'Project created from request', ?)`,
      ).run(uuid(), projectId, req.auth!.id);
      db.prepare(
        `UPDATE project_requests SET status = 'converted', converted_project_id = ?, user_id = COALESCE(user_id, ?), updated_at = datetime('now')
          WHERE id = ?`,
      ).run(projectId, clientId, request.id);
    })();

    ensureConversationForClient(clientId);
    notify({
      userId: clientId,
      type: 'project_status',
      title: 'Your project has been opened',
      body: 'The studio created a project from your request. You can track it in your dashboard.',
      link: `/dashboard/projects/${projectId}`,
    });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'request.converted',
      entityType: 'project_request',
      entityId: request.id,
      meta: { projectId },
    });

    res.status(201).json({ projectId });
  }),
);
