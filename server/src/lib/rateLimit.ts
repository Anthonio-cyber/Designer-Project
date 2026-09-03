import type { NextFunction, Request, Response } from 'express';
import { tooMany } from './errors.js';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Periodic sweep so the map cannot grow without bound.
setInterval(() => {
  const nowMs = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= nowMs) buckets.delete(key);
}, 60_000).unref?.();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Distinguishes independent limiters that share an IP. */
  scope: string;
  message?: string;
}

export function rateLimit({ windowMs, max, scope, message }: RateLimitOptions) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const identity = req.auth?.id ?? req.ip ?? 'unknown';
    const key = `${scope}:${identity}`;
    const nowMs = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= nowMs) {
      buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > max) return next(tooMany(message));
    next();
  };
}

/** Test helper / used when an admin resets throttling. */
export const resetRateLimits = (): void => buckets.clear();
