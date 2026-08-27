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

const scored = JSON.parse(readFileSync(scoredPath, 'utf8'));

/**
 * Which package this submission answers.
 *
 * Read from the submission rather than hardcoded, because a scored file that
 * silently validated against the wrong round would compare twenty-one items to
 * twenty-one different items and report the difference as a result.
 */
const packageName = scored.package;
if (typeof packageName !== 'string' || !/^[a-z0-9-]+$/.test(packageName)) {
  // Required, and constrained to a name rather than a path. It is interpolated
  // into a filename, and a submission that can choose an arbitrary file can
  // choose the file its own validation rules are read from. Defaulting it was
  // worse still: a Round 3 submission that omitted the field was silently
  // validated against Round 2 and every legitimate `not_assessable` rejected
  // with a misleading error about gate v1.
  console.error(
    `"package" must name the issued review package, in lower-case letters, digits and hyphens. Got ${JSON.stringify(packageName)}.`,
  );
  process.exit(1);
}
const issuedPath = path.join(BENCH, `${packageName}.json`);
const keyPath = path.join(BENCH, `${packageName}.key.json`);
if (!existsSync(issuedPath)) {
  console.error(`No issued package named ${packageName}. Nothing to validate against.`);
  process.exit(1);
}
const issued = JSON.parse(readFileSync(issuedPath, 'utf8'));

/**
 * `not_assessable` is a correctness answer, and only from gate v2 onward.
 *
 * Round 2 had no such answer, and the omission distorted its result: six items
 * carried no checkable facts, the reviewer scored correctness 0 on all six —
 * unanimously — and then flagged `incorrect_fact` on none of them. They were
 * not saying the output was wrong. Zero was the only box on the form.
 *
 * So it is accepted, excluded from the correctness mean, and counted on its own.
 * An answer that means "I could not check this" must not be averaged with
 * answers that mean "this is wrong".
 */
const NOT_ASSESSABLE = 'not_assessable';
const allowsNotAssessable = (issued.gateVersion ?? 'v1') !== 'v1';

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

// Review ids run R01..R21 in every round, so the id check above cannot tell one
// package from another: a Round 2 submission relabelled as Round 3 passes it
// completely, and then has its scores correlated against Round 3's hidden
// variables. Two things actually distinguish them, and both are checked.
if (scored.gateVersion !== undefined && scored.gateVersion !== issued.gateVersion) {
  problems.push(
    `this submission was issued under gate ${scored.gateVersion}, but ${packageName} is gate ${issued.gateVersion}. Scoring one round against another's package compares twenty-one items to twenty-one different items.`,
  );
}
const issuedFeatures = new Map(issued.items.map((item) => [item.reviewId, item.featureId]));
for (const item of scored.items ?? []) {
  const expected = issuedFeatures.get(item.reviewId);
  if (expected !== undefined && item.featureId !== undefined && item.featureId !== expected) {
    problems.push(
      `${item.reviewId}: scored ${item.featureId}, but this package issued ${expected} under that id`,
    );
  }
}

// --- Defect 4: a duplicate id inflates every denominator -------------------
// Validation compares sets, so twenty-two items containing R01 twice satisfies
// "every id present, none unexpected" and then computes every percentage,
// median and gate ratio over twenty-two. A duplicated favourable item can push
// a share across the line.
const counts = new Map();
for (const item of scored.items ?? []) {
  counts.set(item.reviewId, (counts.get(item.reviewId) ?? 0) + 1);
}
for (const [id, count] of counts) {
  if (count > 1) problems.push(`review item ${id} appears ${count} times`);
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
    if (dimension === 'correctness' && value === NOT_ASSESSABLE) {
      if (!allowsNotAssessable) {
        problems.push(
          `${where}: this package is gate ${issued.gateVersion ?? 'v1'}, which has no "${NOT_ASSESSABLE}" answer`,
        );
      }
      continue;
    }
    if (!Number.isInteger(value) || value < 0 || value > 2) {
      const allowed =
        dimension === 'correctness' && allowsNotAssessable
          ? `an integer 0-2 or "${NOT_ASSESSABLE}"`
          : 'an integer 0-2';
      problems.push(`${where}: ${dimension} must be ${allowed}, got ${JSON.stringify(value)}`);
    }
  }
  for (const entry of item.flags ?? []) {
    if (!FLAGS.has(entry)) problems.push(`${where}: unknown flag ${JSON.stringify(entry)}`);
  }
}

