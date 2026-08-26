import { beforeAll, describe, expect, it } from 'vitest';
import type { ApplicationGraph } from '../src/graph.js';
import { createProjectIndexer } from '../src/indexer.js';
import {
  SAMPLE_APP_ROOT,
  createTempProject,
  edge,
  elementsIn,
  fixtureLine,
  indexSampleApp,
  nodeById,
  nodesOfKind,
  removeTempProject,
} from './helpers.js';

let graph: ApplicationGraph;

beforeAll(async () => {
  graph = (await indexSampleApp()).graph;
});

describe('canonical identifiers', () => {
  it('addresses every node by `kind:…`', () => {
    for (const node of graph.nodes) {
      expect(node.id.startsWith(`${node.kind}:`)).toBe(true);
    }
  });

  it('uses the documented format for each kind', () => {
    expect(nodeById(graph, 'file:src/pages/Clients.tsx')).toBeDefined();
    expect(nodeById(graph, 'component:src/pages/Clients.tsx#Clients')).toBeDefined();
    expect(nodeById(graph, 'element:clients.create')).toBeDefined();
    expect(nodeById(graph, 'function:src/lib/api.ts#fetchClients')).toBeDefined();
    expect(nodeById(graph, 'route:/clients')).toBeDefined();
    expect(nodeById(graph, 'type:src/types/client.ts#Client')).toBeDefined();
    expect(nodeById(graph, 'api:GET:/api/clients')).toBeDefined();
  });

  it('gives every node a unique id', () => {
    const ids = graph.nodes.map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('guide elements', () => {
  it('extracts clients.create with its file, line, type and visible label', () => {
    // src/components/QuickActions.tsx line 4 is the first occurrence in sorted
    // file order, and one semantic id is one node.
    const expectedLine = fixtureLine(
      'src/components/QuickActions.tsx',
      'data-guide="clients.create"',
    );
    const element = nodeById(graph, 'element:clients.create');

    expect(element).toMatchObject({
      kind: 'element',
      id: 'element:clients.create',
      elementId: 'clients.create',
      type: 'button',
      label: 'New Client',
      attribute: 'data-guide',
      tagName: 'button',
      featureId: 'clients',
    });
    expect(element?.provenance.line).toBe(expectedLine);
    expect(element?.provenance.source).toBe('source-code');
  });

  it('picks up the legacy data-ai-id attribute and records which attribute declared it', () => {
    const element = nodeById(graph, 'element:dashboard.docs');

    expect(element).toMatchObject({
      attribute: 'data-ai-id',
      type: 'link',
      tagName: 'a',
      label: 'Documentation',
    });
    expect(element?.provenance.line).toBe(
      fixtureLine('src/pages/Dashboard.tsx', 'data-ai-id="dashboard.docs"'),
    );
  });

  it('reports an invalid id as a diagnostic and keeps it out of the graph', () => {
    expect(graph.nodes.some((node) => node.id.includes('#app'))).toBe(false);

    const diagnostic = graph.diagnostics.find(
      (candidate) => candidate.code === 'INVALID_ELEMENT_ID',
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.severity).toBe('warning');
    expect(diagnostic?.file).toBe('src/pages/Dashboard.tsx');
    expect(diagnostic?.line).toBe(fixtureLine('src/pages/Dashboard.tsx', '#app > div'));
    expect(diagnostic?.message).toContain('#app > div');
  });

  it('keeps one node for a duplicated id, contained by both components', () => {
    const duplicates = graph.nodes.filter((node) => node.id === 'element:clients.create');
    expect(duplicates).toHaveLength(1);

    expect(
      edge(
        graph,
        'component:src/components/QuickActions.tsx#QuickActions',
        'contains',
        'element:clients.create',
      ),
    ).toBeDefined();
    expect(
      edge(graph, 'component:src/pages/Clients.tsx#Clients', 'contains', 'element:clients.create'),
    ).toBeDefined();

    const diagnostic = graph.diagnostics.find(
      (candidate) => candidate.code === 'DUPLICATE_ELEMENT_ID',
    );
    expect(diagnostic?.message).toContain('src/components/QuickActions.tsx');
  });

  it('accepts a string literal inside a JSX expression container', () => {
    // <button data-guide={'dashboard.refresh'}>Refresh</button>
    expect(nodeById(graph, 'element:dashboard.refresh')).toMatchObject({
      type: 'button',
      label: 'Refresh',
    });
  });

  it('prefers data-guide over the legacy attribute when both are present', () => {
    // <button data-guide="dashboard.export" data-ai-id="dashboard.legacy">
    expect(nodeById(graph, 'element:dashboard.export')).toMatchObject({
      attribute: 'data-guide',
      label: 'Export',
    });
    expect(nodeById(graph, 'element:dashboard.legacy')).toBeUndefined();
  });

  it('falls back to the legacy attribute when data-guide is not a literal', () => {
    // <span data-guide={dynamicId} data-ai-id="dashboard.fallback">
    expect(nodeById(graph, 'element:dashboard.fallback')).toMatchObject({
      attribute: 'data-ai-id',
      type: 'other', // <span> has no semantic mapping
      tagName: 'span',
    });
  });

  it('ignores an id built from a template literal, without inventing a diagnostic', () => {
    expect(graph.nodes.some((node) => node.id.includes('computed'))).toBe(false);
    expect(graph.diagnostics.some((diagnostic) => diagnostic.message.includes('computed'))).toBe(
      false,
    );
  });

  it('prefers an explicit data-guide-type over the tag name', () => {
    // A PascalCase component maps to `other` unless the author states otherwise.
    expect(nodeById(graph, 'element:clients.dialog')).toMatchObject({
      type: 'dialog',
      tagName: 'ClientDialog',
    });
  });

  it('maps lowercase tag names to semantic element types', () => {
    const byId = new Map(
      nodesOfKind(graph, 'element').map((element) => [element.elementId, element.type]),
    );

    expect(byId.get('clients')).toBe('section'); // <section>
    expect(byId.get('clients.detail')).toBe('section'); // <article>
    expect(byId.get('dashboard')).toBe('section'); // <main>
    expect(byId.get('clients.table')).toBe('table');
    expect(byId.get('quick-actions')).toBe('menu'); // <nav>
    expect(byId.get('settings.form')).toBe('form');
    expect(byId.get('settings.form.name')).toBe('input');
    expect(byId.get('clients.dialog.root')).toBe('dialog');
  });

  it('resolves labels by precedence: data-guide-label, aria-label, then text', () => {
    const byId = new Map(
      nodesOfKind(graph, 'element').map((element) => [element.elementId, element.label]),
    );

    expect(byId.get('clients.table')).toBe('Client list'); // data-guide-label
    expect(byId.get('clients')).toBe('Clients'); // aria-label
    expect(byId.get('dashboard.search')).toBe('Search clients'); // aria-label on a void element
    expect(byId.get('settings.form.save')).toBe('Save'); // text child
    expect(byId.get('clients.detail')).toBeUndefined(); // only an expression child
  });
});

describe('components', () => {
  it('extracts function declarations, arrow functions and function expressions', () => {
    const ids = nodesOfKind(graph, 'component').map((component) => component.id);

    expect(ids).toContain('component:src/pages/Clients.tsx#Clients'); // function declaration
    expect(ids).toContain('component:src/components/ClientDialog.tsx#ClientDialog'); // arrow
    expect(ids).toContain('component:src/pages/Settings.tsx#Settings'); // function expression
  });

  it('records default exports', () => {
    expect(nodeById(graph, 'component:src/pages/Dashboard.tsx#Dashboard')).toMatchObject({
      exported: true,
      isDefaultExport: true,
    });
    expect(nodeById(graph, 'component:src/pages/Clients.tsx#Clients')).toMatchObject({
      exported: true,
      isDefaultExport: false,
    });
  });

  it('attributes elements to the component that renders them, as `contains` edges', () => {
    const contained = graph.relationships
      .filter(
        (relationship) =>
          relationship.type === 'contains' &&
          relationship.source === 'component:src/pages/Clients.tsx#Clients',
      )
      .map((relationship) => relationship.target);

    expect(contained).toEqual([
      'element:clients',
      'element:clients.create',
      'element:clients.dialog',
      'element:clients.table',
    ]);
  });

  it('does not emit a redundant `file contains component` edge', () => {
    expect(
      graph.relationships.some(
        (relationship) =>
          relationship.type === 'contains' && relationship.source.startsWith('file:'),
      ),
    ).toBe(false);
  });

  it('does not treat a lowercase exported function as a component', () => {
    expect(nodesOfKind(graph, 'component').some((component) => component.name === 'router')).toBe(
      false,
    );
  });

  it('does not also list a component as a function', () => {
    expect(nodesOfKind(graph, 'function').some((fn) => fn.name === 'Clients')).toBe(false);
  });
});

describe('routes', () => {
  it('detects JSX routes with their component', () => {
    expect(nodeById(graph, 'route:/clients')).toMatchObject({
      kind: 'route',
      path: '/clients',
      componentName: 'Clients',
      detectedFrom: 'jsx-route',
    });
    expect(nodeById(graph, 'route:/settings')).toMatchObject({
      componentName: 'Settings', // component={Settings}
      detectedFrom: 'jsx-route',
    });
  });

  it('links a route to the component it renders', () => {
    expect(
      edge(graph, 'route:/clients', 'renders', 'component:src/pages/Clients.tsx#Clients'),
    ).toBeDefined();
    expect(
      edge(graph, 'route:/settings', 'renders', 'component:src/pages/Settings.tsx#Settings'),
    ).toBeDefined();
  });

  it('detects data-router objects and joins relative child paths', () => {
    expect(nodeById(graph, 'route:/clients/new')).toMatchObject({
      detectedFrom: 'router-object',
      componentName: 'ClientDetail',
    });
  });

  it('leaves an absolute child path alone instead of joining it twice', () => {
    const paths = nodesOfKind(graph, 'route').map((route) => route.path);
    expect(paths).toContain('/clients/archived');
    expect(paths.some((path) => path.includes('/clients/clients'))).toBe(false);
  });

  it('deduplicates by path, keeping the first occurrence in sorted-file order', () => {
    const clients = nodesOfKind(graph, 'route').filter((route) => route.path === '/clients');
    expect(clients).toHaveLength(1);
    // src/App.tsx sorts before src/router.tsx, so the JSX detection wins.
    expect(clients[0]?.provenance.file).toBe('src/App.tsx');
  });
});

describe('functions and types', () => {
  it('extracts functions with their arity, asyncness, form and side', () => {
    expect(nodeById(graph, 'function:src/lib/api.ts#fetchClients')).toMatchObject({
      name: 'fetchClients',
      form: 'declaration',
      exported: true,
      isAsync: true,
      parameterCount: 0,
      side: 'shared',
    });
    expect(nodeById(graph, 'function:src/lib/format.ts#formatCurrency')).toMatchObject({
      form: 'arrow',
      isAsync: false,
      parameterCount: 2,
    });
  });

  it('records module-private functions too, because the call graph needs them', () => {
    expect(nodeById(graph, 'function:src/lib/format.ts#notExported')).toMatchObject({
      exported: false,
    });
    expect(
      edge(
        graph,
        'function:src/lib/format.ts#upper',
        'calls',
        'function:src/lib/format.ts#notExported',
      ),
    ).toMatchObject({ confidence: 1 });
  });

  it('extracts exported interfaces, type aliases and enums', () => {
    const byName = new Map(nodesOfKind(graph, 'type').map((type) => [type.name, type.typeKind]));

    expect(byName.get('Client')).toBe('interface');
    expect(byName.get('ClientId')).toBe('type-alias');
    expect(byName.get('ClientStatus')).toBe('enum');
    expect(byName.has('InternalOnly')).toBe(false);
  });
});

describe('files and project resolution', () => {
  it('reports the application name and the tsconfig it used', async () => {
    const result = await indexSampleApp();
    expect(result.graph.application).toBe('sample-app');
    expect(result.tsconfigPath).toBe('tsconfig.json');
    expect(result.configPath).toBeUndefined();
  });

  it('applies the default excludes', () => {
    const paths = nodesOfKind(graph, 'file').map((file) => file.path);
    expect(paths).toContain('src/pages/Clients.tsx');
    expect(paths.some((file) => file.endsWith('.spec.ts'))).toBe(false);
    expect(paths.some((file) => file.endsWith('.d.ts'))).toBe(false);
  });

  it('flags which files contain JSX and which side they belong to', () => {
    expect(nodeById(graph, 'file:src/pages/Clients.tsx')).toMatchObject({
      hasJsx: true,
      side: 'frontend',
    });
    expect(nodeById(graph, 'file:src/lib/format.ts')).toMatchObject({
      hasJsx: false,
      side: 'shared',
    });
  });

  it('lists a file’s elements through the components that contain them', () => {
    expect(elementsIn(graph, 'src/pages/Dashboard.tsx').map((element) => element.id)).toEqual([
      'element:dashboard',
      'element:dashboard.docs',
      'element:dashboard.export',
      'element:dashboard.fallback',
      'element:dashboard.refresh',
      'element:dashboard.search',
    ]);
  });

  it('keeps stats in step with the arrays they describe', () => {
    expect(graph.stats.nodes).toBe(graph.nodes.length);
    expect(graph.stats.relationships).toBe(graph.relationships.length);

    const kinds = Object.entries(graph.stats.byKind);
    expect(kinds.reduce((total, [, count]) => total + count, 0)).toBe(graph.nodes.length);
    for (const [kind, count] of kinds) {
      expect(graph.nodes.filter((node) => node.kind === kind)).toHaveLength(count);
    }

    const types = Object.entries(graph.stats.byRelationship);
    expect(types.reduce((total, [, count]) => total + count, 0)).toBe(graph.relationships.length);
  });
});

describe('degraded projects', () => {
  it('emits MISSING_TSCONFIG and still produces a usable graph', async () => {
    const root = await createTempProject({
      'package.json': '{ "name": "no-tsconfig" }\n',
      'src/Widget.tsx':
        'export function Widget() {\n  return <button data-guide="widget.go">Go</button>;\n}\n',
    });

    try {
      const result = await createProjectIndexer({ root }).index();
      expect(result.tsconfigPath).toBeUndefined();
      expect(result.graph.diagnostics.map((d) => d.code)).toContain('MISSING_TSCONFIG');
      expect(nodesOfKind(result.graph, 'element').map((element) => element.id)).toEqual([
        'element:widget.go',
      ]);
      expect(nodesOfKind(result.graph, 'component').map((component) => component.name)).toEqual([
        'Widget',
      ]);
    } finally {
      await removeTempProject(root);
    }
  });

  it('emits NO_SOURCE_FILES for an empty project and returns an empty valid graph', async () => {
    const root = await createTempProject({ 'tsconfig.json': '{}\n' });

    try {
      const { graph: empty } = await createProjectIndexer({ root }).index();
      expect(empty.diagnostics.map((d) => d.code)).toContain('NO_SOURCE_FILES');
      expect(empty.version).toBe(2);
      expect(empty.nodes).toEqual([]);
      expect(empty.relationships).toEqual([]);
      expect(empty.stats.nodes).toBe(0);
      expect(empty.stats.byKind.component).toBe(0);
      expect(empty.stats.byRelationship.calls).toBe(0);
      expect(empty.health.integrity).toBe('PASS');
    } finally {
      await removeTempProject(root);
    }
  });

  it('never leaks an absolute path into the graph', () => {
    expect(JSON.stringify(graph)).not.toContain(SAMPLE_APP_ROOT);
  });
});
