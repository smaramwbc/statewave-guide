/**
 * The traps.
 *
 * Every case here writes a name the graph knows in a place the graph must not
 * read: a string, a comment, a type position, JSX text. A regular expression
 * over source text would fall into all of them, which is precisely why the
 * extractors only ever walk syntax nodes.
 *
 * Recall is not the concern of this file. Precision is. A relationship invented
 * from a comment would be indistinguishable, downstream, from one proven by the
 * compiler's own parse — and it would arrive wearing the authority of static
 * analysis.
 */

import { describe, expect, it } from 'vitest';
import { indexProject, nodeById, nodesOfKind } from './helpers.js';

const BASE: Record<string, string> = {
  'package.json': '{ "name": "traps" }\n',
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
  'statewave-guide.config.json': JSON.stringify({
    include: ['src/**/*.{ts,tsx}', 'backend/**/*.ts'],
  }),
  'src/services/clientService.ts': [
    'export function createClient(input: unknown): unknown {',
    '  return input;',
    '}',
    '',
  ].join('\n'),
};

const TARGET = 'function:src/services/clientService.ts#createClient';

/** Every edge of a type leaving anywhere, as `source -> target`. */
function callEdges(relationships: readonly { type: string; target: string }[]): string[] {
  return relationships.filter((r) => r.type === 'calls').map((r) => r.target);
}

describe('a known name written somewhere it is not a call', () => {
  it('is not a call when it appears only inside a string literal', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/trap.ts': [
        "import { createClient } from './services/clientService';",
        "export const label = 'createClient()';",
        'export const template = `we call createClient(input) here`;',
        'export function trap(): string {',
        "  return 'createClient';",
        '}',
        'export const keep = createClient;',
        '',
      ].join('\n'),
    });

    expect(nodeById(graph, TARGET)).toBeDefined();
    expect(callEdges(graph.relationships)).not.toContain(TARGET);
  });

  it('is not a call when it appears only inside a comment', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/trap.ts': [
        '/**',
        ' * Historically this called createClient(input) before the rewrite.',
        ' */',
        'export function trap(): number {',
        '  // createClient({});',
        '  return 1;',
        '}',
        '',
      ].join('\n'),
    });

    expect(callEdges(graph.relationships)).not.toContain(TARGET);
  });

  it('is not a call when it appears only in a type position', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/trap.ts': [
        "import { createClient } from './services/clientService';",
        'export type Creator = typeof createClient;',
        'export interface Shape {',
        '  createClient: () => void;',
        '}',
        'export function trap(handler: Creator): Creator {',
        '  return handler;',
        '}',
        '',
      ].join('\n'),
    });

    expect(callEdges(graph.relationships)).not.toContain(TARGET);
  });

  it('is not a call when it appears only in JSX text', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Trap.tsx': [
        'export function Trap() {',
        '  return (',
        '    <p data-guide="trap.note">',
        '      Press the button to run createClient() on the server.',
        '    </p>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    expect(nodeById(graph, 'element:trap.note')).toBeDefined();
    expect(callEdges(graph.relationships)).not.toContain(TARGET);
  });
});

describe('a route handler named somewhere it is not a registration', () => {
  it('does not become an `invokes` edge from a string or a comment', async () => {
    const graph = await indexProject({
      ...BASE,
      'backend/controllers/clientController.ts': [
        'export async function createClient(): Promise<void> {}',
        '',
      ].join('\n'),
      'backend/routes/clients.ts': [
        "import express from 'express';",
        'export const clientsRouter = express.Router();',
        "// clientsRouter.post('/clients', createClient);",
        'export const docs = "clientsRouter.post(\'/clients\', createClient)";',
        '',
      ].join('\n'),
    });

    expect(graph.relationships.filter((relationship) => relationship.type === 'invokes')).toEqual(
      [],
    );
    expect(nodesOfKind(graph, 'api')).toEqual([]);
  });
});

describe('a path written somewhere it is not a request', () => {
  it('does not become an endpoint from a comment', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/trap.ts': [
        '// The server exposes fetch("/api/secret") for internal use.',
        '/* await fetch("/api/also-secret", { method: "POST" }); */',
        'export function trap(): number {',
        '  return 1;',
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
    expect(graph.diagnostics.filter((d) => d.code === 'UNRESOLVED_API_PATH')).toEqual([]);
  });

  it('does not become an endpoint from a plain string', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/trap.ts': [
        'export const documentation = "api.post(\'/clients\', body)";',
        "export const href = '/api/clients';",
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
  });

  it('does not read a domain object as an HTTP client', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/trap.ts': [
        'interface Store {',
        '  get(id: string): string;',
        '  post(id: string): string;',
        '}',
        'export function trap(client: Store): string {',
        "  client.post('/clients');",
        "  return client.get('/clients');",
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
  });
});

