import type { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.js';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

export interface AuthUser {
  id: string;
  role: 'client' | 'admin';
  email: string;
  name: string;
  status: 'active' | 'blocked' | 'deactivated';
}

const findUser = db.prepare(
  `SELECT id, name, email, role, status FROM users WHERE id = ?`,
);
const touchSeen = db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = ?`);

function readToken(req: Request): string | null {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookie === 'string' && cookie) return cookie;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Populates `req.auth` when a valid session exists. Never rejects. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const raw = readToken(req);
  if (!raw) return next();

  const payload = verifyAccessToken(raw);
  if (!payload) return next();

  // Re-read the user so a blocked or deleted account loses access immediately,
  // rather than staying valid until the access token expires.
  const user = findUser.get(payload.sub) as AuthUser | undefined;
  if (!user || user.status !== 'active') return next();

  req.auth = user;
  touchSeen.run(user.id);
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'admin') return next(forbidden('Administrator access is required.'));
  next();
}

export function requireClient(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'client') return next(forbidden('This area is for client accounts.'));
  next();
}

export const isAdmin = (req: Request): boolean => req.auth?.role === 'admin';
