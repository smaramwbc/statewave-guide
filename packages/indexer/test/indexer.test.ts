import { beforeAll, describe, expect, it } from 'vitest';
import type { ApplicationGraph } from '../src/graph.js';
import { createProjectIndexer } from '../src/indexer.js';
import {
  SAMPLE_APP_ROOT,
  createTempProject,
  elementsIn,
  fixtureLine,
  indexSampleApp,
  removeTempProject,
} from './helpers.js';

let graph: ApplicationGraph;

beforeAll(async () => {
  graph = (await indexSampleApp()).graph;
});

describe('guide elements', () => {
  it('extracts clients.create with its file, line, type and visible label', () => {
    // src/pages/Clients.tsx line 13: <button data-guide="clients.create">New Client</button>
    const expectedLine = fixtureLine('src/pages/Clients.tsx', 'data-guide="clients.create"');

    const element = graph.elements.find(
      (candidate) =>
        candidate.id === 'clients.create' && candidate.provenance.file === 'src/pages/Clients.tsx',
    );

    expect(element).toBeDefined();
    expect(element).toMatchObject({
      kind: 'ui-element',
      id: 'clients.create',
      type: 'button',
      label: 'New Client',
      attribute: 'data-guide',
      tagName: 'button',
      componentId: 'src/pages/Clients.tsx#Clients',
      featureId: 'clients',
    });
    expect(element?.provenance.line).toBe(expectedLine);
    expect(element?.provenance.source).toBe('source-code');
  });

  it('picks up the legacy data-ai-id attribute and records which attribute declared it', () => {
    const element = graph.elements.find((candidate) => candidate.id === 'dashboard.docs');

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
    expect(graph.elements.some((element) => element.id.includes('#app'))).toBe(false);

    const diagnostic = graph.diagnostics.find(
      (candidate) => candidate.code === 'invalid-element-id',
    );

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.file).toBe('src/pages/Dashboard.tsx');
    expect(diagnostic?.line).toBe(fixtureLine('src/pages/Dashboard.tsx', '#app > div'));
    expect(diagnostic?.message).toContain('#app > div');
  });

  it('keeps both nodes for a duplicated id, and says where the first one was', () => {
    const duplicates = graph.elements.filter((element) => element.id === 'clients.create');
    expect(duplicates).toHaveLength(2);
    expect(duplicates.map((element) => element.provenance.file)).toEqual([
      'src/components/QuickActions.tsx',
      'src/pages/Clients.tsx',
    ]);

    const diagnostic = graph.diagnostics.find(
      (candidate) => candidate.code === 'duplicate-element-id',
    );
    expect(diagnostic?.message).toContain('src/components/QuickActions.tsx');
  });

  it('accepts a string literal inside a JSX expression container', () => {
    // <button data-guide={'dashboard.refresh'}>Refresh</button>
    expect(graph.elements.find((element) => element.id === 'dashboard.refresh')).toMatchObject({
      type: 'button',
      label: 'Refresh',
    });
  });

  it('prefers data-guide over the legacy attribute when both are present', () => {
    // <button data-guide="dashboard.export" data-ai-id="dashboard.legacy">
    expect(graph.elements.find((element) => element.id === 'dashboard.export')).toMatchObject({
      attribute: 'data-guide',
      label: 'Export',
    });
    expect(graph.elements.some((element) => element.id === 'dashboard.legacy')).toBe(false);
  });

  it('falls back to the legacy attribute when data-guide is not a literal', () => {
    // <span data-guide={dynamicId} data-ai-id="dashboard.fallback">
    expect(graph.elements.find((element) => element.id === 'dashboard.fallback')).toMatchObject({
      attribute: 'data-ai-id',
      type: 'other', // <span> has no semantic mapping
      tagName: 'span',
    });
  });

  it('ignores an id built from a template literal, without inventing a diagnostic', () => {
    expect(graph.elements.some((element) => element.id.includes('computed'))).toBe(false);
    expect(graph.diagnostics.some((diagnostic) => diagnostic.message.includes('computed'))).toBe(
      false,
    );
  });

  it('prefers an explicit data-guide-type over the tag name', () => {
    // A PascalCase component maps to `other` unless the author states otherwise.
    expect(graph.elements.find((element) => element.id === 'clients.dialog')).toMatchObject({
      type: 'dialog',
      tagName: 'ClientDialog',
    });
  });

  it('maps lowercase tag names to semantic element types', () => {
    const byId = new Map(graph.elements.map((element) => [element.id, element.type]));

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
    const byId = new Map(graph.elements.map((element) => [element.id, element.label]));

    expect(byId.get('clients.table')).toBe('Client list'); // data-guide-label
    expect(byId.get('clients')).toBe('Clients'); // aria-label
    expect(byId.get('dashboard.search')).toBe('Search clients'); // aria-label on a void element
    expect(byId.get('settings.form.save')).toBe('Save'); // text child
    expect(byId.get('clients.detail')).toBeUndefined(); // only an expression child
  });
});

describe('components', () => {
  it('extracts function declarations, arrow functions and function expressions', () => {
    const ids = graph.components.map((component) => component.id);

    expect(ids).toContain('src/pages/Clients.tsx#Clients'); // function declaration
    expect(ids).toContain('src/components/ClientDialog.tsx#ClientDialog'); // arrow function
    expect(ids).toContain('src/pages/Settings.tsx#Settings'); // function expression
  });

  it('records default exports', () => {
    expect(graph.components.find((component) => component.name === 'Dashboard')).toMatchObject({
      exported: true,
      isDefaultExport: true,
    });
    expect(graph.components.find((component) => component.name === 'Clients')).toMatchObject({
      exported: true,
      isDefaultExport: false,
    });
  });

  it('attributes elements to the component that renders them', () => {
    const clients = graph.components.find((component) => component.name === 'Clients');
    expect(clients?.elementIds).toEqual([
      'clients',
      'clients.create',
      'clients.dialog',
      'clients.table',
    ]);
  });

  it('does not treat a lowercase exported function as a component', () => {
    expect(graph.components.some((component) => component.name === 'router')).toBe(false);
  });
});