describe('a guide id written somewhere it is not an attribute', () => {
  it('does not become an element', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Trap.tsx': [
        'export function Trap() {',
        '  const note = \'data-guide="trap.ghost"\';',
        '  return <p title={note}>trap.ghost</p>;',
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'element')).toEqual([]);
  });
});

describe('a name the graph already owns, claimed by a second declaration', () => {
  it('does not attribute a component-local handler to a module-scope function of the same name', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/ClientsPage.tsx': [
        'export function refresh(): void {',
        "  void fetch('/api/clients', { method: 'DELETE' });",
        '}',
        'export function ClientsPage() {',
        "  const refresh = () => { console.log('just re-renders the list'); };",
        '  return <button data-guide="clients.refresh" onClick={refresh}>Refresh</button>;',
        '}',
        '',
      ].join('\n'),
    });

    // The nested `refresh` yields `function:…#refresh` to the module-scope one,
    // so nothing in this file is addressable as the handler. Emitting the edge
    // anyway said "the Refresh button issues DELETE /api/clients"; it logs.
    expect(graph.relationships.filter((relationship) => relationship.type === 'invokes')).toEqual(
      [],
    );
    expect(
      graph.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'UNRESOLVED_DYNAMIC_CALL' &&
          diagnostic.excerpt?.includes('onClick={refresh}'),
      ),
    ).toBe(true);
  });

  it('does not attribute a form submit to a module-scope function of the same name', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/SubmitPage.tsx': [
        'export function submit(): void {',
        "  void fetch('/api/submit', { method: 'POST' });",
        '}',
        'export function SubmitPage() {',
        "  const submit = () => { console.log('local'); };",
        '  return (',
        '    <form data-guide="submit.form" onSubmit={submit}>',
        '      <button data-guide="submit.go">Go</button>',
        '    </form>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    expect(
      graph.relationships.filter((relationship) => relationship.type === 'submits_to'),
    ).toEqual([]);
    expect(
      graph.diagnostics.some((diagnostic) => diagnostic.code === 'UNSUPPORTED_FORM_PATTERN'),
    ).toBe(true);
  });

  it('still resolves a nested handler whose name nothing else claims', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/Page.tsx': [
        'export function Page() {',
        "  const reallyRefresh = () => { document.title = 'x'; };",
        '  return <button data-guide="page.refresh" onClick={reallyRefresh}>R</button>;',
        '}',
        '',
      ].join('\n'),
    });

    expect(
      graph.relationships.some(
        (relationship) =>
          relationship.type === 'invokes' &&
          relationship.source === 'element:page.refresh' &&
          relationship.target === 'function:src/Page.tsx#reallyRefresh',
      ),
    ).toBe(true);
  });
});

describe('a binding that merely shares a name with something that speaks HTTP', () => {
  it('does not read a locally-declared `fetch` as the global one', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/cache.ts': [
        'const store = new Map<string, string>();',
        'export function readCached(): string | undefined {',
        '  const fetch = (key: string): string | undefined => store.get(key);',
        "  return fetch('/api/clients');",
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
    expect(graph.relationships.filter((relationship) => relationship.type === 'calls_api')).toEqual(
      [],
    );
  });

  it('does not read a plain object called `api` or `http` as a client', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/crm.ts': [
        'export function loadClient() {',
        '  const api = { get: (key: string) => key.toUpperCase() };',
        "  return api.get('/clients/all');",
        '}',
        'const http = { get: (key: string) => key };',
        'export function loadOther() {',
        "  return http.get('/also-not-an-endpoint');",
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api')).toEqual([]);
  });

  it('still reads a real axios client and the global fetch', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/real.ts': [
        "import axios from 'axios';",
        "export const api = axios.create({ baseURL: '/api' });",
        'export function listClients() {',
        "  return api.get('/clients');",
        '}',
        'export function ping() {',
        "  return fetch('/api/ping');",
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'api').map((node) => node.id)).toEqual([
      'api:GET:/api/clients',
      'api:GET:/api/ping',
    ]);
  });
});

