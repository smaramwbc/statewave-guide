/**
 * The whole point, end to end: from a semantic id to the endpoint behind it.
 *
 * `resolveFeaturePath` is the query a runtime will ask when a user points at a
 * button and says "what does this do?". This file asserts the answer twice.
 *
 * First against a purpose-built application, where every hop is written to be
 * provable, so a regression in any one extractor breaks a named assertion
 * rather than quietly shortening a chain.
 *
 * Then against the benchmark fixture, if it is present. That one is the honest
 * test: it was written by someone else, it contains patterns this indexer
 * refuses on purpose, and the chain it produces is therefore allowed to stop
 * short. What is asserted there is not that the chain is long, but that it is
 * *true* — every hop it does take is one the fixture's own manifest agrees with,
 * the full chain exists in the graph even where the greedy walk does not take
 * it, and the gap says where it stopped.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '../src/indexer.js';
import { createGraphQuery } from '../src/traversal.js';
import type { GraphQuery } from '../src/traversal.js';
import { indexProject } from './helpers.js';

const FIXTURE = fileURLToPath(new URL('./fixtures/realistic-app', import.meta.url));
const AVAILABLE = existsSync(FIXTURE);

function lines(...source: string[]): string {
  return `${source.join('\n')}\n`;
}

/** A miniature of the flagship flow, with every hop written to be provable. */
const APP: Record<string, string> = {
  'package.json': '{ "name": "feature-path" }\n',
  'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
  'src/lib/http.ts': lines(
    "import axios from 'axios';",
    "export const api = axios.create({ baseURL: '/api' });",
  ),
  'src/services/clientService.ts': lines(
    "import { api } from '../lib/http';",
    "const CLIENTS_PATH = '/clients';",
    'export const clientService = {',
    '  async create(draft: unknown): Promise<unknown> {',
    '    return api.post(CLIENTS_PATH, draft);',
    '  },',
    '  async list(): Promise<unknown> {',
    '    return api.get(CLIENTS_PATH);',
    '  },',
    '};',
  ),
  'src/components/ClientForm.tsx': lines(
    "import { clientService } from '../services/clientService';",
    'export function ClientForm() {',
    '  const submitClient = async (): Promise<void> => {',
    '    await clientService.create({ name: "Acme" });',
    '  };',
    '  return <form data-guide="clients.create-dialog.form" onSubmit={submitClient} />;',
    '}',
  ),
  'src/components/NewClientDialog.tsx': lines(
    "import { ClientForm } from './ClientForm';",
    'export function NewClientDialog() {',
    '  return <div role="dialog"><ClientForm /></div>;',
    '}',
  ),
  'src/pages/ClientsPage.tsx': lines(
    "import { useState } from 'react';",
    "import { NewClientDialog } from '../components/NewClientDialog';",
    "import { PermissionGate } from '../permissions/PermissionGate';",
    'export function ClientsPage() {',
    '  const [isCreateOpen, setIsCreateOpen] = useState(false);',
    '  const openCreateClient = (): void => { setIsCreateOpen(true); };',
    '  return (',
    '    <section>',
    '      <PermissionGate permission="clients:create">',
    '        <button data-guide="clients.create" onClick={openCreateClient}>New client</button>',
    '      </PermissionGate>',
    '      {isCreateOpen ? <NewClientDialog /> : null}',
    '    </section>',
    '  );',
    '}',
  ),
  'src/permissions/PermissionGate.tsx': lines(
    'export function PermissionGate({ children }: { permission: string; children: unknown }) {',
    '  return <>{children}</>;',
    '}',
  ),
  'src/App.tsx': lines(
    "import { Route, Routes } from 'react-router-dom';",
    "import { ClientsPage } from './pages/ClientsPage';",
    'export function App() {',
    '  return <Routes><Route path="/clients" element={<ClientsPage />} /></Routes>;',
    '}',
  ),
};

