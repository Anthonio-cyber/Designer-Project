import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { badRequest } from './errors.js';

function format(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Parses `req.body` and replaces it with the typed result. */
export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(badRequest('Please check the form.', format(parsed.error)));
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return next(badRequest('Invalid query parameters.', format(parsed.error)));
    (req as Request & { validatedQuery: z.infer<T> }).validatedQuery = parsed.data;
    next();
  };
}

export function parsed<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
