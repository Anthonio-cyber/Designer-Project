import { Router } from 'express';
import { z } from 'zod';
import { db, json } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import { token, uuid } from '../lib/ids.js';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../lib/password.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../lib/cookies.js';
import { hashToken, signAccessToken } from '../lib/tokens.js';
import { rateLimit } from '../lib/rateLimit.js';
import { validateBody } from '../lib/validate.js';
import { asyncHandler } from '../middleware/error.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { env } from '../config/env.js';
import { getSettings } from '../services/settings.service.js';
import { publicUrl } from '../services/storage.service.js';
import { ensureConversationForClient } from '../services/messaging.service.js';

export const authRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(80),
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  company: z.string().trim().max(120).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
});

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: 'client' | 'admin';
  status: string;
  avatarUrl: string | null;
  createdAt: string;
  profile: {
    company: string | null;
    phone: string | null;
    website: string | null;
    location: string | null;
    bio: string | null;
    preferences: Record<string, unknown>;
  };
}

const userWithProfile = db.prepare(
  `SELECT u.id, u.name, u.email, u.role, u.status, u.avatar_file_id AS avatarFileId, u.created_at AS createdAt,
          p.company, p.phone, p.website, p.location, p.bio, p.preferences
     FROM users u LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = ?`,
);

export function serializeUser(userId: string): PublicUser {
  const row = userWithProfile.get(userId) as Record<string, string | null>;
  if (!row) throw notFound('Account not found.');
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as 'client' | 'admin',
    status: row.status as string,
    avatarUrl: publicUrl(row.avatarFileId),
    createdAt: row.createdAt as string,
    profile: {
      company: row.company ?? null,
      phone: row.phone ?? null,
      website: row.website ?? null,
      location: row.location ?? null,
      bio: row.bio ?? null,
      preferences: json<Record<string, unknown>>(row.preferences, {}),
    },
  };
}

/** Issues a fresh access token + rotated refresh session and sets both cookies. */
function startSession(
  res: import('express').Response,
  req: import('express').Request,
  user: { id: string; role: 'client' | 'admin'; email: string; name: string },
): void {
  const refreshToken = token(48);
  const expiresAt = new Date(Date.now() + env.refreshTokenTtlDays * 86_400_000).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, user_agent, ip, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    user.id,
    hashToken(refreshToken),
    (req.headers['user-agent'] ?? '').slice(0, 200),
    req.ip ?? null,
    expiresAt,
  );

  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
  });
  setAuthCookies(res, accessToken, refreshToken);
}

authRouter.post(
  '/register',
  rateLimit({ scope: 'register', windowMs: 60 * 60_000, max: 10 }),
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { name, email, password, company } = req.body as z.infer<typeof registerSchema>;

    if (!getSettings().clientSettings.allowRegistration) {
      throw forbidden('New client registrations are currently closed. Please use the contact form.');
    }

    const strength = checkPasswordStrength(password);
    if (!strength.ok) throw badRequest(strength.message, { password: strength.message });

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
    if (existing) throw conflict('An account with that email already exists.');

    const id = uuid();
    const passwordHash = await hashPassword(password);

    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'client')`,
      ).run(id, name, email, passwordHash);
      db.prepare(`INSERT INTO profiles (user_id, company) VALUES (?, ?)`).run(id, company ?? null);
    })();

    if (getSettings().clientSettings.autoCreateConversation) ensureConversationForClient(id);

    logActivity({ actorId: id, actorType: 'client', action: 'account.registered', entityType: 'user', entityId: id });
    startSession(res, req, { id, role: 'client', email, name });
    res.status(201).json({ user: serializeUser(id) });
  }),
);

authRouter.post(
  '/login',
  rateLimit({ scope: 'login', windowMs: 15 * 60_000, max: 20, message: 'Too many sign-in attempts. Try again in a few minutes.' }),
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as z.infer<typeof loginSchema>;
    const user = db
      .prepare(`SELECT id, name, email, role, status, password_hash AS passwordHash FROM users WHERE email = ?`)
      .get(email) as
      | { id: string; name: string; email: string; role: 'client' | 'admin'; status: string; passwordHash: string }
      | undefined;

    // Identical response for unknown email and wrong password.
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized('Email or password is incorrect.');
    }
    if (user.status === 'blocked') throw forbidden('This account has been blocked. Contact the studio.');
    if (user.status === 'deactivated') throw forbidden('This account is deactivated.');

    logActivity({
      actorId: user.id,
      actorType: user.role === 'admin' ? 'admin' : 'client',
      action: 'account.login',
      entityType: 'user',
      entityId: user.id,
    });
    startSession(res, req, user);
    res.json({ user: serializeUser(user.id) });
  }),
);

authRouter.post(
  '/refresh',
  rateLimit({ scope: 'refresh', windowMs: 60_000, max: 60 }),
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw !== 'string' || !raw) throw unauthorized('Session expired. Please sign in again.');

    const session = db
      .prepare(
        `SELECT s.id, s.user_id AS userId, s.expires_at AS expiresAt, s.revoked_at AS revokedAt,
                u.name, u.email, u.role, u.status
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = ?`,
      )
      .get(hashToken(raw)) as
      | { id: string; userId: string; expiresAt: string; revokedAt: string | null; name: string; email: string; role: 'client' | 'admin'; status: string }
      | undefined;

    if (!session || session.revokedAt || new Date(session.expiresAt) < new Date()) {
      clearAuthCookies(res);
      throw unauthorized('Session expired. Please sign in again.');
    }
    if (session.status !== 'active') {
      clearAuthCookies(res);
      throw forbidden('This account is no longer active.');
    }

    // Rotate: the presented refresh token is single-use.
    db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`).run(session.id);
    startSession(res, req, {
      id: session.userId,
      role: session.role,
      email: session.email,
      name: session.name,
    });
    res.json({ user: serializeUser(session.userId) });
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (typeof raw === 'string' && raw) {
      db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?`).run(hashToken(raw));
    }
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.auth) {
      res.json({ user: null });
      return;
    }
    res.json({ user: serializeUser(req.auth.id) });
  }),
);

authRouter.post(
  '/forgot-password',
  rateLimit({ scope: 'forgot', windowMs: 60 * 60_000, max: 10 }),
  validateBody(z.object({ email: emailSchema })),
  asyncHandler(async (req, res) => {
    const { email } = req.body as { email: string };
    const user = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as { id: string } | undefined;

    // Always answer the same way so the endpoint cannot enumerate accounts.
    const response: { ok: true; devToken?: string } = { ok: true };

    if (user) {
      const resetToken = token(32);
      db.prepare(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at)
         VALUES (?, ?, ?, datetime('now', '+1 hour'))`,
      ).run(uuid(), user.id, hashToken(resetToken));
      logActivity({ actorId: user.id, actorType: 'system', action: 'account.password_reset_requested' });

      // No mail transport is configured in this build; in development the token is
      // returned so the flow is testable. In production it must be emailed.
      if (env.isDev) response.devToken = resetToken;
    }
    res.json(response);
  }),
);

