/**
 * What the application asked the server for, and when.
 *
 * The strongest capability evidence a running application produces. Static
 * analysis has to prove a path from a button through a handler through a service
 * to an endpoint, and the Round 7 diagnostic showed how often that path breaks:
 * `clientService.save` takes its HTTP verb as a parameter, so the module holds
 * no endpoint fact at all. At runtime there is no chain to walk. The request
 * either happened or it did not, and it carries its own method and path.
 *
 * Two disciplines make it evidence rather than noise.
 *
 * **Causality is bounded, not assumed.** A request is attributed to an
 * interaction only if it began inside that interaction's observation window.
 * "Something POSTed shortly afterwards" is how a background refresh becomes a
 * create capability.
 *
 * **Bodies are shapes.** Keys are kept because *the request carried a `plan`
 * field* is a fact about the application; values are not, because *the plan was
 * enterprise* is a fact about a customer.
 *
 * @packageDocumentation
 */

import { redactBody, redactHeaders } from './redact.js';

/** One request the application made. */
export interface ObservedRequest {
  /** Ordinal within the session. Deterministic; not a timestamp. */
  sequence: number;
  method: string;
  /** The path with its base prefix applied, as the graph canonicalises it. */
  path: string;
  /** 2xx, 4xx, 5xx, or `error` when the request never completed. */
  statusCategory: '2xx' | '3xx' | '4xx' | '5xx' | 'error';
  requestBody?: Record<string, string>;
  headers?: Record<string, string>;
  /** The interaction window this began inside, when there was one. */
  duringInteraction?: string;
}

/** A minimal axios-shaped client. Kept structural so nothing is imported. */
export interface ObservableHttpClient {
  defaults: { adapter?: unknown; baseURL?: string };
}

/** What the recorder hands back, plus the ability to stop. */
export interface NetworkRecorder {
  requests: readonly ObservedRequest[];
  /** Names the window subsequent requests belong to. */
  beginInteraction(id: string): void;
  endInteraction(): void;
  restore(): void;
}

/**
 * Axios `params`, as a query string.
 *
 * Deterministic ordering, so the same request produces the same string. Values
 * are passed through because they reach only the in-memory backend, which needs
 * them to answer; nothing here is recorded.
 */
function serialiseParams(params: unknown): string {
  if (params === null || params === undefined || typeof params !== 'object') return '';
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return pairs.sort().join('&');
}

/** How a route is answered in the isolated fixture. */
export type RouteHandler = (request: { method: string; path: string; body: unknown }) => {
  status: number;
  data: unknown;
};

/**
 * Replaces a client's transport with an observing, isolated one.
 *
 * The adapter is the right seam: it sees the request the application actually
 * composed, after interceptors and after the base URL is applied, which is the
 * form the graph's endpoint nodes are canonicalised in. And it never reaches a
 * network — Closed Loop #9 runs against an in-memory backend, so a
 * `SAFE_PROBE` interaction cannot touch anything real. §36's isolation is a
 * property of this function rather than a rule somebody has to remember.
 */
export function recordNetwork(client: ObservableHttpClient, routes: RouteHandler): NetworkRecorder {
  const requests: ObservedRequest[] = [];
  const previous = client.defaults.adapter;
  let sequence = 0;
  let window: string | undefined;

  client.defaults.adapter = async (config: {
    method?: string;
    url?: string;
    baseURL?: string;
    params?: unknown;
    data?: unknown;
    headers?: Record<string, unknown>;
  }) => {
    const method = (config.method ?? 'get').toUpperCase();
    const base = config.baseURL ?? client.defaults.baseURL ?? '';
    const path = `${base}${config.url ?? ''}`;

    // The query is composed by axios from `params`, not written into the url, so
    // an adapter that reads only `url` hands the backend a request the
    // application never made. The first run of the `clients.search` experiment
    // observed no filtering for exactly this reason: the search term was in
    // `params` and never arrived.
    //
    // The query reaches the handler and does *not* reach the record. The graph
    // canonicalises endpoints by method and path — `api:GET:/api/clients` — so
    // recording `?search=Acme` would produce evidence that correlates to no
    // node, and would put a user's search term in an evidence file besides.
    const query = serialiseParams(config.params);
    const body = redactBody(config.data);
    const headers = redactHeaders((config.headers ?? {}) as Record<string, unknown>);

    const answer = routes({
      method,
      path: query.length > 0 ? `${path}?${query}` : path,
      body: config.data,
    });
    const category =
      answer.status >= 500
        ? '5xx'
        : answer.status >= 400
          ? '4xx'
          : answer.status >= 300
            ? '3xx'
            : '2xx';

    sequence += 1;
    requests.push({
      sequence,
      method,
      path,
      statusCategory: category,
      ...(body === undefined ? {} : { requestBody: body }),
      ...(Object.keys(headers).length === 0 ? {} : { headers }),
      ...(window === undefined ? {} : { duringInteraction: window }),
    });

    if (answer.status >= 400) {
      const error = new Error(`Request failed with status code ${answer.status}`) as Error & {
        response: unknown;
      };
      error.response = { status: answer.status, data: answer.data, config, headers: {} };
      throw error;
    }
    return { data: answer.data, status: answer.status, statusText: 'OK', headers: {}, config };
  };

  // Not every request goes through the client. The fixture's audit trail is
  // fetched directly — "served outside the axios client", as its own comment
  // says — and an observer that only replaced the adapter watched the
  // application make a request it never saw, then failed to explain why the
  // audit panel did not appear. A transport nobody is watching is a hole in the
  // evidence, not an absence of behaviour.
  const previousFetch = globalThis.fetch;
  const observedFetch = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = typeof input === 'string' ? input : String((input as { url?: string }).url ?? '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const parts = url.split('?');
    const answer = routes({ method, path: url, body: init?.body });
    sequence += 1;
    requests.push({
      sequence,
      method,
      path: parts[0] ?? url,
      statusCategory:
        answer.status >= 500
          ? '5xx'
          : answer.status >= 400
            ? '4xx'
            : answer.status >= 300
              ? '3xx'
              : '2xx',
      ...(window === undefined ? {} : { duringInteraction: window }),
    });
    return {
      ok: answer.status < 400,
      status: answer.status,
      json: async () => answer.data,
      text: async () => JSON.stringify(answer.data),
    } as unknown as Response;
  };
  globalThis.fetch = observedFetch as unknown as typeof fetch;

  return {
    requests,
    beginInteraction: (id) => {
      window = id;
    },
    endInteraction: () => {
      window = undefined;
    },
    restore: () => {
      client.defaults.adapter = previous;
      globalThis.fetch = previousFetch;
    },
  };
}
