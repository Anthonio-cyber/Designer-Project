import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { getPublicSettings, getSettings, saveSettings } from '../services/settings.service.js';
import { publicUrl, recordFile, upload } from '../services/storage.service.js';
import { serializeUser } from './auth.routes.js';
import { badRequest } from '../lib/errors.js';

export const settingsRouter = Router();

/** Branding and content the public site needs to render. */
settingsRouter.get(
  '/public',
  asyncHandler(async (_req, res) => {
    const settings = getPublicSettings();
    res.json({
      settings: {
        ...settings,
        logoUrl: publicUrl(settings.logoFileId),
        about: { ...settings.about, photoUrl: publicUrl(settings.about.photoFileId) },
        seo: { ...settings.seo, ogImageUrl: publicUrl(settings.seo.ogImageFileId) },
      },
    });
  }),
);

settingsRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    res.json({ settings: getSettings() });
  }),
);

/** Free-form patch: the service deep-merges onto the current values. */
settingsRouter.put(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (typeof req.body !== 'object' || req.body === null || Array.isArray(req.body)) {
      throw badRequest('Settings must be an object.');
    }
    const next = saveSettings(req.body as Record<string, never>);
    logActivity({
      actorId: req.auth!.id,
      actorType: 'admin',
      action: 'settings.updated',
      entityType: 'settings',
      meta: { keys: Object.keys(req.body as object) },
    });
    res.json({ settings: next });
  }),
);

/** Branding uploads (logo, designer photo, OG image) are public by definition. */
settingsRouter.post(
  '/branding',
  requireAdmin,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file received.');
    const stored = recordFile({
      file: req.file,
      uploaderId: req.auth!.id,
      kind: 'branding',
      visibility: 'public',
    });
    res.status(201).json({ file: { id: stored.id, url: publicUrl(stored.id), name: stored.original_name } });
  }),
);

// ------------------------------------------------------------ user profile ---

export const profileRouter = Router();
profileRouter.use(requireAuth);

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  company: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  website: z.string().trim().max(200).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  preferences: z.record(z.unknown()).optional(),
});

profileRouter.put(
  '/',
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof profileSchema>;
    const userId = req.auth!.id;

    db.transaction(() => {
      if (input.name) {
        db.prepare(`UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?`).run(input.name, userId);
      }
      db.prepare(`INSERT OR IGNORE INTO profiles (user_id) VALUES (?)`).run(userId);
      db.prepare(
        `UPDATE profiles SET
           company = COALESCE(@company, company),
           phone = COALESCE(@phone, phone),
           website = COALESCE(@website, website),
           location = COALESCE(@location, location),
           bio = COALESCE(@bio, bio),
           preferences = COALESCE(@preferences, preferences)
         WHERE user_id = @userId`,
      ).run({
        userId,
        company: input.company ?? null,
        phone: input.phone ?? null,
        website: input.website ?? null,
        location: input.location ?? null,
        bio: input.bio ?? null,
        preferences: input.preferences ? JSON.stringify(input.preferences) : null,
      });
    })();

    res.json({ user: serializeUser(userId) });
  }),
);

profileRouter.post(
  '/avatar',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file received.');
    if (!req.file.mimetype.startsWith('image/')) throw badRequest('Avatars must be an image.');

    const stored = recordFile({
      file: req.file,
      uploaderId: req.auth!.id,
      kind: 'avatar',
      visibility: 'public',
    });
    db.prepare(`UPDATE users SET avatar_file_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      stored.id,
      req.auth!.id,
    );
    res.status(201).json({ user: serializeUser(req.auth!.id) });
  }),
);
