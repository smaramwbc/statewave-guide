/**
 * Validates a scored human review, then reports what it says.
 *
 * The validation is strict and comes first, because a partially-scored review
 * summarised as though it were complete is worse than no review: a mean over
 * whichever items someone happened to finish looks exactly like a mean over all
 * of them. So every item must be scored, every value in range, and the item set
 * must match the package that was issued — no feature missing, none added.
 *
 * The correlations at the end are the reason the sealed key exists. They are
 * computed only here, only after scores are in hand, and against variables the
 * reviewer never saw: whether a feature had a verified capability, whether it
 * had a workflow, how many claims it carried and of what kinds. Running them
 * before scoring would be measuring our own expectations.
 *
 * Usage:
 *   pnpm benchmark:human-review --file <scored-json>
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const BENCH = path.join(ROOT, 'benchmarks', 'provider-reality-check');

function flag(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/**
 * The gate, frozen before any score was seen.
 *
 * Written down here rather than decided later, because a threshold chosen after
 * the numbers arrive is not a threshold. Changing any of these requires a new
 * `version`, so that a later reader can tell which bar a result cleared.
 */
export const USEFULNESS_GATE = {
  version: 'v1',
  frozenOn: '2026-08-26',
  medianAtLeast: 2,
  shareAtLeastTwo: 0.7,
  incorrectFactualClaims: 0,
  maxShareZero: 0.15,
};

const FLAGS = new Set([
  'too_technical',
  'too_vague',
  'missing_capability',
  'missing_workflow',
  'incorrect_fact',
  'irrelevant_information',
  'repetitive',
  'good_as_is',
]);

const DIMENSIONS = ['correctness', 'clarity', 'actionability', 'naturalLanguage'];

const scoredPath = flag('file', undefined);
if (scoredPath === undefined) {
  console.error('Usage: pnpm benchmark:human-review --file <scored-json>');
  process.exit(1);
}
if (!existsSync(scoredPath)) {
  console.error(`No such file: ${scoredPath}`);
  process.exit(1);
}

const issuedPath = path.join(BENCH, 'human-review-round-2.json');
const keyPath = path.join(BENCH, 'human-review-round-2.key.json');
const issued = JSON.parse(readFileSync(issuedPath, 'utf8'));
const scored = JSON.parse(readFileSync(scoredPath, 'utf8'));

// --- Validation -------------------------------------------------------------

const problems = [];
const issuedIds = new Set(issued.items.map((item) => item.reviewId));
const scoredIds = new Set((scored.items ?? []).map((item) => item.reviewId));

for (const id of issuedIds) {
  if (!scoredIds.has(id)) problems.push(`missing review item: ${id}`);
}
for (const id of scoredIds) {
  if (!issuedIds.has(id)) problems.push(`unexpected review item: ${id}`);
}

for (const item of scored.items ?? []) {
  const where = item.reviewId ?? '(no reviewId)';
  if (!Number.isInteger(item.usefulness) || item.usefulness < 0 || item.usefulness > 3) {
    problems.push(
      `${where}: usefulness must be an integer 0-3, got ${JSON.stringify(item.usefulness)}`,
    );
  }
  for (const dimension of DIMENSIONS) {
    const value = item[dimension];
    if (!Number.isInteger(value) || value < 0 || value > 2) {
      problems.push(`${where}: ${dimension} must be an integer 0-2, got ${JSON.stringify(value)}`);
    }
  }
  for (const entry of item.flags ?? []) {
    if (!FLAGS.has(entry)) problems.push(`${where}: unknown flag ${JSON.stringify(entry)}`);
  }
}

if (scored.scoredBy === null || scored.scoredBy === undefined || scored.scoredBy === '') {
  problems.push('scoredBy is empty: an unattributed review cannot be audited or repeated.');
}

if (problems.length > 0) {
  console.error('This review was not imported.\n');
  for (const problem of problems.slice(0, 40)) console.error(`  ✗ ${problem}`);
  if (problems.length > 40) console.error(`  … and ${problems.length - 40} more`);
  console.error(
    '\nA partly-scored review reported as a whole one is indistinguishable from a complete',
  );
  console.error('result, so nothing is summarised until every item is scored.');
  process.exit(1);
}

// --- Report -----------------------------------------------------------------

const items = scored.items;
const usefulness = items.map((item) => item.usefulness);
const distribution = [0, 1, 2, 3].map(
  (score) => usefulness.filter((value) => value === score).length,
);
const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};
const pct = (count) => `${Math.round((count / items.length) * 100)}%`;

console.log('\nHuman review — Round 2\n');
console.log(`  reviewer   ${scored.scoredBy}`);
console.log(`  items      ${items.length}`);
console.log(`  gate       ${USEFULNESS_GATE.version} (frozen ${USEFULNESS_GATE.frozenOn})\n`);

console.log('  Usefulness\n');
for (const [score, count] of distribution.entries()) {
  console.log(
    `    ${score}  ${String(count).padStart(3)}  ${pct(count).padStart(4)}  ${'█'.repeat(count)}`,
  );
}
console.log(
  `\n    mean ${mean(usefulness).toFixed(2)} · median ${median(usefulness).toFixed(1)}\n`,
);