authRouter.post(
  '/reset-password',
  rateLimit({ scope: 'reset', windowMs: 60 * 60_000, max: 10 }),
  validateBody(
    z.object({
      token: z.string().min(10),
      password: z.string().min(8).max(200),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { token: raw, password } = req.body as { token: string; password: string };
    const strength = checkPasswordStrength(password);
    if (!strength.ok) throw badRequest(strength.message, { password: strength.message });

    const record = db
      .prepare(
        `SELECT id, user_id AS userId, expires_at AS expiresAt, used_at AS usedAt
           FROM password_resets WHERE token_hash = ?`,
      )
      .get(hashToken(raw)) as
      | { id: string; userId: string; expiresAt: string; usedAt: string | null }
      | undefined;

    if (!record || record.usedAt || new Date(record.expiresAt) < new Date()) {
      throw badRequest('That reset link is invalid or has expired.');
    }

    const passwordHash = await hashPassword(password);
    db.transaction(() => {
      db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
        passwordHash,
        record.userId,
      );
      db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(record.id);
      // Every existing session is invalidated after a password change.
      db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ?`).run(record.userId);
    })();

    logActivity({ actorId: record.userId, actorType: 'system', action: 'account.password_reset' });
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  rateLimit({ scope: 'change-password', windowMs: 60 * 60_000, max: 20 }),
  validateBody(
    z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8).max(200) }),
  ),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const strength = checkPasswordStrength(newPassword);
    if (!strength.ok) throw badRequest(strength.message, { newPassword: strength.message });

    const row = db
      .prepare(`SELECT password_hash AS passwordHash FROM users WHERE id = ?`)
      .get(req.auth!.id) as { passwordHash: string };
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      throw badRequest('Your current password is incorrect.', { currentPassword: 'Incorrect password.' });
    }

    db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
      await hashPassword(newPassword),
      req.auth!.id,
    );
    logActivity({
      actorId: req.auth!.id,
      actorType: req.auth!.role === 'admin' ? 'admin' : 'client',
      action: 'account.password_changed',
    });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const rows = db
      .prepare(
        `SELECT id, user_agent AS userAgent, ip, created_at AS createdAt, expires_at AS expiresAt
           FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > datetime('now')
          ORDER BY created_at DESC LIMIT 20`,
      )
      .all(req.auth!.id);
    res.json({ sessions: rows });
  }),
);

authRouter.post(
  '/sessions/revoke-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    db.prepare(`UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ?`).run(req.auth!.id);
    clearAuthCookies(res);
    res.json({ ok: true });
  }),
);
