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
      // What a browser watched, on one build, once. The claims that rest on it
      // cite it by trace id, so an edit here rewrites the evidence behind seven
      // Product Model claims without touching a line of source.
      if (name === 'runtime-evidence-v1.json') return true;
      if (name.startsWith('interactive-review-v1')) return true;
      if (name.startsWith('interactive-review-v2')) return true;
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
  ['round-4-vs-5 audit', ['scripts/guidance-round-4-vs-5.mjs']],
  ['action-target-recovery', ['scripts/action-target-recovery-quality.mjs']],
  ['round-5-vs-6 audit', ['scripts/guidance-round-5-vs-6.mjs']],
  ['semantic-language-authority', ['scripts/semantic-language-authority-quality.mjs']],
  ['review-fact-coverage', ['scripts/build-human-review-6.mjs', '--check']],
  ['round-6-vs-7 audit', ['scripts/guidance-round-6-vs-7.mjs']],
  ['title-authority', ['scripts/title-authority-quality.mjs']],
  ['user-visible-labels', ['scripts/user-visible-label-quality.mjs']],
  ['element-containment', ['scripts/element-containment-quality.mjs']],
  ['review-action-fact-coverage', ['scripts/build-human-review-7.mjs', '--check']],
  ['guidance-quality', ['scripts/guidance-quality.mjs']],
  ['workflow-selection-quality', ['scripts/workflow-selection-quality.mjs']],
  ['round-7-vs-8 audit', ['scripts/guidance-round-7-vs-8.mjs']],
  ['runtime-productmodel-integration', ['scripts/runtime-productmodel-integration.mjs']],
  ['runtime-claim-provenance', ['scripts/runtime-claim-provenance.mjs']],
  ['runtime-context-preservation', ['scripts/runtime-context-preservation.mjs']],
  ['runtime-static-contradiction', ['scripts/runtime-static-contradiction.mjs']],
  ['runtime-review-fact-coverage', ['scripts/build-human-review-8.mjs', '--check']],
  ['runtime-review-fact-attribution', ['scripts/runtime-review-fact-attribution.mjs']],
  ['round-8-r1 revision', ['scripts/build-human-review-8-r1.mjs', '--check']],
  ['runtime-collection-semantics', ['scripts/runtime-collection-semantics.mjs']],
  ['runtime-selection-semantics', ['scripts/runtime-selection-semantics.mjs']],
  ['registry-consistency', ['scripts/capability-verification-registry-consistency.mjs']],
  ['guide-bundle', ['scripts/build-guide-bundle.mjs', '--check']],
  ['query-contract', ['scripts/query-contract-quality.mjs']],
  ['query-runtime', ['scripts/query-runtime-quality.mjs']],
  ['guide-ui', ['scripts/guide-ui-quality.mjs']],
  ['interactive-review-integrity', ['scripts/interactive-review-integrity.mjs']],
  ['interactive-review-freeze', ['scripts/interactive-review-freeze.mjs']],
  ['interactive-review-package', ['scripts/build-interactive-review-package.mjs', '--check']],
  ['interactive-review-validity', ['scripts/interactive-review-validity.mjs']],
  ['interactive-review-r2-package', ['scripts/build-interactive-review-r2-package.mjs', '--check']],
  ['interactive-review-v2-package', ['scripts/build-interactive-review-v2-package.mjs', '--check']],
  ['interactive-review-v2-integrity', ['scripts/interactive-review-v2-integrity.mjs']],
  ['interactive-review-v2-freeze', ['scripts/interactive-review-v2-freeze.mjs']],
  ['runtime-instance-grounding', ['scripts/runtime-instance-quality.mjs']],
  ['guide-theme', ['scripts/guide-theme-quality.mjs']],
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

/**
 * The same artefacts, as git has them.
 *
 * Hashing before and after catches a check that mutates during the run, and it
 * cannot catch a check that mutates *deterministically* — once the damage is
 * done, the before and after hashes agree and the run goes green. That is not
 * hypothetical: `test:review-fact-coverage` rewrote the issued Round 6 package
 * on every invocation for a whole loop, because its `--check` exit sat below the
 * writes, and this file reported PASS each time.
 *
 * So the working tree is also compared against what is committed. A historical
 * artefact that differs from HEAD is a falsified record whether or not this run
 * is the one that falsified it.
 */
function committedDifferences() {
  const relative = historicalArtefacts().map((file) => path.relative(ROOT, file));
  try {
    const output = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', ...relative], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return output.split('\n').filter((line) => line.trim().length > 0);
  } catch {
    // No git, or no HEAD yet. The before-and-after check still applies.
    return [];
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

const uncommitted = committedDifferences();
if (uncommitted.length > 0) {
  console.log('');
  for (const file of uncommitted) console.log(`    ✗ ${file} differs from the committed record`);
  console.log('\nFAIL — a historical artefact no longer matches what was checkpointed.\n');
  process.exit(1);
}

console.log('');
if (changed.length > 0) {
  for (const entry of changed) console.log(`    ✗ ${entry}`);
  console.log('\nFAIL — running the checks changed the record they were checking.\n');
  process.exit(1);
}
console.log('PASS — every historical artefact is byte-identical after the run.\n');
