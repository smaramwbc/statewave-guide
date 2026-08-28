/**
 * Accepting a scored interactive review, or refusing it.
 *
 * Ready before the scores arrive, and deliberately so: an importer written after
 * seeing the numbers is an importer written to accept them. Nothing here knows
 * what a good result looks like.
 *
 * A scored package is admissible only if it is scoring **this** experiment. The
 * failure this guards against is not fraud, it is drift — a reviewer working
 * from a stale copy, a scenario quietly reworded, a fact block edited to match
 * an opinion. Any of those makes an aggregate a number about two different
 * things at once, and Closed Loop #10 already spent a round on what happens when
 * an artefact changes underneath the thing measuring it.
 *
 * Usage:
 *   node scripts/import-interactive-review.mjs <scored.json>
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v1');
const ISSUED = path.join(DIR, 'interactive-review-v1.package.json');

const target = process.argv[2];
if (target === undefined) {
  console.log('\nUsage: node scripts/import-interactive-review.mjs <scored.json>\n');
  process.exit(2);
}
const scoredPath = path.isAbsolute(target) ? target : path.join(ROOT, target);
if (!existsSync(scoredPath)) {
  console.log(`\nFAIL — ${target} does not exist.\n`);
  process.exit(1);
}

const issued = JSON.parse(readFileSync(ISSUED, 'utf8'));
const scored = JSON.parse(readFileSync(scoredPath, 'utf8'));
const failures = [];

// --- 1. Identity ----------------------------------------------------------
if (scored.package !== issued.package) failures.push(`package is "${scored.package}"`);
if (scored.version !== issued.version) failures.push('version differs');
if (scored.derivedFrom?.sha256 !== issued.derivedFrom.sha256) {
  failures.push('the scored package was derived from a different run record');
}
if (scored.scenarioCount !== issued.scenarioCount) failures.push('the scenario count changed');
if (scored.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE') {
  failures.push('the scored package does not defer formal human validation');
}
if (scored.reviewerType !== 'human' && scored.reviewerType !== 'non_human_independent') {
  failures.push(`reviewerType is "${scored.reviewerType}"`);
}
if (scored.reviewerType === 'human') {
  failures.push(
    'a human review may not be imported through this path; the formal gate has its own procedure',
  );
}

// --- 2. The experiment is unchanged --------------------------------------
const issuedById = new Map(issued.scenarios.map((entry) => [entry.id, entry]));
const scoredById = new Map((scored.scenarios ?? []).map((entry) => [entry.id, entry]));
for (const id of issuedById.keys()) {
  if (!scoredById.has(id)) failures.push(`${id} is missing from the scored package`);
}
for (const id of scoredById.keys()) {
  if (!issuedById.has(id)) failures.push(`${id} was not issued`);
}
for (const [id, before] of issuedById) {
  const after = scoredById.get(id);
  if (after === undefined) continue;
  for (const field of ['scenario', 'evidence', 'screenshots', 'facts']) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      failures.push(`${id}: ${field} differs from what was issued`);
    }
  }
}

// --- 3. The scores themselves --------------------------------------------
const dimensions = Object.entries(issued.rubric);
const totals = Object.fromEntries(dimensions.map(([name]) => [name, []]));
const classifications = {};

for (const [id, entry] of scoredById) {
  for (const [name, range] of dimensions) {
    const value = entry.scores?.[name];
    if (value === null || value === undefined) {
      failures.push(`${id}: ${name} was left unscored`);
      continue;
    }
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      failures.push(
        `${id}: ${name} is ${JSON.stringify(value)}, outside ${range.min}–${range.max}`,
      );
      continue;
    }
    totals[name].push(value);
  }
  const cause = entry.failureClassification;
  if (cause !== null && cause !== undefined) {
    if (!issued.failureClassifications.includes(cause)) {
      failures.push(`${id}: "${cause}" is not a recognised classification`);
    } else {
      classifications[cause] = (classifications[cause] ?? 0) + 1;
    }
  }
  if ((entry.scores?.usefulness ?? 3) <= 1 && (cause === null || cause === undefined)) {
    failures.push(`${id}: scored low with no dominant cause named`);
  }
}

const say = (line = '') => console.log(line);
say('\nInteractive review v1 — import\n');
say(`  scored by                            ${scored.scoredBy ?? '(unnamed)'}`);
say(`  reviewer type                        ${scored.reviewerType}`);
say(`  scenarios                            ${scoredById.size}/${issuedById.size}`);

if (failures.length === 0) {
  say('');
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  };
  for (const [name, range] of dimensions) {
    const values = totals[name];
    if (values.length === 0) continue;
    say(
      `  ${name.padEnd(21)} mean ${mean(values).toFixed(2)}  median ${median(values)}  (0–${range.max})`,
    );
  }
  const usefulness = totals['usefulness'];
  const distribution = [0, 1, 2, 3].map((score) => usefulness.filter((v) => v === score).length);
  say('');
  say(
    `  usefulness distribution              0:${distribution[0]} 1:${distribution[1]} 2:${distribution[2]} 3:${distribution[3]}`,
  );
  say(
    `  share at 2 or better                 ${((usefulness.filter((v) => v >= 2).length / usefulness.length) * 100).toFixed(1)}%`,
  );
  const wrong = totals['correctness'].filter((value) => value === 0).length;
  say(`  scenarios asserting something untrue ${wrong}`);
  if (Object.keys(classifications).length > 0) {
    say('\n  Dominant causes\n');
    for (const [cause, count] of Object.entries(classifications).sort((a, b) => b[1] - a[1])) {
      say(`    ${cause.padEnd(28)} ${count}`);
    }
  }
  say('\n  This is a development signal. FORMAL_HUMAN_VALIDATION_GATE remains');
  say('  DEFERRED_UNTIL_PRE_RELEASE.\n');
  say('PASS — the scored package scores the experiment that was issued.\n');
  process.exit(0);
}

say('\n  Failures\n');
for (const failure of failures.slice(0, 30)) say(`    ✗ ${failure}`);
if (failures.length > 30) say(`    … and ${failures.length - 30} more`);
say('\nFAIL — this does not score the package that was issued.\n');
process.exit(1);