describe('a method name that a permission recogniser also uses', () => {
  it('does not read `passport.authorize` as an authorisation fact', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/auth.ts': [
        "import passport from 'passport';",
        "export function mountAuth() { return passport.authorize('google'); }",
        'const oauth = { authorize: (scope: string) => scope };',
        "export function moduleObject() { return oauth.authorize('read:module'); }",
        'export function localObject() {',
        '  const gate = { authorize: (scope: string) => scope };',
        "  return gate.authorize('read:user');",
        '}',
        'export function viaParameter(gateway: { authorize: (s: string) => string }) {',
        "  return gateway.authorize('card_payment');",
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'permission')).toEqual([]);
    expect(
      graph.relationships.filter((relationship) => relationship.type === 'requires_permission'),
    ).toEqual([]);
  });

  it('still reads a recogniser called by the name the config gives', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/middleware.ts': [
        'export function requirePermission(permission: string) {',
        '  return () => permission;',
        '}',
        '',
      ].join('\n'),
      'src/routes.ts': [
        "import { requirePermission } from './middleware';",
        "export function guard() { return requirePermission('clients:create'); }",
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'permission').map((node) => node.id)).toEqual([
      'permission:clients:create',
    ]);
  });
});

describe('a hook that merely shares a name with a router hook', () => {
  it('does not read a project `useNavigate` as a route change', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/useNavigate.ts': [
        'export function useNavigate() {',
        "  return (label: string) => console.log('highlight', label);",
        '}',
        '',
      ].join('\n'),
      'src/router.tsx': [
        "import { Route, Routes } from 'react-router-dom';",
        "import { Reports } from './Reports';",
        'export function AppRouter() {',
        '  return (',
        '    <Routes>',
        '      <Route path="/clients" element={<Reports />} />',
        '      <Route path="/invoices" element={<Reports />} />',
        '    </Routes>',
        '  );',
        '}',
        '',
      ].join('\n'),
      'src/Reports.tsx': [
        "import { useNavigate } from './useNavigate';",
        "import { useNavigate as useNav } from 'react-router-dom';",
        'export function Reports() {',
        '  const highlight = useNavigate();',
        '  const nav = useNav();',
        "  const onPress = () => { highlight('/clients'); };",
        "  const onReal = () => { nav('/invoices'); };",
        '  return (',
        '    <div>',
        '      <button data-guide="reports.press" onClick={onPress}>P</button>',
        '      <button data-guide="reports.real" onClick={onReal}>R</button>',
        '    </div>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    const navigations = graph.relationships
      .filter((relationship) => relationship.type === 'navigates_to')
      .map((relationship) => `${relationship.source} -> ${relationship.target}`);

    // The aliased import *is* react-router's navigator, so it is read; the
    // project's own hook of the same name changes no URL, so it is not.
    expect(navigations).toEqual(['function:src/Reports.tsx#onReal -> route:/invoices']);
  });
});

describe('one element id declared twice', () => {
  it('reads behaviour from the first sighting only', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/PageA.tsx': [
        'export function PageA() {',
        "  const onCreate = () => { document.title = 'create'; };",
        '  return <button data-guide="clients.create" onClick={onCreate}>New</button>;',
        '}',
        '',
      ].join('\n'),
      'src/PageB.tsx': [
        'export function PageB() {',
        "  const onDelete = () => { document.title = 'delete'; };",
        '  return <button data-guide="clients.create" onClick={onDelete}>Delete</button>;',
        '}',
        '',
      ].join('\n'),
    });

    expect(
      graph.relationships
        .filter((relationship) => relationship.type === 'invokes')
        .map((relationship) => relationship.target),
    ).toEqual(['function:src/PageA.tsx#onCreate']);
    expect(graph.diagnostics.some((d) => d.code === 'DUPLICATE_ELEMENT_ID')).toBe(true);
  });
});

describe('one hook imported under two names', () => {
  it('addresses it by the name its package exports, not by the local alias', async () => {
    const graph = await indexProject({
      ...BASE,
      'src/One.tsx': [
        "import { useNavigate } from 'react-router-dom';",
        'export function One() {',
        '  const navigate = useNavigate();',
        '  return <button data-guide="one.go" onClick={() => navigate}>1</button>;',
        '}',
        '',
      ].join('\n'),
      'src/Two.tsx': [
        "import { useNavigate as useNav } from 'react-router-dom';",
        'export function Two() {',
        '  const nav = useNav();',
        '  return <button data-guide="two.go" onClick={() => nav}>2</button>;',
        '}',
        '',
      ].join('\n'),
    });

    expect(nodesOfKind(graph, 'hook').map((node) => node.id)).toEqual([
      'hook:react-router-dom#useNavigate',
    ]);
  });
});
