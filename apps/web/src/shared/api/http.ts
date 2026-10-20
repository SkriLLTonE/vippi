import type { ApiErrorBody, ApiErrorDetail } from '@vippi/shared';
import { env } from '../config';

export type ClientErrorCode = ApiErrorBody['error']['code'] | 'NETWORK_ERROR' | 'UNKNOWN';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly details: ApiErrorDetail[] = [],
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

type QueryValue = string | number | boolean | null | undefined | readonly string[];
export type QueryParams = Record<string, QueryValue>;

export function toSearchParams(query: QueryParams | undefined): URLSearchParams {
  const params = new URLSearchParams();
  if (!query) return params;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length > 0) params.set(key, value.join(','));
    } else {
      params.set(key, String(value));
    }
  }
  return params;
}

let unauthorizedHandler: (() => void) | null = null;

/** Called on 401 for any request except the session probe (session expired, FR-003). */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: QueryParams;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
  /** Do not trigger the global 401 handler (used by GET /auth/me). */
  silentUnauthorized?: boolean;
}

function buildUrl(path: string, query?: QueryParams): string {
  const qs = toSearchParams(query).toString();
  return `${env.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`;
}

async function toApiError(res: Response): Promise<ApiError> {
  const retryAfter = Number(res.headers.get('Retry-After')) || undefined;
  try {
    const body = (await res.json()) as Partial<ApiErrorBody>;
    if (body.error?.code) {
      return new ApiError(
        res.status,
        body.error.code,
        body.error.message,
        body.error.details ?? [],
        body.error.requestId,
        retryAfter,
      );
    }
  } catch {
    // Non-JSON error bodies (e.g. proxy errors) fall through to a generic error.
    return new ApiError(res.status, 'UNKNOWN', res.statusText, [], undefined, retryAfter);
  }
  return new ApiError(res.status, 'UNKNOWN', res.statusText, [], undefined, retryAfter);
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.formData) body = opts.formData;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed');
  }
  if (!res.ok) {
    const err = await toApiError(res);
    if (res.status === 401 && !opts.silentUnauthorized) unauthorizedHandler?.();
    throw err;
  }
  return res;
}

export async function apiRequest<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function filenameFrom(res: Response, fallback: string): string {
  const cd = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(cd);
  return match?.[1] ?? fallback;
}

/** Downloads a file response (CSV export, template) through a temporary object URL. */
export async function apiDownload(path: string, query: QueryParams | undefined, fallbackName: string): Promise<string> {
  const res = await send(path, { query, method: 'GET' });
  const blob = await res.blob();
  const name = filenameFrom(res, fallbackName);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
