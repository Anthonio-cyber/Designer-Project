import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { env } from '../config/env.js';
import { HttpError } from '../lib/errors.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details ?? undefined },
    });
    return;
  }

  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'That file is larger than the upload limit.'
        : 'Upload rejected.';
    res.status(400).json({ error: { code: 'upload_error', message } });
    return;
  }

  const message = err instanceof Error ? err.message : 'Unexpected error';
  // Server faults are logged in full but never leaked to the client in production.
  console.error('[error]', err);
  res.status(500).json({
    error: {
      code: 'server_error',
      message: env.isProd ? 'Something went wrong. Please try again.' : message,
    },
  });
}

/** Wraps an async route so rejected promises reach the error handler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => unknown>(
  handler: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