if (scored.scoredBy === null || scored.scoredBy === undefined || scored.scoredBy === '') {
  problems.push('scoredBy is empty: an unattributed review cannot be audited or repeated.');
}

/**
 * Who reviewed, as a kind rather than as a name.
 *
 * Required, and required to be one of two values, because the distinction
 * decides what the result *is*. A capable model scoring this package produces
 * useful independent evidence and does not close the Human Usefulness Gate, and
 * a name alone does not reliably say which happened — the Round 2 reviewer
 * identified itself honestly in prose, and prose is not something a script can
 * check. Recording the kind explicitly means a later reader cannot mistake one
 * for the other, and neither can a summary.
 */
const REVIEWER_TYPES = new Set(['human', 'non_human_independent']);
if (!REVIEWER_TYPES.has(scored.reviewerType)) {
  problems.push(
    `reviewerType must be "human" or "non_human_independent", got ${JSON.stringify(scored.reviewerType)}. The formal gate turns on which it is.`,
  );
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

console.log(`\nUsefulness review — ${packageName}\n`);
console.log(`  reviewer   ${scored.scoredBy}`);
console.log(`  type       ${scored.reviewerType}`);
console.log(`  items      ${items.length}`);
console.log(
  `  gate       ${issued.gateVersion ?? USEFULNESS_GATE.version}  ·  thresholds ${USEFULNESS_GATE.version}, frozen ${USEFULNESS_GATE.frozenOn}\n`,
);
if (scored.reviewerType !== 'human') {
  console.log('  This is not the human gate. It is independent evidence, and the formal');
  console.log('  Human Usefulness Gate stays open until a person scores the package.\n');
}

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
  const scored = items.map((item) => item[dimension]).filter((value) => typeof value === 'number');
  const skipped = items.length - scored.length;
  const average = scored.length === 0 ? '—' : mean(scored).toFixed(2);
  const note = skipped > 0 ? `   (${skipped} not assessable, excluded)` : '';
  console.log(`    ${dimension.padEnd(16)} ${average}${note}`);
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
/**
 * Items a reviewer positively identified as untrue.
 *
 * The `correctness === 0` half counts only where the package offered
 * `not_assessable`, and the restriction is the entire point. Under gate v1
 * there was no such answer, so a reviewer who could not check an item had one
 * box available and used it: six of Round 2's twenty-one scored correctness 0,
 * they were exactly the six carrying no checkable facts, and not one of them
 * was flagged `incorrect_fact`. Reading those zeros as factual errors would
 * accuse that reviewer of six findings they never made — which is the same
 * conflation `not_assessable` was introduced to end, arriving from the other
 * direction.
 */
const incorrect = items.filter(
  (item) =>
    (item.flags ?? []).includes('incorrect_fact') ||
    (allowsNotAssessable && item.correctness === 0),
).length;

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
    actual: `${incorrect} found untrue`,
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
// The instrument version and the threshold version are different things, and are
// printed as such: gate v2 changed what a reviewer may answer, and cleared the
// identical bar v1 set. One number for both would defeat the stated purpose of
// `USEFULNESS_GATE.version` — telling a later reader which bar a result cleared.
console.log(
  `\n  ${passed ? 'PASS' : 'FAIL'} — usefulness gate ${issued.gateVersion ?? USEFULNESS_GATE.version}, thresholds ${USEFULNESS_GATE.version}`,
);
console.log(
  scored.reviewerType === 'human'
    ? '  Human Usefulness Gate: CLOSED by this review.\n'
    : '  Human Usefulness Gate: STILL OPEN — this reviewer was not human.\n',
);

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

// Only where the key actually carries the variable. Round 3's key records
// `stepCount` rather than `claimCount`, and sorting on an absent field yields
// NaN for every comparison — which leaves the array in package order and prints
// two arbitrary halves under a claim-count heading. A fabricated correlation is
// worse than a missing one in the section whose whole claim is that it compares
// against variables the reviewer never saw.
const countable = paired.filter((row) => typeof row.hidden.claimCount === 'number');
console.log('\n    claim count');
if (countable.length < 4) {
  console.log('      — not recorded for this package');
} else {
  const byClaims = [...countable].sort((a, b) => a.hidden.claimCount - b.hidden.claimCount);
  const half = Math.floor(byClaims.length / 2);
  console.log(
    `      fewer    mean ${mean(byClaims.slice(0, half).map((row) => row.item.usefulness)).toFixed(2)}`,
  );
  console.log(
    `      more     mean ${mean(byClaims.slice(half).map((row) => row.item.usefulness)).toFixed(2)}`,
  );
}

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
