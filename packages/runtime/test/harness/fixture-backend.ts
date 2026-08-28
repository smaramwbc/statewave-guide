/**
 * The fixture application's data and its in-memory backend.
 *
 * Extracted so the probe harness and the browser host share one source. The
 * seed sizes are load-bearing — "five clients narrowed to two" is a fact about
 * *this* data, cited by verified evidence and by a review artefact — and two
 * copies of it would eventually disagree about what the benchmark observed.
 *
 * There is no network here and cannot be: the axios adapter is replaced, so an
 * interaction physically cannot reach anything real.
 *
 * @packageDocumentation
 */

/** Seed data. Fixed, so the collection sizes below are facts about a script. */
export const CLIENTS = [
  { id: 'c1', name: 'Acme Corp', email: 'ops@acme.test', plan: 'team' },
  { id: 'c2', name: 'Acme Labs', email: 'labs@acme.test', plan: 'free' },
  { id: 'c3', name: 'Borealis', email: 'hi@borealis.test', plan: 'enterprise' },
  { id: 'c4', name: 'Cinder', email: 'team@cinder.test', plan: 'team' },
  { id: 'c5', name: 'Dovetail', email: 'ops@dovetail.test', plan: 'free' },
];

export const INVOICES = [
  {
    id: 'i1',
    clientId: 'c1',
    number: 'INV-001',
    amountInCents: 1000,
    status: 'paid',
    issuedAt: '2026-01-01',
  },
  {
    id: 'i2',
    clientId: 'c2',
    number: 'INV-002',
    amountInCents: 2000,
    status: 'due',
    issuedAt: '2026-01-02',
  },
];

/** The whole backend, as a function. */
export function backend(state: { clients: typeof CLIENTS; settings: Record<string, unknown> }) {
  return ({ method, path, body }: { method: string; path: string; body: unknown }) => {
    // Tracing, without importing `node:process`: this module is also bundled
    // for a browser, where that import is not a thing.
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (env?.env?.['HARNESS_TRACE_ALL'] === '1') {
      // eslint-disable-next-line no-console
      console.log('HARNESS REQ>', method, path);
    }
    const parts = path.split('?');
    const route = parts[0] ?? '';
    const params = new URLSearchParams(parts[1] ?? '');

    if (method === 'GET' && route === '/api/clients') {
      const search = (params.get('search') ?? '').toLowerCase();
      const items = state.clients.filter(
        (client) => search.length === 0 || client.name.toLowerCase().includes(search),
      );
      return { status: 200, data: { items, total: items.length } };
    }
    if (method === 'POST' && route === '/api/clients') {
      const draft = (typeof body === 'string' ? JSON.parse(body) : body) as Record<string, string>;
      const created = { id: `c${state.clients.length + 1}`, ...draft };
      state.clients = [...state.clients, created as (typeof CLIENTS)[number]];
      return { status: 201, data: created };
    }
    if (method === 'DELETE' && route.startsWith('/api/clients/')) {
      const id = route.slice('/api/clients/'.length);
      state.clients = state.clients.filter((client) => client.id !== id);
      return { status: 204, data: null };
    }
    if (method === 'PUT' && route.startsWith('/api/clients/')) {
      return { status: 200, data: state.clients[0] };
    }
    // Before the by-id branch, or `export.csv` is read as a client id and 404s —
    // which is how the export flow produced an unhandled rejection with no
    // obvious cause. The path is configured at runtime
    // (`window.exportPath ?? '/clients/export.csv'`), which is exactly why the
    // static indexer cannot resolve it either.
    if (method === 'GET' && route.endsWith('/export.csv')) {
      return { status: 200, data: 'id,name\nc1,Acme Corp\n' };
    }
    if (method === 'GET' && route.endsWith('/audit')) {
      return {
        status: 200,
        data: [{ id: 'a1', at: '2026-01-01', actor: 'usr_fixture', change: 'plan' }],
      };
    }
    if (method === 'GET' && route.startsWith('/api/clients/')) {
      const id = route.slice('/api/clients/'.length);
      const found = state.clients.find((client) => client.id === id);
      return found === undefined ? { status: 404, data: null } : { status: 200, data: found };
    }
    if (method === 'GET' && route === '/api/invoices') return { status: 200, data: INVOICES };
    if (method === 'POST' && route === '/api/invoices') {
      return { status: 201, data: { ...INVOICES[0], id: 'i9' } };
    }
    if (method === 'GET' && route === '/api/settings') return { status: 200, data: state.settings };
    if (method === 'PUT' && route === '/api/settings') {
      const patch = (typeof body === 'string' ? JSON.parse(body) : body) as Record<string, unknown>;
      state.settings = { ...state.settings, ...patch };
      return { status: 200, data: state.settings };
    }
    if (method === 'POST' && route === '/api/settings/api-key/rotate') {
      return { status: 200, data: { apiKey: 'sk_live_fixture_0000' } };
    }
    if (process.env['HARNESS_TRACE_404'] === '1') {
      // eslint-disable-next-line no-console
      console.log('HARNESS 404>', method, path);
    }
    return { status: 404, data: null };
  };
}
