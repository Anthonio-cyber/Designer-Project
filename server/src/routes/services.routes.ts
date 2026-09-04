import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { notFound } from '../lib/errors.js';
import { slugify, uuid } from '../lib/ids.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { getSettings } from '../services/settings.service.js';
import { formatMoney, toMinor } from '../services/payments/index.js';

export const servicesRouter = Router();

const SELECT = `SELECT id, name, slug, description, price_mode AS priceMode,
                       price_fixed AS priceFixed, price_from AS priceFrom, price_label AS priceLabel,
                       currency, delivery_time AS deliveryTime, icon, position, active,
                       created_at AS createdAt
                  FROM services`;

/**
 * Resolves what a visitor should actually see for a service:
 *   fixed  — a set price the client can be invoiced for immediately;
 *   from   — a starting point, quoted properly after a brief;
 *   custom — no public number; the studio quotes and can take a bank transfer.
 */
function serializeService(row: Record<string, unknown>) {
  const mode = (row.priceMode as string) ?? 'from';
  const currency = ((row.currency as string) || getSettings().payments.currency).toUpperCase();
  const amount = mode === 'fixed' ? (row.priceFixed as number | null) : (row.priceFrom as number | null);

  return {
    ...row,
    active: !!row.active,
    priceMode: mode,
    currency,
    // A label the designer typed always wins over the generated one.
    priceDisplay:
      (row.priceLabel as string | null) ||
      (mode === 'custom' || amount === null || amount === undefined
        ? 'Contact for pricing'
        : mode === 'fixed'
          ? formatMoney(toMinor(amount, currency), currency)
          : `From ${formatMoney(toMinor(amount, currency), currency)}`),
    /** True when the studio can raise a fixed invoice without quoting first. */
    payableNow: mode === 'fixed' && amount !== null && amount !== undefined,
  };
}

servicesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const admin = req.auth?.role === 'admin';
    const rows = db
      .prepare(`${SELECT} ${admin ? '' : 'WHERE active = 1'} ORDER BY position ASC, name COLLATE NOCASE ASC`)
      .all() as Record<string, unknown>[];
    res.json({ services: rows.map(serializeService) });
  }),
);

servicesRouter.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const row = db.prepare(`${SELECT} WHERE slug = ? OR id = ?`).get(req.params.slug, req.params.slug) as
      | Record<string, unknown>
      | undefined;
    if (!row || (!row.active && req.auth?.role !== 'admin')) throw notFound('Service not found.');
    res.json({ service: serializeService(row) });
  }),
);

const serviceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1200).nullable().optional(),
  priceMode: z.enum(['fixed', 'from', 'custom']).default('from'),
  priceFixed: z.number().min(0).max(1_000_000).nullable().optional(),
  priceFrom: z.number().min(0).max(1_000_000).nullable().optional(),
  priceLabel: z.string().trim().max(60).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
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
      `INSERT INTO services (id, name, slug, description, price_mode, price_fixed, price_from,
                             price_label, currency, delivery_time, icon, position, active)
       VALUES (@id, @name, @slug, @description, @priceMode, @priceFixed, @priceFrom,
               @priceLabel, @currency, @deliveryTime, @icon, @position, @active)`,
    ).run({
      id,
      name: input.name,
      slug: uniqueServiceSlug(input.name),
      description: input.description ?? null,
      priceMode: input.priceMode,
      // Only the field the chosen mode uses is stored, so a mode switch never
      // leaves a stale number behind to resurface later.
      priceFixed: input.priceMode === 'fixed' ? (input.priceFixed ?? null) : null,
      priceFrom: input.priceMode === 'from' ? (input.priceFrom ?? null) : null,
      priceLabel: input.priceLabel ?? null,
      currency: (input.currency ?? getSettings().payments.currency).toUpperCase(),
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
    res.status(201).json({ service: serializeService(db.prepare(`${SELECT} WHERE id = ?`).get(id) as Record<string, unknown>) });
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
    // Changing the pricing mode clears the amount the other modes use, so the
    // stored price always matches what the page displays.
    const mode = input.priceMode ?? null;
    db.prepare(
      `UPDATE services SET
         name = COALESCE(@name, name),
         slug = COALESCE(@slug, slug),
         description = COALESCE(@description, description),
         price_mode = COALESCE(@priceMode, price_mode),
         price_fixed = CASE WHEN @priceMode IS NULL THEN COALESCE(@priceFixed, price_fixed)
                            WHEN @priceMode = 'fixed' THEN @priceFixed ELSE NULL END,
         price_from  = CASE WHEN @priceMode IS NULL THEN COALESCE(@priceFrom, price_from)
                            WHEN @priceMode = 'from' THEN @priceFrom ELSE NULL END,
         price_label = COALESCE(@priceLabel, price_label),
         currency = COALESCE(@currency, currency),
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
      priceMode: mode,
      priceFixed: input.priceFixed ?? null,
      priceFrom: input.priceFrom ?? null,
      priceLabel: input.priceLabel ?? null,
      currency: input.currency ? input.currency.toUpperCase() : null,
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
    res.json({ service: serializeService(db.prepare(`${SELECT} WHERE id = ?`).get(existing.id) as Record<string, unknown>) });
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
