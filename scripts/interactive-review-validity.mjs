/**
 * Whether an interactive review is a truthful account of a browser session.
 *
 * Written against the defects that got through v1, because a gate that passes
 * the artefact it was written after is not a gate. Every check below is one v1
 * fails, and the run against v1 is part of this script rather than a claim in a
 * document: `--legacy interactive-review-v1` reports its failures instead of
 * exiting on them, so the historical artefact stays committed and the reasons it
 * was superseded stay visible.
 *
 * What it insists on:
 *
 *   - a scenario says whether it exercised the path it is named for;
 *   - a screenshot names the states it was validated against, and each is a
 *     state something checked;
 *   - two different states do not share an image without a written reason —
 *     v1's four colliding frames were all pictures of the same empty panel,
 *     captured before the answer had finished fading in;
 *   - a scenario claiming a status has facts consistent with it;
 *   - nothing is scored by the harness.
 *
 * Usage:
 *   pnpm test:interactive-review-validity
 *   node scripts/interactive-review-validity.mjs --legacy interactive-review-v1
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const legacyIndex = process.argv.indexOf('--legacy');
const LEGACY = legacyIndex === -1 ? undefined : process.argv[legacyIndex + 1];
const NAME = LEGACY ?? 'interactive-review-v1-r1';
const DIR = path.join(ROOT, 'benchmarks', NAME);
const PACKAGE = path.join(DIR, `${NAME}.package.json`);

if (!existsSync(PACKAGE)) {
  console.log(`\nFAIL — ${NAME} has no reviewer package.\n`);
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(PACKAGE, 'utf8'));
const failures = [];
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const REQUIRED = ['IR01', 'IR02', 'IR03', 'IR04', 'IR05', 'IR06', 'IR07', 'IR08', 'IR09', 'IR10'];
const VALIDITIES = ['EXERCISED', 'PARTIALLY_EXERCISED', 'NOT_EXERCISED'];

for (const id of REQUIRED) {
  if (!pkg.scenarios.some((entry) => entry.id === id)) failures.push(`${id} is missing`);
}

// --- 1. Every scenario declares whether it happened ------------------------
for (const scenario of pkg.scenarios) {
  if (!VALIDITIES.includes(scenario.scenarioValidity)) {
    failures.push(`${scenario.id}: no scenarioValidity — a reviewer cannot tell whether this ran`);
  }
  for (const [dimension, value] of Object.entries(scenario.scores ?? {})) {
    if (value !== null) failures.push(`${scenario.id}: ${dimension} was scored by the harness`);
  }
}

// --- 2. Facts must agree with the scenario's own name ----------------------
//
// The two v1 scenarios that took a different path from the one they described.
const facts = (id) => pkg.scenarios.find((entry) => entry.id === id)?.facts ?? {};
const said = (id) => facts(id).guideSaid ?? {};

if (facts('IR05').hostFocusedBeforeOpening === undefined) {
  failures.push(
    'IR05: does not record which host element was focused, so the focused path is unverifiable',
  );
} else if (said('IR05').purpose === undefined) {
  failures.push(
    'IR05: claims a focused question and records an answer with no purpose — the focus was lost',
  );
}
if ((said('IR06').choices ?? []).length < 2) {
  failures.push('IR06: is recorded as ambiguous and shows fewer than two candidates');
}
if (facts('IR04').deleteRenderedInHost !== false) {
  failures.push('IR04: asks why Delete cannot be seen while Delete is rendered in the host');
}
if ((facts('IR09').runtimeInstanceNames ?? []).length === 0) {
  failures.push('IR09: claims a dynamic runtime target and records none');
}
{
  const steps = (said('IR01').steps ?? []).map((step) => step.text ?? '');
  if (!steps.some((text) => text.includes('Create client'))) {
    failures.push('IR01: the terminal task step is missing from the answer');
  }
}
{
  const text = said('IR02').allText ?? '';
  if (text.includes('That is all I can show') && (facts('IR02').actualTarget ?? null) !== null) {
    failures.push(
      'IR02: says there is nothing more to show beside a target it went on to point at',
    );
  }
}

// --- 3. Screenshots -------------------------------------------------------
const shotsDir = path.join(DIR, 'screenshots');
const shots = existsSync(shotsDir) ? readdirSync(shotsDir).sort() : [];
const index = pkg.screenshotIndex ?? [];
const indexed = new Set(index.map((frame) => path.basename(frame.file)));

for (const file of shots) {
  if (!indexed.has(file)) failures.push(`${file} is not in the screenshot index`);
}
for (const frame of index) {
  if (!Array.isArray(frame.states) || frame.states.length === 0) {
    failures.push(
      `${path.basename(frame.file)}: names no validated state, so its label is unchecked`,
    );
  }
}

const byDigest = new Map();
for (const file of shots) {
  const digest = sha(path.join(shotsDir, file));
  byDigest.set(digest, [...(byDigest.get(digest) ?? []), `screenshots/${file}`]);
}
const justified = pkg.justifiedCollisions ?? [];
for (const group of [...byDigest.values()].filter((entry) => entry.length > 1)) {
  const ok = justified.some((entry) => JSON.stringify(entry.files) === JSON.stringify(group));
  if (!ok) {
    failures.push(
      `${group.join(' and ')} are byte-identical with no written justification — different states must not share an image`,
    );
  }
}

// --- 4. Standing ----------------------------------------------------------
if (pkg.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE') {
  failures.push('the package does not defer formal human validation');
}
if (pkg.reviewerType !== null || pkg.scoredBy !== null)
  failures.push('the package asserts a reviewer');

const say = (line = '') => console.log(line);
say(`\nInteractive review validity — ${NAME}\n`);
say(`  scenarios                            ${pkg.scenarios.length}`);
say(`  screenshots                          ${shots.length}`);
say(
  `  identical frames                     ${[...byDigest.values()].filter((e) => e.length > 1).length}`,
);
say(
  `  declared validity                    ${pkg.scenarios.filter((s) => VALIDITIES.includes(s.scenarioValidity)).length}/${pkg.scenarios.length}`,
);

if (LEGACY !== undefined) {
  say('');
  say(`  ${NAME} is a superseded artefact, kept as history. Its failures under this`);
  say('  gate are the reasons it was superseded, and are reported rather than raised.\n');
  if (failures.length === 0) {
    say('  (none — which would mean this gate is not strong enough)\n');
    process.exit(1);
  }
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('');
  process.exit(0);
}

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — this review does not faithfully describe what happened in a browser.\n');
  process.exit(1);
}
say('\nPASS — every scenario says whether it happened, and every frame shows what it names.\n');
