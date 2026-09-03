export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, string>;

  constructor(status: number, payload: ApiErrorShape) {
    super(payload.message);
    this.status = status;
    this.code = payload.code;
    this.details = payload.details ?? {};
  }
}

const BASE = '/api';

let refreshing: Promise<boolean> | null = null;

/** Refreshes the session at most once concurrently, then replays the request. */
async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      // Cleared on the next tick so parallel callers share this attempt.
      setTimeout(() => {
        refreshing = null;
      }, 0);
    });
  return refreshing;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Set internally to stop an infinite refresh loop. */
  retried?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, retried, headers, ...rest } = options;

  const url = new URL(`${BASE}${path}`, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const isFormData = body instanceof FormData;
  const response = await fetch(url.toString(), {
    ...rest,
    credentials: 'include',
    headers: {
      ...(isFormData || body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(headers as Record<string, string>),
    },
    body: isFormData ? body : body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && !retried && !path.startsWith('/auth/')) {
    if (await refreshSession()) return request<T>(path, { ...options, retried: true });
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : {};

  if (!response.ok) {
    const shape = (payload as { error?: ApiErrorShape }).error ?? {
      code: 'error',
      message: 'Something went wrong. Please try again.',
    };
    throw new ApiError(response.status, shape);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) => request<T>(path, { method: 'POST', body: formData }),
};
