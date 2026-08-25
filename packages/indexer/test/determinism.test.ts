import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '../src/indexer.js';
import { compareStrings, serializeApplicationGraph } from '../src/serialize.js';
import { writeApplicationGraph } from '../src/write.js';
import {
  SAMPLE_APP_ROOT,
  createTempProject,
  indexSampleApp,
  removeTempProject,
} from './helpers.js';

/** Reads back what a fresh indexer run over the fixture produces. */
async function runTwice() {
  const first = await indexSampleApp();
  const second = await indexSampleApp();
  return { first: first.graph, second: second.graph };
}

function isSorted(values: readonly string[]): boolean {
  return values.every(
    (value, index) => index === 0 || compareStrings(values[index - 1]!, value) <= 0,
  );
}

describe('determinism', () => {
  it('produces a deeply equal graph on a second run', async () => {
    const { first, second } = await runTwice();
    expect(second).toEqual(first);
  });

  it('produces byte-identical serialised output, key order included', async () => {
    const { first, second } = await runTwice();
    // `toEqual` ignores key order; comparing the serialised bytes does not.
    expect(serializeApplicationGraph(second)).toBe(serializeApplicationGraph(first));
  });

  it('writes byte-identical files on repeated runs', async () => {
    const root = await createTempProject({
      'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
      'package.json': '{ "name": "written-twice" }\n',
      'src/Page.tsx':
        'export function Page() {\n  return <button data-guide="page.save">Save</button>;\n}\n',
    });

    try {
      const indexer = createProjectIndexer({ root });

      const firstRun = await indexer.index();
      const firstWrite = await writeApplicationGraph(firstRun.graph, { root });
      const firstBytes = await readFile(firstWrite.path, 'utf8');

      const secondRun = await indexer.index();
      const secondWrite = await writeApplicationGraph(secondRun.graph, { root });
      const secondBytes = await readFile(secondWrite.path, 'utf8');

      expect(secondBytes).toBe(firstBytes);
      expect(firstWrite.relativePath).toBe('.statewave-guide/application.json');
      expect(firstWrite.path).toBe(path.join(root, '.statewave-guide', 'application.json'));
      expect(firstWrite.bytes).toBe(Buffer.byteLength(firstBytes, 'utf8'));
    } finally {
      await removeTempProject(root);
    }
  });

  it('honours a custom outDir', async () => {
    const root = await createTempProject({
      'tsconfig.json': '{}\n',
      'src/index.ts': 'export const value = 1;\n',
    });

    try {
      const { graph } = await createProjectIndexer({ root }).index();
      const written = await writeApplicationGraph(graph, { root, outDir: 'build/graph' });
      expect(written.relativePath).toBe('build/graph/application.json');
      await expect(readFile(written.path, 'utf8')).resolves.toContain('"version": 1');
    } finally {
      await removeTempProject(root);
    }
  });
});

describe('serialised shape', () => {
  it('indents with two spaces and ends with a newline', async () => {
    const { graph } = await indexSampleApp();
    const serialised = serializeApplicationGraph(graph);

    expect(serialised.endsWith('}\n')).toBe(true);
    expect(serialised).toContain('\n  "version": 1,');
  });

  it('sorts every array by its documented key', async () => {
    const { graph } = await indexSampleApp();

    expect(isSorted(graph.files.map((file) => file.id))).toBe(true);
    expect(isSorted(graph.components.map((component) => component.id))).toBe(true);
    expect(isSorted(graph.functions.map((fn) => fn.id))).toBe(true);
    expect(isSorted(graph.types.map((type) => type.id))).toBe(true);
    expect(isSorted(graph.routes.map((route) => route.path))).toBe(true);
    expect(isSorted(graph.diagnostics.map((diagnostic) => diagnostic.code))).toBe(true);

    // Elements share ids, so they sort by id, then provenance file, then line.
    // Comparing field by field rather than by a joined key, because a separator
    // character would itself take part in the comparison.
    const outOfOrder = graph.elements.filter((element, index) => {
      const previous = graph.elements[index - 1];
      if (index === 0 || previous === undefined) return false;
      const byId = compareStrings(previous.id, element.id);
      if (byId !== 0) return byId > 0;
      const byFile = compareStrings(previous.provenance.file ?? '', element.provenance.file ?? '');
      if (byFile !== 0) return byFile > 0;
      return (previous.provenance.line ?? 0) > (element.provenance.line ?? 0);
    });
    expect(outOfOrder).toEqual([]);
  });

  it('omits optional keys rather than serialising them as undefined', async () => {
    const { graph } = await indexSampleApp();

    const withoutLabel = graph.elements.find((element) => element.id === 'clients.detail');
    expect(withoutLabel).toBeDefined();
    expect(Object.keys(withoutLabel ?? {})).not.toContain('label');

    const withoutSymbol = graph.routes.find((route) => route.path === '/clients');
    expect(Object.keys(withoutSymbol?.provenance ?? {})).not.toContain('symbol');
  });

  it('holds no timestamp, absolute path or machine-specific value', async () => {
    const serialised = serializeApplicationGraph((await indexSampleApp()).graph);

    expect(serialised).not.toContain(SAMPLE_APP_ROOT);
    expect(serialised).not.toContain(path.sep === '/' ? '/Users/' : 'C:\\');
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
