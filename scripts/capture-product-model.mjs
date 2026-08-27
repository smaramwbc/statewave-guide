/**
 * Freezes the Round 2 ProductModel to disk, once.
 *
 * Closed Loop #4 changes how verified knowledge is *presented*, and nothing
 * about what is known. Isolating that variable means the model under comparison
 * has to be the same object on both sides — so it is captured here, written
 * down, and read from disk by everything downstream. No later step in this
 * milestone calls a provider.
 *
 * This is the only reason the run exists. The stored artefacts from Round 2
 * carried claim text and status but not `assertion.subjectRef`, `action` or
 * `targets`, and a guidance compiler cannot work from prose alone: it needs to
 * know which control a claim is about before it can name it.
 *
 * Usage:
 *   node scripts/capture-product-model.mjs
 *
 * @packageDocumentation
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProjectIndexer } from '../packages/indexer/dist/index.js';
import {
  createDeterministicRenderer,
  enrichApplicationGraph,
  resolveProvider,
  DEFAULT_PROVIDERS,
} from '../packages/semantic/dist/index.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');
const OUT = path.join(BENCH, 'round-2-product-model.json');

const providerId = 'anthropic-opus-5';
const config = DEFAULT_PROVIDERS.find((entry) => entry.id === providerId);
const resolved = resolveProvider(config, process.env);
if (resolved.status !== 'ready') {
  console.error(`${providerId} is not configured: ${resolved.reason}`);
  process.exit(1);
}

const dataset = JSON.parse(readFileSync(path.join(BENCH, 'dataset-v1.json'), 'utf8'));
const { graph } = await createProjectIndexer({
  root: path.join(ROOT, dataset.fixture),
  config: { include: dataset.include, ...(dataset.exclude ? { exclude: dataset.exclude } : {}) },
}).index();

const candidateIds = dataset.candidates.map((entry) => entry.id ?? entry);

const run = await enrichApplicationGraph({
  graph,
  provider: resolved.provider,
  renderer: createDeterministicRenderer(),
  candidateIds,
});

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify(
    {
      capturedFor: 'closed-loop-4',
      note: 'The Round 2 ProductModel, frozen so guidance compilation can be compared against the same knowledge. Do not regenerate: doing so changes the variable this milestone is holding still.',
      dataset: `v${dataset.version}`,
      prompt: 'v2',
      featureIds: candidateIds,
      model: run.model,
      rejected: run.rejected,
      opportunities: run.opportunities,
    },
    null,
    2,
  )}\n`,
);

const claims = run.model.claims.length;
const verified = run.model.claims.filter(
  (claim) => claim.status === 'structurally_verified',
).length;
console.log(
  `Captured ${run.model.features.length} features, ${claims} claims (${verified} verified).`,
);
console.log(`  ${path.relative(ROOT, OUT)}`);
