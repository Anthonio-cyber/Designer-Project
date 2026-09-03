import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import {
  createFeature,
  deleteFeature,
  featureHistory,
  listFeatures,
  restoreFeatureVersion,
  updateFeature,
} from '../services/features.service.js';

export const featuresRouter = Router();

/** Public: only the keys of enabled features, so the site can render conditionally. */
featuresRouter.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const enabled = listFeatures()
      .filter((feature) => feature.status === 'enabled')
      .map((feature) => ({ key: feature.key, name: feature.name, config: feature.config }));
    res.json({ features: enabled });
  }),
);

featuresRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ features: listFeatures() });
  }),
);

featuresRouter.get(
  '/:key/history',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ history: featureHistory(req.params.key) });
  }),
);

const featureSchema = z.object({
  key: z.string().trim().max(60).optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(600).optional(),
  category: z.string().trim().max(40).optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
  config: z.record(z.unknown()).optional(),
});

featuresRouter.post(
  '/',
  requireAdmin,
  validateBody(featureSchema),
  asyncHandler(async (req, res) => {
    const feature = createFeature({ ...(req.body as z.infer<typeof featureSchema>), createdBy: req.auth!.name });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'feature.created',
      entityType: 'feature',
      entityId: feature.id,
      meta: { key: feature.key },
    });
    res.status(201).json({ feature });
  }),
);

featuresRouter.put(
  '/:key',
  requireAdmin,
  validateBody(featureSchema.partial().extend({ changeNote: z.string().trim().max(300).optional() })),
  asyncHandler(async (req, res) => {
    const feature = updateFeature(req.params.key, {
      ...(req.body as Record<string, never>),
      actor: req.auth!.name,
    });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'feature.updated',
      entityType: 'feature',
      entityId: feature.id,
      meta: { key: feature.key, status: feature.status },
    });
    res.json({ feature });
  }),
);

featuresRouter.post(
  '/:key/toggle',
  requireAdmin,
  validateBody(z.object({ status: z.enum(['enabled', 'disabled']) })),
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: 'enabled' | 'disabled' };
    const feature = updateFeature(req.params.key, {
      status,
      changeNote: `Feature ${status}`,
      actor: req.auth!.name,
    });
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: `feature.${status}`,
      entityType: 'feature',
      entityId: feature.id,
      meta: { key: feature.key },
    });
    res.json({ feature });
  }),
);

featuresRouter.post(
  '/:key/restore/:versionId',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const feature = restoreFeatureVersion(req.params.key, req.params.versionId, req.auth!.name);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'feature.restored',
      entityType: 'feature',
      entityId: feature.id,
    });
    res.json({ feature });
  }),
);

featuresRouter.delete(
  '/:key',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const feature = deleteFeature(req.params.key, req.auth!.name);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'feature.deleted',
      entityType: 'feature',
      entityId: feature.id,
      meta: { key: feature.key },
    });
    res.json({ ok: true });
  }),
);