console.log('  Dimensions (0 poor · 1 acceptable · 2 strong)\n');
for (const dimension of DIMENSIONS) {
  console.log(
    `    ${dimension.padEnd(16)} ${mean(items.map((item) => item[dimension])).toFixed(2)}`,
  );
}

const flagCounts = new Map();
for (const item of items) {
  for (const entry of item.flags ?? []) flagCounts.set(entry, (flagCounts.get(entry) ?? 0) + 1);
}
if (flagCounts.size > 0) {
  console.log('\n  Flags\n');
  for (const [entry, count] of [...flagCounts].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${entry.padEnd(22)} ${count}`);
  }
}

// --- The gate ---------------------------------------------------------------

const atLeastTwo = usefulness.filter((value) => value >= 2).length;
const zeros = distribution[0];
const incorrect = items.filter((item) => (item.flags ?? []).includes('incorrect_fact')).length;

const checks = [
  {
    label: `median usefulness ≥ ${USEFULNESS_GATE.medianAtLeast}`,
    actual: median(usefulness).toFixed(1),
    passed: median(usefulness) >= USEFULNESS_GATE.medianAtLeast,
  },
  {
    label: `≥ ${Math.round(USEFULNESS_GATE.shareAtLeastTwo * 100)}% score ≥ 2`,
    actual: pct(atLeastTwo),
    passed: atLeastTwo / items.length >= USEFULNESS_GATE.shareAtLeastTwo,
  },
  {
    label: 'no feature carries an incorrect factual claim',
    actual: `${incorrect} flagged`,
    passed: incorrect === USEFULNESS_GATE.incorrectFactualClaims,
  },
  {
    label: `≤ ${Math.round(USEFULNESS_GATE.maxShareZero * 100)}% score 0`,
    actual: pct(zeros),
    passed: zeros / items.length <= USEFULNESS_GATE.maxShareZero,
  },
];

console.log('\n  Usefulness gate\n');
for (const check of checks) {
  console.log(`    ${check.passed ? '✓' : '✗'} ${check.label.padEnd(46)} ${check.actual}`);
}
const passed = checks.every((check) => check.passed);
console.log(`\n  ${passed ? 'PASS' : 'FAIL'} — Day 2 usefulness gate ${USEFULNESS_GATE.version}\n`);

// --- Correlations, now that scoring is done ---------------------------------

if (!existsSync(keyPath)) {
  console.log('  No key file, so no correlations. Scores stand on their own.\n');
  process.exit(passed ? 0 : 1);
}

const key = JSON.parse(readFileSync(keyPath, 'utf8'));
const hiddenById = new Map(key.hidden.map((entry) => [entry.featureId, entry]));
const featureByReview = new Map(key.order.map((entry) => [entry.reviewId, entry.featureId]));

const paired = items
  .map((item) => {
    const featureId = featureByReview.get(item.reviewId);
    const hidden = featureId === undefined ? undefined : hiddenById.get(featureId);
    return hidden === undefined ? undefined : { item, hidden, featureId };
  })
  .filter(Boolean);

console.log('  What the scores correlate with\n');
console.log('  (computed only now, against variables the reviewer never saw)\n');

const split = (label, predicate) => {
  const yes = paired.filter((row) => predicate(row.hidden)).map((row) => row.item.usefulness);
  const no = paired.filter((row) => !predicate(row.hidden)).map((row) => row.item.usefulness);
  const describe = (values) =>
    values.length === 0
      ? '—'
      : `n=${String(values.length).padStart(2)}  mean ${mean(values).toFixed(2)}  [${[0, 1, 2, 3]
          .map((score) => values.filter((value) => value === score).length)
          .join('/')}]`;
  console.log(`    ${label}`);
  console.log(`      with     ${describe(yes)}`);
  console.log(`      without  ${describe(no)}`);
};

split('verified capability present', (hidden) => hidden.hasVerifiedCapability);
split('workflow present', (hidden) => hidden.hasWorkflow);

const byClaims = [...paired].sort((a, b) => a.hidden.claimCount - b.hidden.claimCount);
const half = Math.floor(byClaims.length / 2);
console.log('\n    claim count');
console.log(
  `      fewer    mean ${mean(byClaims.slice(0, half).map((row) => row.item.usefulness)).toFixed(2)}`,
);
console.log(
  `      more     mean ${mean(byClaims.slice(half).map((row) => row.item.usefulness)).toFixed(2)}`,
);

console.log('\n    band (our difficulty guess, never shown to the reviewer)');
for (const band of ['easy', 'medium', 'hard', 'refusal']) {
  const values = paired.filter((row) => row.hidden.band === band).map((row) => row.item.usefulness);
  if (values.length > 0) {
    console.log(
      `      ${band.padEnd(9)} n=${String(values.length).padStart(2)}  mean ${mean(values).toFixed(2)}`,
    );
  }
}

console.log(
  '\n  A split is a description, not a cause. With 21 items these are directions to look,',
);
console.log('  not conclusions to act on.\n');

process.exit(passed ? 0 : 1);
