import type { Response } from 'express';
import { env } from '../config/env.js';

export const ACCESS_COOKIE = 'dp_access';
export const REFRESH_COOKIE = 'dp_refresh';

const base = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax' as const,
  domain: env.cookieDomain,
  path: '/',
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...base, maxAge: 60 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base,
    maxAge: env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}
