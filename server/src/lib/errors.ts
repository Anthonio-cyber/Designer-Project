export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message = 'Invalid request', details?: unknown) =>
  new HttpError(400, message, 'bad_request', details);
export const unauthorized = (message = 'You need to sign in to continue.') =>
  new HttpError(401, message, 'unauthorized');
export const forbidden = (message = 'You do not have access to this resource.') =>
  new HttpError(403, message, 'forbidden');
export const notFound = (message = 'Not found') => new HttpError(404, message, 'not_found');
export const conflict = (message = 'That already exists.') => new HttpError(409, message, 'conflict');
export const tooMany = (message = 'Too many requests. Please slow down.') =>
  new HttpError(429, message, 'rate_limited');
