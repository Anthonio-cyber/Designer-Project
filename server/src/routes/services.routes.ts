import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { slugify, uuid } from '../lib/ids.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';

export const servicesRouter = Router();

const SELECT = `SELECT id, name, slug, description, price_from AS priceFrom, price_label AS priceLabel,
                       delivery_time AS deliveryTime, icon, position, active, created_at AS createdAt
                  FROM services`;

servicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const admin = req.auth?.role === 'admin';
    const rows = db
      .prepare(`${SELECT} ${admin ? '' : 'WHERE active = 1'} ORDER BY position ASC, name COLLATE NOCASE ASC`)
      .all() as Record<string, unknown>[];
    res.json({ services: rows.map((row) => ({ ...row, active: !!row.active })) });
  }),
);

servicesRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${SELECT} WHERE slug = ? OR id = ?`).get(req.params.slug, req.params.slug) as
      | Record<string, unknown>
      | undefined;
    if (!row || (!row.active && req.auth?.role !== 'admin')) throw notFound('Service not found.');
    res.json({ service: { ...row, active: !!row.active } });
  }),
);

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1200).nullable().optional(),
  priceFrom: z.number().min(0).max(1_000_000).nullable().optional(),
  priceLabel: z.string().trim().max(60).nullable().optional(),
  deliveryTime: z.string().trim().max(60).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  position: z.number().int().min(0).max(999).optional(),
  active: z.boolean().default(true),
});

function uniqueServiceSlug(name: string, excludeId?: string): string {
  const base = slugify(name);
  let candidate = base;
  let counter = 2;
  for (;;) {
    const clash = db.prepare(`SELECT id FROM services WHERE slug = ? AND id != ?`).get(candidate, excludeId ?? '');
    if (!clash) return candidate;
    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

servicesRouter.post(
  '/',
  requireAdmin,
  validateBody(serviceSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof serviceSchema>;
    const id = uuid();
    db.prepare(
      `INSERT INTO services (id, name, slug, description, price_from, price_label, delivery_time, icon, position, active)
       VALUES (@id, @name, @slug, @description, @priceFrom, @priceLabel, @deliveryTime, @icon, @position, @active)`,
    ).run({
      id,
      name: input.name,
      slug: uniqueServiceSlug(input.name),
      description: input.description ?? null,
      priceFrom: input.priceFrom ?? null,
      priceLabel: input.priceLabel ?? null,
      deliveryTime: input.deliveryTime ?? null,
      icon: input.icon ?? null,
      position: input.position ?? 99,
      active: input.active ? 1 : 0,
    });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'service.created',
      entityType: 'service',
      entityId: id,
      meta: { name: input.name },
    });
    res.status(201).json({ service: db.prepare(`${SELECT} WHERE id = ?`).get(id) });
  }),
);

servicesRouter.put(
  '/:id',
  requireAdmin,
  validateBody(serviceSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = db.prepare(`SELECT id, name FROM services WHERE id = ?`).get(req.params.id) as
      | { id: string; name: string }
      | undefined;
    if (!existing) throw notFound('Service not found.');

    const input = req.body as Partial<z.infer<typeof serviceSchema>>;
    db.prepare(
      `UPDATE services SET
         name = COALESCE(@name, name),
         slug = COALESCE(@slug, slug),
         description = COALESCE(@description, description),
         price_from = COALESCE(@priceFrom, price_from),
         price_label = COALESCE(@priceLabel, price_label),
         delivery_time = COALESCE(@deliveryTime, delivery_time),
         icon = COALESCE(@icon, icon),
         position = COALESCE(@position, position),
         active = COALESCE(@active, active),
         updated_at = datetime('now')
       WHERE id = @id`,
    ).run({
      id: existing.id,
      name: input.name ?? null,
      slug: input.name ? uniqueServiceSlug(input.name, existing.id) : null,
      description: input.description ?? null,
      priceFrom: input.priceFrom ?? null,
      priceLabel: input.priceLabel ?? null,
      deliveryTime: input.deliveryTime ?? null,
      icon: input.icon ?? null,
      position: input.position ?? null,
      active: input.active === undefined ? null : input.active ? 1 : 0,
    });

    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'service.updated',
      entityType: 'service',
      entityId: existing.id,
    });
    res.json({ service: db.prepare(`${SELECT} WHERE id = ?`).get(existing.id) });
  }),
);

servicesRouter.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    db.prepare(`DELETE FROM services WHERE id = ?`).run(req.params.id);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'service.deleted',
      entityType: 'service',
      entityId: req.params.id,
    });
    res.json({ ok: true });
  }),
);
