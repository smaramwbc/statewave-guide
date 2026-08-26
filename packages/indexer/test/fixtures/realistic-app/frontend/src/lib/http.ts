/**
 * The one HTTP client every service in this application goes through.
 *
 * The `baseURL` is the single most important line in the frontend as far as the
 * indexer is concerned: every service writes its path *without* the prefix, so
 * `api.post('/clients', draft)` reaches `POST /api/clients` at runtime and has
 * to normalise back to the canonical `/clients` in the graph. The backend
 * mounts its routers under the same prefix, which is what lets both sides land
 * on one `api:POST:/clients` node.
 */
import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';

/** Where the API is mounted. Must match `API_PREFIX` in `backend/src/server.ts`. */
export const API_BASE_URL = '/api';

/** Requests are abandoned after this long. */
export const REQUEST_TIMEOUT_MS = 15000;

/** Key the bearer token is cached under. Not a path, despite the slashes. */
export const TOKEN_STORAGE_KEY = 'statewave/session/token';

/**
 * The module-scope client binding. Services import *this* symbol, which is what
 * makes `api.get(...)` attributable to a known base URL.
 */
export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token !== null) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (cause: unknown) => Promise.reject(toHttpError(cause)),
);

/** Reads the cached bearer token, or `null` when the user is signed out. */
export function readToken(): string | null {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

/** An HTTP failure with the status code preserved. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Normalises whatever axios rejected with into an {@link HttpError}. */
export function toHttpError(cause: unknown): HttpError {
  if (cause instanceof HttpError) return cause;
  const response = (cause as { response?: { status?: number; data?: { message?: string } } }).response;
  const status = response?.status ?? 0;
  const message = response?.data?.message ?? 'The request failed';
  return new HttpError(status, message, response?.data);
}

/**
 * Unwraps an axios response to its payload.
 *
 * Every service returns `unwrap(api.something(...))`, so the call that carries
 * the path is always the *argument* of `unwrap` rather than the outermost call.
 * An extractor that only looks at the top-level callee sees `unwrap` and finds
 * no endpoint at all.
 */
export async function unwrap<T>(request: Promise<AxiosResponse<T>>): Promise<T> {
  const response = await request;
  return response.data;
}
