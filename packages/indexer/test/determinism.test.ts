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
  nodesOfKind,
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

  it('produces the same graph from every working directory', async () => {
    const root = await createTempProject({
      'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }\n',
      'package.json': '{ "name": "anywhere" }\n',
      'src/Page.tsx':
        'export function Page() {\n  return <button data-guide="page.save">Save</button>;\n}\n',
      'src/deep/nested.ts': 'export const nested = 1;\n',
      'src/Page.test.tsx': 'export const spec = 1;\n',
    });

    try {
      const from = async (cwd: string): Promise<string> => {
        const previous = process.cwd();
        process.chdir(cwd);
        try {
          return serializeApplicationGraph((await createProjectIndexer({ root }).index()).graph);
        } finally {
          process.chdir(previous);
        }
      };

      // The matcher underneath used to resolve patterns against `process.cwd()`,
      // which made the file set a property of the shell: running from a
      // subdirectory dropped `src/deep/nested.ts` and re-admitted the excluded
      // test file, so one unchanged tree produced three different graphs.
      const expected = await from(root);
      expect(expected).toContain('src/deep/nested.ts');
      expect(expected).not.toContain('src/Page.test.tsx');

      for (const directory of [
        path.join(root, 'src'),
        path.join(root, 'src', 'deep'),
        path.parse(root).root,
      ]) {
        expect(await from(directory)).toBe(expected);
      }
    } finally {
      await removeTempProject(root);
    }
  });

  it('composes a file name however the filesystem decomposed it', async () => {
    // git stores NFC and HFS+ hands back NFD, so the same checkout on two
    // machines produced different `file:` ids and a different sort order.
    const composed = 'caf\u00e9.ts';
    const decomposed = 'cafe\u0301.ts';

    const idsFor = async (name: string): Promise<string[]> => {
      const root = await createTempProject({
        'tsconfig.json': '{}\n',
        'package.json': '{ "name": "unicode" }\n',
        [`src/${name}`]: 'export const value = 1;\n',
      });
      try {
        const { graph } = await createProjectIndexer({ root }).index();
        return nodesOfKind(graph, 'file').map((node) => node.id);
      } finally {
        await removeTempProject(root);
      }
    };

    expect(await idsFor(decomposed)).toEqual([`file:src/${composed}`]);
    expect(await idsFor(composed)).toEqual([`file:src/${composed}`]);
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
      await expect(readFile(written.path, 'utf8')).resolves.toContain('"version": 2');
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
    expect(serialised).toContain('\n  "version": 2,');
  });

  it('sorts nodes, relationships and diagnostics by their documented key', async () => {
    const { graph } = await indexSampleApp();

    expect(isSorted(graph.nodes.map((node) => node.id))).toBe(true);
    expect(isSorted(graph.relationships.map((relationship) => relationship.id))).toBe(true);
    expect(isSorted(graph.diagnostics.map((diagnostic) => diagnostic.code))).toBe(true);

    // Evidence within a relationship is sorted too, so a rule discovered in a
    // different order still serialises to the same bytes.
    for (const relationship of graph.relationships) {
      const keys = relationship.evidence.map(
        (evidence) => `${evidence.file}:${String(evidence.line).padStart(6, '0')}`,
      );
      expect(isSorted(keys)).toBe(true);
    }
  });

  it('keeps every array of ids sorted and unique', async () => {
    const { graph } = await indexSampleApp();
    for (const node of nodesOfKind(graph, 'service')) {
      expect(isSorted(node.memberIds)).toBe(true);
    }
    for (const node of nodesOfKind(graph, 'api')) {
      expect(isSorted(node.observedOn)).toBe(true);
    }
  });

  it('omits optional keys rather than serialising them as undefined', async () => {
    const { graph } = await indexSampleApp();

    const withoutLabel = graph.nodes.find((node) => node.id === 'element:clients.detail');
    expect(withoutLabel).toBeDefined();
    expect(Object.keys(JSON.parse(JSON.stringify(withoutLabel)) as object)).not.toContain('label');

    const withoutSymbol = graph.nodes.find((node) => node.id === 'route:/clients');
    expect(Object.keys(withoutSymbol?.provenance ?? {})).not.toContain('symbol');
  });

  it('serialises every node with the key order serialize.ts declares', async () => {
    const { graph } = await indexSampleApp();
    const parsed = JSON.parse(serializeApplicationGraph(graph)) as {
      nodes: Record<string, unknown>[];
      relationships: Record<string, unknown>[];
    };

    for (const node of parsed.nodes) {
      const keys = Object.keys(node);
      expect(keys[0]).toBe('kind');
      expect(keys[1]).toBe('id');
      expect(keys[keys.length - 1]).toBe('provenance');
    }
    for (const relationship of parsed.relationships) {
      expect(Object.keys(relationship)).toEqual([
        'id',
        'type',
        'source',
        'target',
        'confidence',
        'evidence',
      ]);
    }
  });

  it('holds no timestamp, absolute path or machine-specific value', async () => {
    const serialised = serializeApplicationGraph((await indexSampleApp()).graph);

    expect(serialised).not.toContain(SAMPLE_APP_ROOT);
    expect(serialised).not.toContain(path.sep === '/' ? '/Users/' : 'C:\\');
    expect(serialised).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});
