/**
 * Whether interactive review v2 is a truthful account, and still an experiment.
 *
 * Four checks, chosen from four different ways this has actually gone wrong
 * here: a scenario that took a different path from the one it names (v1), a
 * screenshot claiming a state its pixels do not show (v1), a package quietly
 * changing bytes under an issued identity (r1), and an artefact drifting toward
 * looking like validation. `--aspect` selects which gate name reports, over one
 * traversal.
 *
 * Usage:
 *   pnpm test:interactive-review-v2-integrity
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v2');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'integrity' : (process.argv[aspectIndex + 1] ?? 'integrity');
const failures = [];

const pkg = JSON.parse(readFileSync(path.join(DIR, 'interactive-review-v2.package.json'), 'utf8'));
const record = JSON.parse(readFileSync(path.join(DIR, 'interactive-review-v2.json'), 'utf8'));

const REQUIRED = [
  'IR2-01',
  'IR2-02',
  'IR2-03',
  'IR2-04',
  'IR2-05',
  'IR2-06',
  'IR2-07',
  'IR2-08',
  'IR2-09',
  'IR2-10',
  'IR2-11',
  'IR2-12',
  'IR2-13',
  'IR2-14',
];
const VALIDITIES = ['EXERCISED', 'PARTIALLY_EXERCISED', 'NOT_EXERCISED'];

for (const id of REQUIRED) {
  if (!pkg.scenarios.some((entry) => entry.id === id)) failures.push(`${id} is missing`);
}

// --- 1. Nothing is scored by the harness -----------------------------------
for (const scenario of pkg.scenarios) {
  if (!VALIDITIES.includes(scenario.scenarioValidity)) {
    failures.push(`${scenario.id}: no scenarioValidity — a reviewer cannot tell whether this ran`);
  }
  for (const [dimension, value] of Object.entries(scenario.scores ?? {})) {
    if (value !== null) failures.push(`${scenario.id}: ${dimension} was scored by the harness`);
  }
  if (scenario.failureClassification !== null) {
    failures.push(`${scenario.id}: a dominant cause was assigned by the harness`);
  }
}
if (pkg.reviewerType !== null || pkg.scoredBy !== null)
  failures.push('the package asserts a reviewer');
if (pkg.formalHumanValidation !== 'DEFERRED_UNTIL_PRE_RELEASE') {
  failures.push('the package does not defer formal human validation');
}
if (pkg.gate !== 'DEVELOPMENT_INTERACTIVE_REVIEW') failures.push('the gate is mislabelled');

// --- 2. No Round 8 score was transferred -----------------------------------
for (const entry of pkg.roundEightComparison?.mapping ?? []) {
  if (entry.textScore !== null) {
    failures.push(
      `${entry.scenario}: a Round 8 score was transferred into an interactive experiment`,
    );
  }
}

// --- 3. Facts agree with what each scenario is named for -------------------
const facts = (id) => pkg.scenarios.find((entry) => entry.id === id)?.facts ?? {};
const said = (id) => facts(id).guideSaid ?? {};

if ((said('IR2-01').steps ?? []).length < 3)
  failures.push('IR2-01: the create procedure lost a step');
if (!(said('IR2-01').steps ?? []).some((s) => (s.text ?? '').includes('Create client'))) {
  failures.push('IR2-01: the terminal task step is missing');
}
if (facts('IR2-02').actualTarget !== 'clients.search') {
  failures.push(`IR2-02: the headline target resolved to ${facts('IR2-02').actualTarget}`);
}
if (/\bSearch\b/.test(said('IR2-02').allText ?? ''))
  failures.push('IR2-02: a fabricated name reached the user');
if (facts('IR2-04').deleteRenderedCount !== 0) {
  failures.push('IR2-04: asks why Delete cannot be seen while Delete is rendered');
}
if (said('IR2-05').title !== 'New client')
  failures.push('IR2-05: the focused path did not resolve');
if ((said('IR2-06').choices ?? []).length < 2)
  failures.push('IR2-06: recorded as ambiguous with fewer than two candidates');
if (said('IR2-07').purpose !== undefined)
  failures.push('IR2-07: an unsupported question was answered');
if ((facts('IR2-08').interaction?.actionsOffered ?? 1) !== 0) {
  failures.push('IR2-08: a stale context offered executable actions');
}
if ((facts('IR2-09').runtimeInstanceNames ?? []).length === 0) {
  failures.push('IR2-09: claims a dynamic runtime target and records none');
}
if (facts('IR2-10').revealedValueInGuide !== false)
  failures.push('IR2-10: a secret reached the guide');
if (facts('IR2-11').stepper !== '2 of 3')
  failures.push(`IR2-11: the stepper reads ${facts('IR2-11').stepper}`);
if (facts('IR2-13').answerEqualityWithDefault !== true)
  failures.push('IR2-13: a theme changed an answer');
if (facts('IR2-14').geometry?.composerVisible !== true)
  failures.push('IR2-14: the mobile composer is unusable');

// --- 4. Screenshots ---------------------------------------------------------
const shots = readdirSync(path.join(DIR, 'screenshots')).sort();
const index = pkg.screenshotIndex ?? [];
const indexed = new Set(index.map((frame) => path.basename(frame.file)));
for (const file of shots)
  if (!indexed.has(file)) failures.push(`${file} is not in the screenshot index`);
for (const frame of index) {
  if (!Array.isArray(frame.states) || frame.states.length === 0) {
    failures.push(
      `${path.basename(frame.file)}: names no validated state, so its label is unchecked`,
    );
  }
  for (const required of ['route', 'theme', 'viewport', 'state', 'sha256']) {
    if (frame[required] === undefined)
      failures.push(`${path.basename(frame.file)}: no ${required}`);
  }
  const file = path.join(DIR, frame.file);
  if (!existsSync(file)) {
    failures.push(`${frame.file} is indexed and missing`);
    continue;
  }
  const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (digest !== frame.sha256) failures.push(`${frame.file} does not match its recorded digest`);
}
const byDigest = new Map();
for (const frame of index)
  byDigest.set(frame.sha256, [...(byDigest.get(frame.sha256) ?? []), frame.file]);
for (const group of [...byDigest.values()].filter((g) => g.length > 1)) {
  const justified = (pkg.justifiedCollisions ?? []).some(
    (e) => JSON.stringify(e.files) === JSON.stringify(group),
  );
  if (!justified)
    failures.push(`${group.join(' and ')} are byte-identical with no written justification`);
}

// --- 5. Objective metrics stay objective -----------------------------------
const metrics = pkg.objectiveMetrics ?? {};
for (const name of Object.keys(metrics)) {
  if (/usefulness|clarity|helpful/i.test(name))
    failures.push(`objectiveMetrics.${name} is a judgement`);
}
for (const [name, expected] of [
  ['secretLeaks', 0],
  ['fabricatedLabels', 0],
  ['safeActionViolations', 0],
  ['rawSelectorsEmitted', 0],
  ['staleActionsExecuted', 0],
  ['contextPruningErrors', 0],
  ['unauthorisedScreenNames', 0],
]) {
  if (metrics[name] !== expected)
    failures.push(`${name} is ${metrics[name]}, expected ${expected}`);
}
if (metrics.attributionAlwaysOne !== true)
  failures.push('the attribution was not exactly one everywhere');
if (record.pageErrors.length > 0)
  failures.push(`${record.pageErrors.length} page error(s) during the run`);

const say = (line = '') => console.log(line);
const TITLES = {
  integrity: 'Interactive review v2 — integrity',
  'screenshot-state': 'Interactive review v2 — screenshot state',
};
say(`\n${TITLES[ASPECT] ?? TITLES.integrity}\n`);
say(`  scenarios                            ${pkg.scenarios.length}/${REQUIRED.length}`);
say(
  `  exercised                            ${pkg.scenarios.filter((s) => s.scenarioValidity === 'EXERCISED').length}`,
);
say(
  `  partially exercised                  ${pkg.scenarios.filter((s) => s.scenarioValidity === 'PARTIALLY_EXERCISED').length}`,
);
say(`  screenshots                          ${shots.length}, all digest-matched`);
say(
  `  identical frames                     ${[...byDigest.values()].filter((g) => g.length > 1).length}`,
);
say(`  subjective scores assigned           0 required`);
say(`  Round 8 scores transferred           0 required`);

if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    ✗ ${failure}`);
  say('\nFAIL — this review does not faithfully describe what happened.\n');
  process.exit(1);
}
say('\nPASS — every scenario says whether it happened, and every frame shows what it names.\n');
