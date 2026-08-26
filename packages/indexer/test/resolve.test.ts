import { describe, expect, it } from 'vitest';
import type { ApplicationGraph } from '../src/graph.js';
import { edge, indexProject } from './helpers.js';

/** Every project here shares a tsconfig; only the modules differ. */
const TSCONFIG = '{ "compilerOptions": { "jsx": "react-jsx" } }\n';

/** A module declaring the function the caller is trying to reach. */
const TARGET = ['export function createClient(): string {', "  return 'ok';", '}', ''].join('\n');

function caller(body: string, imports: string): string {
  return [imports, 'export function caller(): void {', `  ${body}`, '}', ''].join('\n');
}

const CALLER_ID = 'function:src/caller.ts#caller';
const TARGET_ID = 'function:src/services/clientService.ts#createClient';

async function indexWith(files: Record<string, string>): Promise<ApplicationGraph> {
  return indexProject({
    'tsconfig.json': TSCONFIG,
    'package.json': '{ "name": "resolution" }\n',
    ...files,
  });
}

describe('cross-file symbol resolution', () => {
  it('follows a named import', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': caller(
        'createClient();',
        "import { createClient } from './services/clientService';",
      ),
    });

    const relationship = edge(graph, CALLER_ID, 'calls', TARGET_ID);
    expect(relationship).toBeDefined();
    expect(relationship?.confidence).toBe(0.95);
    expect(relationship?.evidence[0]).toMatchObject({
      type: 'static-inference',
      rule: 'import-symbol-resolution',
      file: 'src/caller.ts',
    });
  });

  it('follows an aliased named import', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': caller(
        'create();',
        "import { createClient as create } from './services/clientService';",
      ),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });

  it('follows a default import', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': [
        'export default function createClient(): string {',
        "  return 'ok';",
        '}',
        '',
      ].join('\n'),
      'src/caller.ts': caller('anything();', "import anything from './services/clientService';"),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });

  it('follows a namespace import and its member', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': caller(
        'svc.createClient();',
        "import * as svc from './services/clientService';",
      ),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });

  it('follows `export * from` through a barrel', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/services/index.ts': "export * from './clientService';\n",
      'src/caller.ts': caller('createClient();', "import { createClient } from './services';"),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });

  it('follows a named re-export through a barrel', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/services/index.ts': "export { createClient } from './clientService';\n",
      'src/caller.ts': caller('createClient();', "import { createClient } from './services';"),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });

  it('follows a tsconfig `paths` alias', async () => {
    const graph = await indexProject({
      'package.json': '{ "name": "aliased" }\n',
      'tsconfig.json':
        '{ "compilerOptions": { "baseUrl": ".", "paths": { "@svc/*": ["src/services/*"] } } }\n',
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': caller(
        'createClient();',
        "import { createClient } from '@svc/clientService';",
      ),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });

  it('resolves a relative specifier through /index.ts', async () => {
    const graph = await indexWith({
      'src/services/index.ts': TARGET,
      'src/caller.ts': caller('createClient();', "import { createClient } from './services';"),
    });

    expect(
      edge(graph, CALLER_ID, 'calls', 'function:src/services/index.ts#createClient'),
    ).toBeDefined();
  });

  it('resolves a specifier written with a `.js` extension', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': caller(
        'createClient();',
        "import { createClient } from './services/clientService.js';",
      ),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeDefined();
  });
});

describe('what the resolver refuses', () => {
  it('lets a local declaration shadow an import of the same name', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': [
        "import { createClient } from './services/clientService';",
        'export function caller(): void {',
        '  const createClient = () => 1;',
        '  createClient();',
        '}',
        '',
      ].join('\n'),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeUndefined();
  });

  it('treats a bare package specifier as outside the project, not as an error', async () => {
    const graph = await indexWith({
      'src/caller.ts': caller('axios.isAxiosError(1);', "import axios from 'axios';"),
    });

    expect(graph.diagnostics.filter((d) => d.code === 'UNRESOLVED_IMPORT')).toEqual([]);
    expect(graph.relationships.filter((r) => r.type === 'calls')).toEqual([]);
  });

  it('reports a relative import that names no indexed file', async () => {
    const graph = await indexWith({
      'src/caller.ts': caller('missing();', "import { missing } from './nope';"),
    });

    const diagnostic = graph.diagnostics.find((d) => d.code === 'UNRESOLVED_IMPORT');
    expect(diagnostic?.file).toBe('src/caller.ts');
    expect(diagnostic?.message).toContain('./nope');
  });

  it('does not resolve a dynamic import', async () => {
    const graph = await indexWith({
      'src/services/clientService.ts': TARGET,
      'src/caller.ts': [
        'export async function caller(): Promise<void> {',
        "  const module = await import('./services/clientService');",
        '  module.createClient();',
        '}',
        '',
      ].join('\n'),
    });

    expect(edge(graph, CALLER_ID, 'calls', TARGET_ID)).toBeUndefined();
  });

  it('refuses a name two barrels both offer, rather than picking one', async () => {
    const graph = await indexWith({
      'src/a.ts': TARGET,
      'src/b.ts': TARGET,
      'src/barrel.ts': "export * from './a';\nexport * from './b';\n",
      'src/caller.ts': caller('createClient();', "import { createClient } from './barrel';"),
    });

    expect(graph.relationships.filter((r) => r.type === 'calls')).toEqual([]);
  });

  it('abandons a re-export chain deeper than the bound, and says so', async () => {
    const barrels: Record<string, string> = { 'src/b0.ts': TARGET };
    for (let level = 1; level <= 9; level += 1) {
      barrels[`src/b${level}.ts`] = `export * from './b${level - 1}';\n`;
    }

    const graph = await indexWith({
      ...barrels,
      'src/caller.ts': caller('createClient();', "import { createClient } from './b9';"),
    });

    expect(graph.relationships.filter((r) => r.type === 'calls')).toEqual([]);
    expect(
      graph.diagnostics.some(
        (d) => d.code === 'UNRESOLVED_IMPORT' && d.message.includes('re-export hops'),
      ),
    ).toBe(true);
  });
});
