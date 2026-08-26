/**
 * The demo's HTTP client.
 *
 * `baseURL` is a module-scope string literal on purpose: it is what lets the
 * indexer normalise `api.post('/clients')` here and `app.use('/api', router)` in
 * the backend onto the same canonical endpoint node, `api:POST:/api/clients`.
 * A base URL assembled at runtime would be unresolvable, and the indexer would
 * (correctly) refuse to guess it.
 */
export const API_BASE_URL = '/api';

interface RequestOptions {
  method: string;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method,
    headers: { 'content-type': 'application/json' },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) throw new Error(`${options.method} ${path} failed: ${response.status}`);
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