describe('resolveFeaturePath over an application whose every hop is provable', () => {
  it('walks a semantic id to the dialog it opens, and reaches the endpoint behind it', async () => {
    const graph = await indexProject(APP);
    const query = createGraphQuery(graph);
    const path = query.resolveFeaturePath('clients.create');

    expect(path.start).toBe('element:clients.create');
    expect(path.container).toBe('component:src/pages/ClientsPage.tsx#ClientsPage');
    expect(path.routes).toEqual(['/clients']);
    expect(path.permissions).toEqual(['clients:create']);

    expect(path.path.map((step) => `${step.relationship} ${step.target}`)).toEqual([
      'invokes function:src/pages/ClientsPage.tsx#openCreateClient',
      'opens component:src/components/NewClientDialog.tsx#NewClientDialog',
      'renders component:src/components/ClientForm.tsx#ClientForm',
      'submits_to function:src/components/ClientForm.tsx#submitClient',
      // `calls` outranks `uses_service` in the walk order: a uses_service edge
      // points at the service *object*, which has no outgoing behaviour, so
      // preferring it stranded the chain one hop short of the endpoint — which
      // this test's own name says it should reach.
      'calls function:src/services/clientService.ts#clientService.create',
      'calls_api api:POST:/api/clients',
    ]);

    // Every hop carries the file and line that justified it.
    for (const step of path.path) {
      expect(step.evidence.length).toBeGreaterThan(0);
      for (const evidence of step.evidence) {
        expect(evidence.file).not.toBe('');
        expect(evidence.line).toBeGreaterThan(0);
      }
    }

    // The chain the greedy walk prefers stops at the service; the endpoint is
    // still reachable, which is what `findPath` is for.
    const toEndpoint = query.findPath('element:clients.create', 'api:POST:/api/clients');
    expect(toEndpoint?.map((step) => step.relationship)).toEqual([
      'invokes',
      'opens',
      'renders',
      'submits_to',
      'calls',
      'calls_api',
    ]);
  });

  it('reports an honest gap when the chain runs out of provable behaviour', async () => {
    const graph = await indexProject(APP);
    const path = createGraphQuery(graph).resolveFeaturePath('clients.create');

    expect(path.gap.reason).toBe('no-further-behaviour');
    // The gap names a node the graph actually holds, so a reader can look at it.
    expect(createGraphQuery(graph).getNode(path.gap.at)).toBeDefined();
    expect(path.gap.at).toBe(path.path[path.path.length - 1]?.target);
  });

  it('says so, rather than inventing a path, when the element is not in the graph', async () => {
    const graph = await indexProject(APP);
    const path = createGraphQuery(graph).resolveFeaturePath('clients.nonexistent');

    expect(path.start).toBe('element:clients.nonexistent');
    expect(path.path).toEqual([]);
    expect(path.container).toBeUndefined();
    expect(path.gap).toEqual({
      at: 'element:clients.nonexistent',
      reason: 'start-not-found',
      relatedDiagnostics: [],
    });
  });

  it('surfaces the diagnostics recorded where the chain stopped', async () => {
    const graph = await indexProject({
      ...APP,
      'src/pages/ExportPage.tsx': lines(
        'const exporters: Record<string, () => void> = {};',
        'export function ExportPage() {',
        '  const exportClients = (): void => {',
        '    const format = window.location.hash;',
        '    exporters[format]();',
        '  };',
        '  return <button data-guide="clients.export" onClick={exportClients}>Export</button>;',
        '}',
      ),
    });

    const path = createGraphQuery(graph).resolveFeaturePath('clients.export');
    expect(path.path.map((step) => step.target)).toEqual([
      'function:src/pages/ExportPage.tsx#exportClients',
    ]);
    expect(path.gap.reason).toBe('no-further-behaviour');
    // The computed member is refused deliberately; the refusal is what the gap
    // hands back, so a reader sees a decision rather than a silence.
    expect(path.gap.relatedDiagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'UNRESOLVED_DYNAMIC_CALL',
    );
  });
});

// ---------------------------------------------------------------------------
// The benchmark fixture, when it is there.
// ---------------------------------------------------------------------------

/** Indexes the benchmark fixture, which is two packages under one root. */
async function queryFixture(): Promise<GraphQuery> {
  const { graph } = await createProjectIndexer({
    root: FIXTURE,
    config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
  }).index();
  return createGraphQuery(graph);
}