describe('routes', () => {
  it('detects JSX routes with their component', () => {
    expect(graph.routes.find((route) => route.path === '/clients')).toMatchObject({
      kind: 'route',
      id: '/clients',
      componentName: 'Clients',
      detectedFrom: 'jsx-route',
    });
    expect(graph.routes.find((route) => route.path === '/settings')).toMatchObject({
      componentName: 'Settings', // component={Settings}
      detectedFrom: 'jsx-route',
    });
  });

  it('detects data-router objects and joins relative child paths', () => {
    expect(graph.routes.find((route) => route.path === '/clients/new')).toMatchObject({
      detectedFrom: 'router-object',
      componentName: 'ClientDetail',
    });
  });

  it('leaves an absolute child path alone instead of joining it twice', () => {
    expect(graph.routes.map((route) => route.path)).toContain('/clients/archived');
    expect(graph.routes.some((route) => route.path.includes('/clients/clients'))).toBe(false);
  });

  it('deduplicates by path, keeping the first occurrence in sorted-file order', () => {
    const clients = graph.routes.filter((route) => route.path === '/clients');
    expect(clients).toHaveLength(1);
    // src/App.tsx sorts before src/router.tsx, so the JSX detection wins.
    expect(clients[0]?.provenance.file).toBe('src/App.tsx');
  });
});

describe('functions and types', () => {
  it('extracts exported functions with their arity and asyncness', () => {
    expect(graph.functions.find((fn) => fn.name === 'fetchClients')).toMatchObject({
      id: 'src/lib/api.ts#fetchClients',
      exported: true,
      isAsync: true,
      parameterCount: 0,
    });
    expect(graph.functions.find((fn) => fn.name === 'formatCurrency')).toMatchObject({
      isAsync: false,
      parameterCount: 2,
    });
  });

  it('excludes components and unexported helpers', () => {
    expect(graph.functions.some((fn) => fn.name === 'Clients')).toBe(false);
    expect(graph.functions.some((fn) => fn.name === 'notExported')).toBe(false);
  });

  it('extracts exported interfaces, type aliases and enums', () => {
    const byName = new Map(graph.types.map((type) => [type.name, type.typeKind]));

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
    const paths = graph.files.map((file) => file.path);
    expect(paths).toContain('src/pages/Clients.tsx');
    expect(paths.some((file) => file.endsWith('.spec.ts'))).toBe(false);
    expect(paths.some((file) => file.endsWith('.d.ts'))).toBe(false);
  });

  it('flags which files contain JSX', () => {
    expect(graph.files.find((file) => file.path === 'src/pages/Clients.tsx')?.hasJsx).toBe(true);
    expect(graph.files.find((file) => file.path === 'src/lib/format.ts')?.hasJsx).toBe(false);
  });

  it('links files to the components and elements they declare', () => {
    const file = graph.files.find((candidate) => candidate.path === 'src/pages/Dashboard.tsx');
    expect(file?.componentIds).toEqual(['src/pages/Dashboard.tsx#Dashboard']);
    expect(file?.elementIds).toEqual([
      'dashboard',
      'dashboard.docs',
      'dashboard.export',
      'dashboard.fallback',
      'dashboard.refresh',
      'dashboard.search',
    ]);
    expect(elementsIn(graph, 'src/pages/Dashboard.tsx')).toHaveLength(6);
  });

  it('keeps stats in step with the arrays they describe', () => {
    expect(graph.stats).toEqual({
      files: graph.files.length,
      components: graph.components.length,
      elements: graph.elements.length,
      routes: graph.routes.length,
      functions: graph.functions.length,
      types: graph.types.length,
    });
  });
});

describe('degraded projects', () => {
  it('emits missing-tsconfig and still produces a usable graph', async () => {
    const root = await createTempProject({
      'package.json': '{ "name": "no-tsconfig" }\n',
      'src/Widget.tsx':
        'export function Widget() {\n  return <button data-guide="widget.go">Go</button>;\n}\n',
    });

    try {
      const result = await createProjectIndexer({ root }).index();
      expect(result.tsconfigPath).toBeUndefined();
      expect(result.graph.diagnostics.map((d) => d.code)).toContain('missing-tsconfig');
      expect(result.graph.elements.map((element) => element.id)).toEqual(['widget.go']);
      expect(result.graph.components.map((component) => component.name)).toEqual(['Widget']);
    } finally {
      await removeTempProject(root);
    }
  });

  it('emits no-source-files for an empty project and returns an empty valid graph', async () => {
    const root = await createTempProject({ 'tsconfig.json': '{}\n' });

    try {
      const { graph: empty } = await createProjectIndexer({ root }).index();
      expect(empty.diagnostics.map((d) => d.code)).toContain('no-source-files');
      expect(empty.version).toBe(1);
      expect(empty.files).toEqual([]);
      expect(empty.stats).toEqual({
        files: 0,
        components: 0,
        elements: 0,
        routes: 0,
        functions: 0,
        types: 0,
      });
    } finally {
      await removeTempProject(root);
    }
  });

  it('never leaks an absolute path into the graph', () => {
    expect(JSON.stringify(graph)).not.toContain(SAMPLE_APP_ROOT);
  });
});
