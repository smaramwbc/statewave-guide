/**
 * The interactive review is a development artefact, and must stay one.
 *
 * Closed Loop #7 drew the line between a development usefulness signal and
 * formal human validation, and the reason it had to be drawn is that a
 * convincing-looking artefact drifts into being cited as validation. This one is
 * more convincing than most — it has screenshots — so the properties that make
 * it *not* validation are checked rather than remembered.
 *
 * Usage:
 *   pnpm test:interactive-review-integrity
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v1');
const FILE = path.join(DIR, 'interactive-review-v1.json');
const failures = [];

if (!existsSync(FILE)) {
  console.log('\nFAIL — no interactive review has been recorded.\n');
  process.exit(1);
}
const review = JSON.parse(readFileSync(FILE, 'utf8'));

const REQUIRED = ['IR01', 'IR02', 'IR03', 'IR04', 'IR05', 'IR06', 'IR07', 'IR08', 'IR09', 'IR10'];
const present = review.scenarios.map((scenario) => scenario.id);
for (const id of REQUIRED) {
  if (!present.includes(id)) failures.push(`${id} is missing`);
}

if (review.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE') {
  failures.push('the artefact does not defer formal human validation');
}
if (review.reviewerType !== null) failures.push('a reviewer type is asserted');
if (review.scoredBy !== null) failures.push('a scorer is asserted');
if (review.gate !== 'DEVELOPMENT_INTERACTIVE_REVIEW') failures.push('the gate is mislabelled');

for (const scenario of review.scenarios) {
  for (const [dimension, value] of Object.entries(scenario.scores ?? {})) {
    if (value !== null) failures.push(`${scenario.id}: ${dimension} carries a score`);
  }
  for (const reference of scenario.screenshots ?? []) {
    if (!existsSync(path.join(DIR, reference)))
      failures.push(`${scenario.id}: ${reference} is missing`);
  }
}

// Round 8 R1 is untouched by anything in this loop.
const R1 = path.join(ROOT, 'benchmarks', 'provider-reality-check', 'human-review-round-8-r1.json');
const r1 = JSON.parse(readFileSync(R1, 'utf8'));
if (r1.package !== 'human-review-round-8-r1') failures.push('Round 8 R1 has been altered');
if (
  existsSync(path.join(ROOT, 'benchmarks', 'provider-reality-check', 'human-review-round-9.json'))
) {
  failures.push('a Round 9 package exists');
}

const say = (line = '') => console.log(line);
say('\nInteractive review integrity\n');
say(`  scenarios                            ${present.length}/${REQUIRED.length}`);
say(`  subjective scores assigned           0 required`);
say(`  formal human validation              ${review.formalHumanValidation}`);
say(`  harness                              ${review.harness}`);
say(`  Round 8 R1                           untouched`);
say(`  Round 9                              does not exist`);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — the interactive review is not what it says it is.\n');
  process.exit(1);
}
say('\nPASS — an engineering record with every judgement left to a person.\n');
