import { describe, expect, it } from 'vitest';
import type { ApplicationGraph } from '../src/graph.js';
import { edge, indexProject, nodeById, nodesOfKind } from './helpers.js';

const BASE: Record<string, string> = {
  'package.json': '{ "name": "graph-app" }\n',
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
};

/** A config that also indexes a `backend/` tree. */
const FULL_STACK: Record<string, string> = {
  ...BASE,
  'statewave-guide.config.json': JSON.stringify({
    include: ['src/**/*.{ts,tsx}', 'backend/**/*.ts'],
  }),
};

describe('the call graph', () => {
  it('follows a chain across three files', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/db.ts': [
        'export function insert(row: unknown): unknown {',
        '  return row;',
        '}',
        '',
      ].join('\n'),
      'src/repository.ts': [
        "import { insert } from './db';",
        'export function saveClient(row: unknown): unknown {',
        '  return insert(row);',
        '}',
        '',
      ].join('\n'),
      'src/handler.ts': [
        "import { saveClient } from './repository';",
        'export function handle(row: unknown): unknown {',
        '  return saveClient(row);',
        '}',
        '',
      ].join('\n'),
    });

    expect(
      edge(
        graph,
        'function:src/handler.ts#handle',
        'calls',
        'function:src/repository.ts#saveClient',
      ),
    ).toBeDefined();
    expect(
      edge(graph, 'function:src/repository.ts#saveClient', 'calls', 'function:src/db.ts#insert'),
    ).toBeDefined();
    expect(graph.health.integrity).toBe('PASS');
  });

  it('scores a same-file call at 1.0 and an imported one at 0.95', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/helpers.ts': 'export function help(): void {}\n',
      'src/main.ts': [
        "import { help } from './helpers';",
        'function local(): void {}',
        'export function main(): void {',
        '  local();',
        '  help();',
        '}',
        '',
      ].join('\n'),
    });

    expect(
      edge(graph, 'function:src/main.ts#main', 'calls', 'function:src/main.ts#local'),
    ).toMatchObject({ confidence: 1 });
    expect(
      edge(graph, 'function:src/main.ts#main', 'calls', 'function:src/helpers.ts#help'),
    ).toMatchObject({ confidence: 0.95 });
  });

  it('reports a computed member call rather than guessing at it', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/main.ts': [
        'export function main(api: Record<string, () => void>, method: string): void {',
        '  api[method]();',
        '}',
        '',
      ].join('\n'),
    });

    const diagnostic = graph.diagnostics.find((d) => d.code === 'UNRESOLVED_DYNAMIC_CALL');
    expect(diagnostic?.severity).toBe('info');
    expect(diagnostic?.excerpt).toContain('api[method]()');
    expect(graph.health.unresolvedCalls).toBe(1);
  });

  it('reports a call on a parameter', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/main.ts': [
        'export function main({ onSave }: { onSave: () => void }): void {',
        '  onSave();',
        '}',
        '',
      ].join('\n'),
    });

    expect(
      graph.diagnostics.some(
        (d) => d.code === 'UNRESOLVED_DYNAMIC_CALL' && d.message.includes('parameter'),
      ),
    ).toBe(true);
  });
});

