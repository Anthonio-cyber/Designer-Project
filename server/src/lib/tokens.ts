import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  role: 'client' | 'admin';
  email: string;
  name: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.accessSecret, {
    expiresIn: env.accessTokenTtl,
    issuer: 'designer-platform',
  } as jwt.SignOptions);
}

export function verifyAccessToken(raw: string): AccessTokenPayload | null {
  try {
    return jwt.verify(raw, env.accessSecret, { issuer: 'designer-platform' }) as AccessTokenPayload;
  } catch {
    return null;
  }
}

/** Refresh tokens are opaque; only their SHA-256 digest is persisted. */
export const hashToken = (raw: string): string => createHash('sha256').update(raw).digest('hex');