describe.skipIf(!AVAILABLE)('resolveFeaturePath over the benchmark fixture', () => {
  it('places clients.create on its route, under its permission, in its page', async () => {
    const query = await queryFixture();
    const path = query.resolveFeaturePath('clients.create');

    expect(path.container).toBe('component:frontend/src/pages/ClientsPage.tsx#ClientsPage');
    expect(path.routes).toEqual(['/clients']);
    expect(path.permissions).toEqual(['clients:create']);
  });

  it('takes the three hops the fixture says are provable, in order', async () => {
    const query = await queryFixture();
    const path = query.resolveFeaturePath('clients.create');

    expect(path.path.slice(0, 3).map((step) => `${step.relationship} ${step.target}`)).toEqual([
      'invokes function:frontend/src/pages/ClientsPage.tsx#openCreateClient',
      'opens component:frontend/src/components/NewClientDialog.tsx#NewClientDialog',
      'renders component:frontend/src/components/ClientForm.tsx#ClientForm',
    ]);
  });

  it('holds the whole flagship chain, endpoint included, even where the walk turns aside', async () => {
    const query = await queryFixture();

    // `BEHAVIOUR_ORDER` ranks `renders` above `submits_to`, so from a component
    // that both renders a button and hosts a form the greedy walk takes the
    // button. The submit hop is still in the graph, and this is what proves it.
    const chain = query.findPath('element:clients.create', 'api:POST:/api/clients');
    expect(chain?.map((step) => `${step.relationship} ${step.target}`)).toEqual([
      'invokes function:frontend/src/pages/ClientsPage.tsx#openCreateClient',
      'opens component:frontend/src/components/NewClientDialog.tsx#NewClientDialog',
      'renders component:frontend/src/components/ClientForm.tsx#ClientForm',
      'submits_to function:frontend/src/components/ClientForm.tsx#submitClient',
      'calls function:frontend/src/services/clientService.ts#clientService.create',
      'calls_api api:POST:/api/clients',
    ]);

    // And the backend half meets the frontend on that one endpoint node.
    const endpoint = query.getNode('api:POST:/api/clients');
    expect(endpoint).toMatchObject({ kind: 'api', observedOn: ['backend', 'frontend'] });
    expect(
      query
        .getOutgoing('api:POST:/api/clients', 'invokes')
        .map((relationship) => relationship.target),
    ).toContain('function:backend/src/controllers/clientController.ts#createClient');
  });

  it('stops where a service hands the write verb in as an argument, and names the gap', async () => {
    const query = await queryFixture();
    const path = query.resolveFeaturePath('client-detail.change-plan');

    expect(path.path.map((step) => `${step.relationship} ${step.target}`)).toEqual([
      'invokes function:frontend/src/pages/ClientDetailPage.tsx#changePlan',
      // The walk is greedy and follows one branch. `changePlan` both calls the
      // resolvable read path and issues a refused `api[method](path, patch)`
      // write, so the chain descends the read side — across the network boundary
      // and down to the database helper. The refusal still surfaces, because
      // `gap.relatedDiagnostics` covers every file the chain passed through
      // rather than only the file it stopped in.
      'calls function:frontend/src/pages/ClientDetailPage.tsx#load',
      'calls function:frontend/src/services/clientService.ts#clientService.get',
      'calls_api api:GET:/api/clients/:param',
      'invokes function:backend/src/controllers/clientController.ts#getClient',
      'calls function:backend/src/services/clientService.ts#clientService.get',
      'calls function:backend/src/lib/db.ts#queryOne',
      'calls function:backend/src/lib/db.ts#query',
      'calls function:backend/src/lib/db.ts#pool.execute',
    ]);
    expect(path.gap.reason).toBe('no-further-behaviour');
    expect(path.gap.at).toBe('function:backend/src/lib/db.ts#pool.execute');
    // `api[method](path, patch)` is refused on purpose; the diagnostic that says
    // so is exactly what a developer needs in order to know why this stops.
    expect(path.gap.relatedDiagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'UNRESOLVED_DYNAMIC_CALL',
    );
  });

  it('walks a native form to its handler', async () => {
    const query = await queryFixture();
    const path = query.resolveFeaturePath('settings.form');

    expect(path.routes).toEqual(['/settings']);
    expect(path.path[0]).toMatchObject({
      relationship: 'submits_to',
      target: 'function:frontend/src/pages/SettingsPage.tsx#saveSettings',
    });
  });

  it('walks a navigation link to the route it reaches', async () => {
    const query = await queryFixture();
    const path = query.resolveFeaturePath('nav.clients');

    expect(path.path[0]).toMatchObject({
      relationship: 'navigates_to',
      target: 'route:/clients',
      confidence: 1,
    });
  });
});