describe('services', () => {
  const project: Record<string, string> = {
    ...BASE,
    'src/clientService.ts': [
      'export const clientService = {',
      '  create(input: unknown) {',
      '    return input;',
      '  },',
      '  async list() {',
      '    return [];',
      '  },',
      '};',
      '',
      'export const settings = { name: "x", locale: "en" };',
      '',
      'export const oneCallback = { onDone: () => 1, label: "x", tone: "y" };',
      '',
      'export class Mailer {',
      '  send(to: string) {',
      '    return to;',
      '  }',
      '  queue(to: string) {',
      '    return to;',
      '  }',
      '}',
      '',
    ].join('\n'),
    'src/caller.ts': [
      "import { clientService } from './clientService';",
      'export function caller(): unknown {',
      '  return clientService.create({});',
      '}',
      '',
    ].join('\n'),
  };

  let graph: ApplicationGraph | undefined;
  const load = async (): Promise<ApplicationGraph> => (graph ??= await indexProject(project));

  it('recognises an object of functions and a class of methods', async () => {
    const built = await load();
    const ids = nodesOfKind(built, 'service').map((service) => service.id);
    expect(ids).toContain('service:src/clientService.ts#clientService');
    expect(ids).toContain('service:src/clientService.ts#Mailer');
  });

  it('does not turn a record of data into a service', async () => {
    const built = await load();
    expect(nodeById(built, 'service:src/clientService.ts#settings')).toBeUndefined();
    // One callback among data is a config object, not a service surface.
    expect(nodeById(built, 'service:src/clientService.ts#oneCallback')).toBeUndefined();
  });

  it('records the naming convention as metadata only', async () => {
    const built = await load();
    expect(nodeById(built, 'service:src/clientService.ts#clientService')).toMatchObject({
      detectedFrom: 'object-literal',
      nameSuggestsService: true,
    });
    expect(nodeById(built, 'service:src/clientService.ts#Mailer')).toMatchObject({
      detectedFrom: 'class',
      nameSuggestsService: false,
    });
  });

  it('keeps memberIds and ownerId consistent', async () => {
    const built = await load();
    const service = nodesOfKind(built, 'service').find(
      (candidate) => candidate.name === 'clientService',
    );
    expect(service?.memberIds).toEqual([
      'function:src/clientService.ts#clientService.create',
      'function:src/clientService.ts#clientService.list',
    ]);
    for (const id of service?.memberIds ?? []) {
      expect(nodeById(built, id)).toMatchObject({ ownerId: service?.id });
    }
  });

  it('records `uses_service` alongside the call to a member', async () => {
    const built = await load();
    expect(
      edge(
        built,
        'function:src/caller.ts#caller',
        'calls',
        'function:src/clientService.ts#clientService.create',
      ),
    ).toBeDefined();
    expect(
      edge(
        built,
        'function:src/caller.ts#caller',
        'uses_service',
        'service:src/clientService.ts#clientService',
      ),
    ).toBeDefined();
  });
});

describe('outgoing HTTP calls', () => {
  it('reads every supported shape, applying the base URL', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/http.ts': [
        "import axios from 'axios';",
        "export const api = axios.create({ baseURL: '/api' });",
        '',
      ].join('\n'),
      'src/calls.ts': [
        "import axios from 'axios';",
        "import { api } from './http';",
        "const CLIENTS_PATH = '/clients';",
        'export async function plainFetch() {',
        "  return fetch('/health');",
        '}',
        'export async function postingFetch() {',
        "  return fetch('/signup', { method: 'POST' });",
        '}',
        'export async function axiosDirect() {',
        "  return axios.get('/version');",
        '}',
        'export async function clientCall(body: unknown) {',
        '  return api.post(CLIENTS_PATH, body);',
        '}',
        'export async function templated(id: string) {',
        '  return api.get(`/clients/${id}`);',
        '}',
        '',
      ].join('\n'),
    });

    const endpoints = nodesOfKind(graph, 'api').map((node) => node.id);
    expect(endpoints).toContain('api:GET:/health');
    expect(endpoints).toContain('api:POST:/signup');
    expect(endpoints).toContain('api:GET:/version');
    // The base URL of the client is applied, and the module constant resolved.
    expect(endpoints).toContain('api:POST:/api/clients');
    // A variable segment becomes a parameter placeholder, not a guess — and the
    // placeholder is positional, so the caller's `${id}` and a server's
    // `:clientId` address one endpoint rather than two.
    expect(endpoints).toContain('api:GET:/api/clients/:param');
    expect(
      nodesOfKind(graph, 'api').find((node) => node.id === 'api:GET:/api/clients/:param')?.path,
    ).toBe('/api/clients/:id');

    expect(
      edge(graph, 'function:src/calls.ts#plainFetch', 'calls_api', 'api:GET:/health'),
    ).toMatchObject({ confidence: 1 });
    const viaClient = edge(
      graph,
      'function:src/calls.ts#clientCall',
      'calls_api',
      'api:POST:/api/clients',
    );
    expect(viaClient?.confidence).toBe(0.9);
    expect(viaClient?.evidence.map((evidence) => evidence.rule).sort()).toEqual([
      'http-client-member-call',
      'module-constant-string',
    ]);
  });

  it('refuses a path it cannot spell out, and says so', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/calls.ts': [
        'export async function assembled(base: string, id: string) {',
        '  await fetch(base + id);',
        '  await fetch(`/clients/${id.trim()}`);',
        '}',
        '',
      ].join('\n'),
    });

    const refused = graph.diagnostics.filter((d) => d.code === 'UNRESOLVED_API_PATH');
    expect(refused).toHaveLength(2);
    expect(graph.health.unresolvedApiPaths).toBe(2);
    expect(nodesOfKind(graph, 'api')).toEqual([]);
  });

  it('does not read a request off a project function that happens to be called fetch', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/calls.ts': [
        'function fetch(path: string): string {',
        '  return path;',
        '}',
        'export function go(): string {',
        "  return fetch('/clients');",
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
    expect(
      edge(graph, 'function:src/calls.ts#go', 'calls', 'function:src/calls.ts#fetch'),
    ).toBeDefined();
  });
});

