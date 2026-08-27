/**
 * Proves that running the checks does not rewrite the evidence.
 *
 * Benchmark artefacts are the record of what a round actually produced. They
 * are the only thing a later reader can hold a claim against, and once a round
 * is checkpointed they are history rather than output.
 *
 * They were not being treated that way. The comparison scripts wrote into the
 * committed benchmark directory, and two of them ran as gates — so running
 * `test:no-factual-expansion` after a later change regenerated the Round 2-to-3
 * comparison using the *current* compiler. The "after" column acquired steps
 * that Round 3 never produced, and the next `git add -A` would have committed
 * the falsification silently. Nothing about that failure was visible in a test
 * result; it showed up only as an unexplained dirty file.
 *
 * So this hashes every historical artefact, runs the checks that used to mutate
 * them, and hashes again. A single changed byte fails the run and names the
 * file.
 *
 * Usage:
 *   pnpm test:artifact-integrity
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

/**
 * Artefacts that record what a completed round produced.
 *
 * Everything a checkpointed round wrote down: the review packages issued to a
 * reviewer, the scores that came back, the frozen Product Model, the comparison
 * between rounds, and the dataset and gold set the whole series is measured
 * against. The blank Round 4 package is included too — it is issued, and an
 * issued package that changes underneath a reviewer is a different experiment.
 */
function historicalArtefacts() {
  return readdirSync(BENCH)
    .filter((name) => {
      if (name.startsWith('human-review-round-')) return true;
      if (name.startsWith('guidance-round-')) return true;
      if (name.startsWith('review-round-')) return true;
      if (name === 'round-2-product-model.json') return true;
      if (name === 'dataset-v1.json' || name === 'gold-v1.json') return true;
      if (name.startsWith('prompt-v')) return true;
      return false;
    })
    .sort()
    .map((name) => path.join(BENCH, name));
}

function hash(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function snapshot() {
  const out = new Map();
  for (const file of historicalArtefacts()) out.set(file, hash(file));
  return out;
}

/** The checks that used to write into the benchmark directory. */
const CHECKS = [
  ['no-factual-expansion', ['scripts/guidance-snapshot.mjs']],
  ['round-3-vs-4 audit', ['scripts/guidance-round-3-vs-4.mjs']],
  ['guidance-quality', ['scripts/guidance-quality.mjs']],
  ['workflow-selection-quality', ['scripts/workflow-selection-quality.mjs']],
];

const before = snapshot();
console.log(`\nHistorical artefact integrity\n`);
console.log(`  artefacts under watch                ${before.size}`);

for (const [label, argv] of CHECKS) {
  try {
    execFileSync('node', argv, { cwd: ROOT, stdio: 'ignore' });
    console.log(`  ran ${label.padEnd(34)} ok`);
  } catch {
    // A check that fails on its own merits is not this script's business; the
    // question here is only whether running it changed the record.
    console.log(`  ran ${label.padEnd(34)} (non-zero exit, still checked)`);
  }
}

const after = snapshot();
const changed = [];
for (const [file, digest] of before) {
  const now = after.get(file);
  if (now === undefined) changed.push(`${path.basename(file)} was deleted`);
  else if (now !== digest) changed.push(`${path.basename(file)} was rewritten`);
}
for (const file of after.keys()) {
  if (!before.has(file)) changed.push(`${path.basename(file)} was created`);
}

console.log('');
if (changed.length > 0) {
  for (const entry of changed) console.log(`    ✗ ${entry}`);
  console.log('\nFAIL — running the checks changed the record they were checking.\n');
  process.exit(1);
}
console.log('PASS — every historical artefact is byte-identical after the run.\n');
