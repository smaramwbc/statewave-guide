import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli.js';
import type { ApplicationGraph, IndexerDiagnostic, IndexerDiagnosticCode } from '../src/graph.js';
import { NODE_KINDS } from '../src/serialize.js';
import { RELATIONSHIP_TYPES } from '../src/relationships.js';
import type { ApplicationNodeKind } from '../src/node-id.js';
import type { RelationshipType } from '../src/relationships.js';
import {
  DIAGNOSTIC_LABELS,
  formatCount,
  formatHealthReport,
  formatPercentage,
  groupDiagnostics,
} from '../src/reporter.js';
import { createGraphQuery } from '../src/traversal.js';
import { indexProject, indexSampleApp } from './helpers.js';

function diagnostics(code: IndexerDiagnosticCode, count: number): IndexerDiagnostic[] {
  return Array.from({ length: count }, (_, index) => ({
    code,
    severity: 'info' as const,
    message: `${code} ${index}`,
  }));
}

/** A graph with the numbers from the specification's worked example. */
function exampleGraph(): ApplicationGraph {
  const byKind = {} as Record<ApplicationNodeKind, number>;
  for (const kind of NODE_KINDS) byKind[kind] = 0;
  const byRelationship = {} as Record<RelationshipType, number>;
  for (const type of RELATIONSHIP_TYPES) byRelationship[type] = 0;

  return {
    version: 2,
    nodes: [],
    relationships: [],
    stats: { nodes: 1482, relationships: 2741, byKind, byRelationship },
    health: {
      resolvedCalls: 91,
      unresolvedCalls: 9,
      resolvedApiPaths: 96,
      unresolvedApiPaths: 4,
      joinedEndpoints: 10,
      frontendOnlyEndpoints: 1,
      backendOnlyEndpoints: 2,
      integrity: 'PASS',
      danglingRelationships: [],
    },
    diagnostics: [
      ...diagnostics('UNRESOLVED_API_PATH', 4),
      ...diagnostics('UNSUPPORTED_ROUTING_PATTERN', 2),
      ...diagnostics('UNRESOLVED_DYNAMIC_CALL', 12),
    ],
  };
}

describe('the health report', () => {
  it('renders exactly the documented block', () => {
    expect(formatHealthReport(exampleGraph())).toEqual([
      'ApplicationGraph Health',
      '',
      'Nodes:                  1,482',
      'Relationships:          2,741',
      '',
      'Resolved calls:         91%',
      'Unresolved calls:        9%',
      '',
      'API paths resolved:     96%',
      '',
      'Graph integrity:        PASS',
      '',
      'Warnings:',
      '12 dynamic calls',
      '4 dynamic API paths',
      '2 unsupported routing patterns',
    ]);
  });

  it('separates thousands without consulting a locale', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(1000)).toBe('1,000');
    expect(formatCount(1234567)).toBe('1,234,567');
  });

  it('rounds percentages to whole numbers that add to a hundred', () => {
    expect(formatPercentage(1, 3)).toBe('33%');
    expect(formatPercentage(0, 0)).toBe('100%');

    const graph = exampleGraph();
    graph.health.resolvedCalls = 183;
    graph.health.unresolvedCalls = 17;
    const lines = formatHealthReport(graph);
    expect(lines).toContain('Resolved calls:         92%');
    expect(lines).toContain('Unresolved calls:        8%');
  });

  it('groups warnings by code, most frequent first', () => {
    expect(groupDiagnostics(exampleGraph().diagnostics)).toEqual([
      { code: 'UNRESOLVED_DYNAMIC_CALL', count: 12 },
      { code: 'UNRESOLVED_API_PATH', count: 4 },
      { code: 'UNSUPPORTED_ROUTING_PATTERN', count: 2 },
    ]);
  });

  it('breaks a tie in count by code, so the order never wobbles', () => {
    const tied = [
      ...diagnostics('UNSUPPORTED_ROUTING_PATTERN', 2),
      ...diagnostics('UNRESOLVED_IMPORT', 2),
    ];
    expect(groupDiagnostics(tied).map((entry) => entry.code)).toEqual([
      'UNRESOLVED_IMPORT',
      'UNSUPPORTED_ROUTING_PATTERN',
    ]);
  });

  it('omits the warnings block when there is nothing to warn about', () => {
    const graph = exampleGraph();
    graph.diagnostics = [];
    expect(formatHealthReport(graph)).not.toContain('Warnings:');
  });

  it('has a distinct, readable phrase for every diagnostic code the contract defines', () => {
    const labels = Object.values(DIAGNOSTIC_LABELS);

    // Completeness is already a type constraint, so what is worth asserting is
    // that each label is something a person can read and tell apart from the
    // others — a raw code leaking through, or one phrase serving two codes,
    // would type-check perfectly and read as nonsense in a terminal.
    for (const label of labels) {
      expect(label).toMatch(/^[a-z][A-Za-z ]*[a-z]$/);
      expect(label).not.toMatch(/_/);
    }
    expect(new Set(labels).size).toBe(labels.length);

    // And the phrase has to reach the report, pluralised, rather than the code.
    const graph = exampleGraph();
    graph.diagnostics = [
      { code: 'UNRESOLVED_API_PATH', severity: 'info', message: 'x' },
      { code: 'UNRESOLVED_API_PATH', severity: 'info', message: 'y' },
    ];
    expect(formatHealthReport(graph)).toContain('2 dynamic API paths');
  });

  it('reports a real graph’s health', async () => {
    const { graph } = await indexSampleApp();
    const lines = formatHealthReport(graph);
    expect(lines[0]).toBe('ApplicationGraph Health');
    expect(lines).toContain('Graph integrity:        PASS');
    expect(lines.some((line) => line.startsWith('Nodes:'))).toBe(true);
  });
});

describe('command line', () => {
  it('accepts --health', () => {
    expect(parseArgs(['--health'])).toMatchObject({ kind: 'run', health: true, json: false });
    expect(parseArgs(['index', './app', '--health'])).toMatchObject({
      kind: 'run',
      directory: './app',
      health: true,
    });
  });

  it('leaves --health off by default', () => {
    expect(parseArgs([])).toMatchObject({ kind: 'run', directory: '.', health: false });
  });

  it('still rejects an unknown option', () => {
    expect(parseArgs(['--healthy'])).toMatchObject({ kind: 'error' });
  });
});

describe('traversal over a built graph', () => {
  it('finds the container and the routes that reach an element', async () => {
    const graph = await indexProject({
      'package.json': '{ "name": "traversed" }\n',
      'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
      'src/pages/Clients.tsx': [
        'export function Clients() {',
        '  return <button data-guide="clients.create">New</button>;',
        '}',
        '',
      ].join('\n'),
      'src/App.tsx': [
        "import { Route, Routes } from 'react-router-dom';",
        "import { Clients } from './pages/Clients';",
        'export function App() {',
        '  return (',
        '    <Routes>',
        '      <Route path="/clients" element={<Clients />} />',
        '    </Routes>',
        '  );',
        '}',
        '',
      ].join('\n'),
    });

    const query = createGraphQuery(graph);
    const path = query.resolveFeaturePath('clients.create');

    expect(path.start).toBe('element:clients.create');
    expect(path.container).toBe('component:src/pages/Clients.tsx#Clients');
    expect(path.routes).toEqual(['/clients']);
    expect(path.gap.reason).toBe('no-further-behaviour');
  });

  it('says so plainly when the element is not in the graph', async () => {
    const { graph } = await indexSampleApp();
    const path = createGraphQuery(graph).resolveFeaturePath('nothing.here');
    expect(path.gap.reason).toBe('start-not-found');
  });
});
