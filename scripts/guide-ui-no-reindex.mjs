/**
 * Opening the guide must not index anything.
 *
 * The UI consumes a prepared bundle. If opening a panel could trigger a source
 * walk, then every application shipping a guide would pay an indexer's cost at
 * runtime and the boundary Closed Loop #12 drew would exist only on paper.
 *
 * Checked structurally rather than by timing: the host's built bundle is read,
 * and any indexer symbol appearing in it is a value import that survived
 * bundling. A timing threshold would pass on a fast machine and fail on a slow
 * one while proving nothing either way.
 *
 * Usage:
 *   pnpm test:guide-ui-no-reindex
 *
 * @packageDocumentation
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'examples', 'guide-e2e', 'dist', 'assets');
const failures = [];

if (!existsSync(DIST)) {
  console.log('\nFAIL — the interactive host has not been built.\n');
  process.exit(1);
}

const bundles = readdirSync(DIST).filter((name) => name.endsWith('.js'));
const source = bundles.map((name) => readFileSync(path.join(DIST, name), 'utf8')).join('\n');

/** Symbols that only exist inside the analysis layer. */
const ANALYSIS = [
  'createProjectIndexer',
  'discoverFeatureCandidates',
  'computeFeatureScope',
  'buildEvidencePack',
  'compileGuidance',
  'integrateRuntimeCapability',
  'ts-morph',
  'typescript',
];
for (const symbol of ANALYSIS) {
  if (source.includes(symbol)) failures.push(`the shipped bundle contains "${symbol}"`);
}

const say = (line = '') => console.log(line);
say('\nGuide UI — no re-indexing on open\n');
say(`  bundles inspected                    ${bundles.length}`);
say(`  total size                           ${(source.length / 1024).toFixed(0)} KB`);
say(`  analysis symbols present             ${failures.length}`);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — an analyser is shipped to the browser.\n');
  process.exit(1);
}
say('\nPASS — the interactive host ships prepared knowledge, not the machinery that made it.\n');
