import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ApplicationGraph } from '../src/graph.js';
import { createProjectIndexer } from '../src/indexer.js';
import type { IndexResult } from '../src/indexer.js';

/** Absolute path of the checked-in fixture application. */
export const SAMPLE_APP_ROOT = fileURLToPath(new URL('./fixtures/sample-app', import.meta.url));

/** Indexes the fixture application. */
export function indexSampleApp(): Promise<IndexResult> {
  return createProjectIndexer({ root: SAMPLE_APP_ROOT }).index();
}

/**
 * 1-based line number of the first line in a fixture file containing `marker`.
 *
 * Line assertions are resolved from the fixture itself rather than hardcoded,
 * so editing a fixture cannot silently invalidate a provenance test. (Fixtures
 * are prettier-ignored for the same reason.)
 */
export function fixtureLine(relativePath: string, marker: string): number {
  const contents = readFileSync(path.join(SAMPLE_APP_ROOT, relativePath), 'utf8');
  const lines = contents.split('\n');
  const index = lines.findIndex((line) => line.includes(marker));
  if (index === -1) {
    throw new Error(`Fixture ${relativePath} no longer contains ${JSON.stringify(marker)}.`);
  }
  return index + 1;
}

/** Creates a throwaway project on disk from a `relativePath -> contents` map. */
export async function createTempProject(files: Record<string, string>): Promise<string> {
  // `realpath` matters on macOS, where the temp directory is a symlink and
  // ts-morph would otherwise report paths under a prefix we did not ask for.
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'statewave-guide-')));
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolute = path.join(root, relativePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, contents, 'utf8');
  }
  return root;
}

/** Removes a directory created by {@link createTempProject}. */
export function removeTempProject(root: string): Promise<void> {
  return rm(root, { recursive: true, force: true });
}

/** Every element in `graph` declared in `file`. */
export function elementsIn(graph: ApplicationGraph, file: string) {
  return graph.elements.filter((element) => element.provenance.file === file);
}
