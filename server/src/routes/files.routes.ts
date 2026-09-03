import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { db } from '../db/index.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import {
  absolutePath,
  deleteFile,
  publicUrl,
  recordFile,
  requireReadableFile,
  upload,
} from '../services/storage.service.js';
import { notifyAdmins, notify } from '../services/notifications.service.js';

export const filesRouter = Router();

/** Streams a stored file after checking the viewer may read it. */
filesRouter.get(
  '/:id/raw',
  asyncHandler(async (req, res) => {
    const file = requireReadableFile(req.params.id, req.auth);
    const diskPath = absolutePath(file);
    if (!fs.existsSync(diskPath)) throw notFound('That file is missing from storage.');

    res.setHeader('Content-Type', file.mime_type);
    // SVGs can carry script; forcing a download prevents same-origin execution.
    const inline = file.mime_type !== 'image/svg+xml' && file.mime_type.startsWith('image/');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.original_name)}"`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Cache-Control',
      file.visibility === 'public' ? 'public, max-age=604800, immutable' : 'private, max-age=0, no-store',
    );
    fs.createReadStream(diskPath).pipe(res);
  }),
);

filesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const file = requireReadableFile(req.params.id, req.auth);
    res.json({
      file: {
        id: file.id,
        name: file.original_name,
        mimeType: file.mime_type,
        size: file.size_bytes,
        kind: file.kind,
        visibility: file.visibility,
        createdAt: file.created_at,
        url: publicUrl(file.id),
      },
    });
  }),
);

const LIST_SELECT = `
  SELECT f.id, f.original_name AS name, f.mime_type AS mimeType, f.size_bytes AS size, f.kind,
         f.visibility, f.created_at AS createdAt, f.project_id AS projectId,
         u.name AS uploaderName, u.id AS uploaderId, cp.title AS projectTitle, cp.code AS projectCode
    FROM files f
    LEFT JOIN users u ON u.id = f.uploader_id
    LEFT JOIN client_projects cp ON cp.id = f.project_id`;

filesRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const viewer = req.auth!;
    const search = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const kind = typeof req.query.kind === 'string' ? req.query.kind : '';

    // Clients only ever see files they uploaded or files attached to their projects.
    const scope =
      viewer.role === 'admin'
        ? '1 = 1'
        : '(f.uploader_id = @viewerId OR cp.client_id = @viewerId)';

    const rows = db
      .prepare(
        `${LIST_SELECT}
          WHERE ${scope}
            AND (@kind = '' OR f.kind = @kind)
            AND (@search = '' OR f.original_name LIKE @like)
          ORDER BY f.created_at DESC LIMIT 300`,
      )
      .all({ viewerId: viewer.id, kind, search, like: `%${search}%` }) as Record<string, unknown>[];

    res.json({ files: rows.map((row) => ({ ...row, url: publicUrl(row.id as string) })) });
  }),
);

/** Upload endpoint for project files (client references or designer deliverables). */
filesRouter.post(
  '/',
  requireAuth,
  rateLimit({ scope: 'file-upload', windowMs: 60_000, max: 40 }),
  upload.array('files', 10),
  asyncHandler(async (req, res) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('No file received.');

    const viewer = req.auth!;
    const projectId = typeof req.body.projectId === 'string' && req.body.projectId ? req.body.projectId : null;
    const requestedKind = typeof req.body.kind === 'string' ? req.body.kind : null;
    const visibility = viewer.role === 'admin' && req.body.visibility === 'public' ? 'public' : 'private';

    if (projectId) {
      const project = db
        .prepare(`SELECT id, client_id AS clientId, title FROM client_projects WHERE id = ?`)
        .get(projectId) as { id: string; clientId: string; title: string } | undefined;
      if (!project) throw badRequest('Unknown project.');
      if (viewer.role !== 'admin' && project.clientId !== viewer.id) {
        throw forbidden('You cannot upload to another client’s project.');
      }
    }

    const kind =
      requestedKind && ['portfolio', 'attachment', 'reference', 'deliverable', 'avatar', 'branding'].includes(requestedKind)
        ? (requestedKind as 'portfolio' | 'attachment' | 'reference' | 'deliverable' | 'avatar' | 'branding')
        : viewer.role === 'admin'
          ? 'deliverable'
          : 'reference';

    // Only an administrator may publish a file to the public web.
    if ((kind === 'portfolio' || kind === 'branding') && viewer.role !== 'admin') {
      throw forbidden('Only the studio can publish files.');
    }

    const stored = files.map((file) =>
      recordFile({
        file,
        uploaderId: viewer.id,
        kind,
        visibility: kind === 'portfolio' || kind === 'branding' || kind === 'avatar' ? 'public' : visibility,
        projectId,
      }),
    );

    if (projectId) {
      const project = db
        .prepare(`SELECT client_id AS clientId, title FROM client_projects WHERE id = ?`)
        .get(projectId) as { clientId: string; title: string };
      if (viewer.role === 'client') {
        notifyAdmins({
          type: 'file_upload',
          title: `${viewer.name} uploaded ${stored.length} file(s)`,
          body: project.title,
          link: `/admin/projects/${projectId}`,
        });
      } else {
        notify({
          userId: project.clientId,
          type: 'file_upload',
          title: 'The studio uploaded new files',
          body: project.title,
          link: `/dashboard/projects/${projectId}`,
        });
      }
    }

    logActivity({
      actorId: viewer.id,
      actorType: viewer.role === 'admin' ? 'admin' : 'client',
      action: 'file.uploaded',
      entityType: 'file',
      meta: { count: stored.length, kind, projectId },
    });

    res.status(201).json({
      files: stored.map((file) => ({
        id: file.id,
        name: file.original_name,
        mimeType: file.mime_type,
        size: file.size_bytes,
        kind: file.kind,
        url: publicUrl(file.id),
      })),
    });
  }),
);

filesRouter.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const file = requireReadableFile(req.params.id, req.auth);
    if (req.auth!.role !== 'admin' && file.uploader_id !== req.auth!.id) {
      throw forbidden('You can only delete files you uploaded.');
    }
    deleteFile(file.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: req.auth!.role === 'admin' ? 'admin' : 'client',
      action: 'file.deleted',
      entityType: 'file',
      entityId: file.id,
      meta: { name: file.original_name },
    });
    res.json({ ok: true });
  }),
);

/** Admin-only: publish an existing private file so it can be used on the site. */
filesRouter.patch(
  '/:id',
  requireAdmin,
  validateBody(z.object({ visibility: z.enum(['public', 'private']) })),
  asyncHandler(async (req, res) => {
    const file = requireReadableFile(req.params.id, req.auth);
    db.prepare(`UPDATE files SET visibility = ? WHERE id = ?`).run(
      (req.body as { visibility: string }).visibility,
      file.id,
    );
    res.json({ ok: true });
  }),
);

/** Reports total bytes used, for the admin file settings screen. */
filesRouter.get(
  '/stats/summary',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const row = db
      .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM files`)
      .get() as { count: number; bytes: number };
    const byKind = db
      .prepare(`SELECT kind, COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes FROM files GROUP BY kind`)
      .all();
    res.json({ total: row, byKind });
  }),
);

export const uploadRootName = path.basename('uploads');