describe('backend routes', () => {
  const EXPRESS: Record<string, string> = {
    ...FULL_STACK,
    'backend/controllers/clientController.ts': [
      'export async function createClient(request: unknown): Promise<unknown> {',
      '  return request;',
      '}',
      'export async function listClients(): Promise<unknown[]> {',
      '  return [];',
      '}',
      '',
    ].join('\n'),
    'backend/middleware/permissions.ts': [
      'export function requirePermission(permission: string) {',
      '  return () => permission;',
      '}',
      '',
    ].join('\n'),
    'backend/routes/clients.ts': [
      "import express from 'express';",
      "import { createClient, listClients } from '../controllers/clientController';",
      "import { requirePermission } from '../middleware/permissions';",
      'export const clientsRouter = express.Router();',
      "clientsRouter.post('/clients', requirePermission('clients:create'), createClient);",
      "clientsRouter.get('/clients', listClients);",
      '',
    ].join('\n'),
    'backend/app.ts': [
      "import express from 'express';",
      "import { clientsRouter } from './routes/clients';",
      'const app = express();',
      "app.use('/api', clientsRouter);",
      '',
    ].join('\n'),
  };

  it('applies the mount prefix, links the handler and records the permission', async () => {
    const graph = await indexProject(EXPRESS);

    expect(nodeById(graph, 'api:POST:/api/clients')).toMatchObject({
      method: 'POST',
      path: '/api/clients',
      observedOn: ['backend'],
    });
    // The unprefixed path must not survive alongside the mounted one.
    expect(nodeById(graph, 'api:POST:/clients')).toBeUndefined();

    expect(
      edge(
        graph,
        'api:POST:/api/clients',
        'invokes',
        'function:backend/controllers/clientController.ts#createClient',
      ),
    ).toMatchObject({ confidence: 0.9 });
    expect(
      edge(graph, 'api:POST:/api/clients', 'requires_permission', 'permission:clients:create'),
    ).toBeDefined();
    expect(nodeById(graph, 'permission:clients:create')).toMatchObject({
      permission: 'clients:create',
    });
  });

  it('registers a router at its own paths when the mount prefix is not a literal', async () => {
    const graph = await indexProject({
      ...EXPRESS,
      'backend/app.ts': [
        "import express from 'express';",
        "import { clientsRouter } from './routes/clients';",
        'const app = express();',
        'const prefix = process.env.PREFIX ?? "/api";',
        'app.use(prefix, clientsRouter);',
        '',
      ].join('\n'),
    });

    // ADR 0006: the endpoint is recorded at the only path the source states,
    // marked as missing a prefix so it can never merge with a resolved endpoint
    // that happens to spell the same string.
    expect(nodeById(graph, 'api:POST:?/clients')).toBeDefined();
    expect(nodeById(graph, 'api:POST:/clients')).toBeUndefined();
    expect(nodeById(graph, 'api:POST:/api/clients')).toBeUndefined();
    expect(
      graph.diagnostics.some(
        (d) => d.code === 'UNSUPPORTED_ROUTING_PATTERN' && d.message.includes('not a literal'),
      ),
    ).toBe(true);
  });

  it('never merges an endpoint whose prefix is unknown into one whose prefix is known', async () => {
    const graph = await indexProject({
      ...EXPRESS,
      'backend/routes/legacy.ts': [
        "import express from 'express';",
        "import { listLegacy } from '../controllers/legacyController';",
        'export const legacyRouter = express.Router();',
        "legacyRouter.get('/clients', listLegacy);",
        '',
      ].join('\n'),
      'backend/controllers/legacyController.ts': [
        'export async function listLegacy(): Promise<unknown[]> {',
        '  return [];',
        '}',
        '',
      ].join('\n'),
      'backend/app.ts': [
        "import express from 'express';",
        "import { clientsRouter } from './routes/clients';",
        "import { legacyRouter } from './routes/legacy';",
        'const app = express();',
        "app.use('/api', clientsRouter);",
        'app.use(process.env.LEGACY ?? "/v0", legacyRouter);',
        '',
      ].join('\n'),
    });

    // Both routers register the string `/clients`. One of them is reachable at
    // `/api/clients`; the other is at a prefix nobody can read. Merging them
    // would say a request to `GET /api/clients` may be served by code that has
    // never seen that path — a fabricated relationship carrying real
    // provenance, which is the worst kind.
    expect(nodeById(graph, 'api:GET:/api/clients')).toBeDefined();
    expect(nodeById(graph, 'api:GET:?/clients')).toBeDefined();
    expect(
      edge(
        graph,
        'api:GET:/api/clients',
        'invokes',
        'function:backend/controllers/legacyController.ts#listLegacy',
      ),
    ).toBeUndefined();
    expect(
      edge(
        graph,
        'api:GET:?/clients',
        'invokes',
        'function:backend/controllers/legacyController.ts#listLegacy',
      ),
    ).toBeDefined();
  });

  it('counts server registrations towards the API paths resolved figure', async () => {
    const graph = await indexProject({
      ...EXPRESS,
      'backend/app.ts': [
        "import express from 'express';",
        "import { clientsRouter } from './routes/clients';",
        'const app = express();',
        'app.use(process.env.PREFIX ?? "/api", clientsRouter);',
        '',
      ].join('\n'),
    });

    // A backend-only project used to report 100% resolved in the same breath as
    // it warned about the very registrations it could not place, because only
    // the client half of the pass fed the counters.
    expect(graph.health.unresolvedApiPaths).toBe(2);
    expect(graph.health.resolvedApiPaths).toBe(0);
  });

  it('reads Fastify method calls and route objects', async () => {
    const graph = await indexProject({
      ...FULL_STACK,
      'backend/server.ts': [
        "import Fastify from 'fastify';",
        'export const server = Fastify();',
        "server.post('/clients', {}, async () => ({}));",
        "server.route({ method: 'DELETE', url: '/clients/:id', handler: removeClient });",
        'async function removeClient(): Promise<void> {}',
        '',
      ].join('\n'),
    });

    expect(nodeById(graph, 'api:POST:/clients')).toBeDefined();
    expect(nodeById(graph, 'api:DELETE:/clients/:param')).toBeDefined();
    expect(
      edge(
        graph,
        'api:DELETE:/clients/:param',
        'invokes',
        'function:backend/server.ts#removeClient',
      ),
    ).toBeDefined();
  });

  it('does not mistake Express’s settings getter for a route', async () => {
    const graph = await indexProject({
      ...FULL_STACK,
      'backend/app.ts': [
        "import express from 'express';",
        'const app = express();',
        "export const port = app.get('port');",
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
  });
});

describe('the frontend/backend join', () => {
  it('produces one endpoint node observed on both sides', async () => {
    const graph = await indexProject({
      ...FULL_STACK,
      'src/lib/http.ts': [
        "import axios from 'axios';",
        "export const api = axios.create({ baseURL: '/api' });",
        '',
      ].join('\n'),
      'src/services/clientService.ts': [
        "import { api } from '../lib/http';",
        'export const clientService = {',
        '  create(input: unknown) {',
        "    return api.post('/clients', input);",
        '  },',
        '  list() {',
        "    return api.get('/clients');",
        '  },',
        '};',
        '',
      ].join('\n'),
      'backend/controllers/clientController.ts': [
        'export async function createClient(): Promise<void> {}',
        'export async function listClients(): Promise<void> {}',
        '',
      ].join('\n'),
      'backend/routes/clients.ts': [
        "import express from 'express';",
        "import { createClient, listClients } from '../controllers/clientController';",
        'export const clientsRouter = express.Router();',
        "clientsRouter.post('/clients', createClient);",
        "clientsRouter.get('/clients', listClients);",
        '',
      ].join('\n'),
      'backend/app.ts': [
        "import express from 'express';",
        "import { clientsRouter } from './routes/clients';",
        'const app = express();',
        "app.use('/api', clientsRouter);",
        '',
      ].join('\n'),
    });

    const endpoints = nodesOfKind(graph, 'api');
    expect(endpoints.map((node) => node.id)).toEqual([
      'api:GET:/api/clients',
      'api:POST:/api/clients',
    ]);

    for (const endpoint of endpoints) {
      expect(endpoint.observedOn).toEqual(['backend', 'frontend']);
      const files = endpoint.provenances.map((provenance) => provenance.file);
      expect(files).toContain('src/services/clientService.ts');
      expect(files).toContain('backend/routes/clients.ts');
    }

    expect(graph.health.joinedEndpoints).toBe(2);
    expect(graph.health.frontendOnlyEndpoints).toBe(0);
    expect(graph.health.backendOnlyEndpoints).toBe(0);

    // The whole point: a UI-side function reaches a server-side one.
    expect(
      edge(
        graph,
        'function:src/services/clientService.ts#clientService.create',
        'calls_api',
        'api:POST:/api/clients',
      ),
    ).toBeDefined();
    expect(
      edge(
        graph,
        'api:POST:/api/clients',
        'invokes',
        'function:backend/controllers/clientController.ts#createClient',
      ),
    ).toBeDefined();
  });

  it('counts an endpoint only one side knows about', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/calls.ts': ['export async function go() {', "  return fetch('/orphan');", '}', ''].join(
        '\n',
      ),
    });

    expect(graph.health.frontendOnlyEndpoints).toBe(1);
    expect(graph.health.joinedEndpoints).toBe(0);
  });
});

describe('graph health', () => {
  it('checks that every edge points at a node that exists', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/main.ts': 'export function main(): void {}\n',
    });

    expect(graph.health.integrity).toBe('PASS');
    expect(graph.health.danglingRelationships).toEqual([]);

    const ids = new Set(graph.nodes.map((node) => node.id));
    for (const relationship of graph.relationships) {
      expect(ids.has(relationship.source)).toBe(true);
      expect(ids.has(relationship.target)).toBe(true);
    }
  });

  it('emits only confidences from the fixed scale', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/helpers.ts': 'export function help(): void {}\n',
      'src/main.ts': [
        "import { help } from './helpers';",
        'export function main(): void {',
        '  help();',
        '}',
        '',
      ].join('\n'),
    });

    for (const relationship of graph.relationships) {
      expect([1, 0.95, 0.9]).toContain(relationship.confidence);
      expect(relationship.evidence.length).toBeGreaterThan(0);
      for (const evidence of relationship.evidence) {
        if (evidence.type === 'static-inference') expect(evidence.rule).toBeDefined();
        else expect(evidence.rule).toBeUndefined();
      }
    }
  });
});
