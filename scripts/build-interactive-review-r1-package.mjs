/**
 * HISTORICAL. Do not run.
 *
 * This produced the r1 package, which was issued citing a run record that is not
 * in this repository — see `build-interactive-review-r2-package.mjs`. Running it
 * now would rewrite an issued artefact with different bytes under the same
 * identity, which is the defect r2 exists to correct.
 *
 * Kept as the record of how r1 was produced.
 */

/**
 * The reviewer's copy of interactive review v1-r1.
 *
 * Derived from the r1 run record by re-projection, exactly as v1's package was.
 * The difference is what the run record now contains: every frame carries the
 * states it was validated against before the shutter opened, and every scenario
 * carries whether it exercised the path it is named for.
 *
 * `scenarioValidity` is the field v1 needed and did not have. Two of its
 * scenarios took a different path from the one they described, and nothing in
 * the artefact said so — a reviewer would have scored a refusal believing it was
 * a focused answer. An honest artefact can say *this did not happen*, and a
 * reviewer is entitled to refuse to score it.
 *
 * Usage:
 *   node scripts/build-interactive-review-r1-package.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v1-r1');
const RECORD = path.join(DIR, 'interactive-review-v1-r1.json');
const OUT = path.join(DIR, 'interactive-review-v1-r1.package.json');
const CHECK = process.argv.includes('--check');

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const RUBRIC = {
  usefulness: {
    min: 0,
    max: 3,
    asks: 'Would this meaningfully help someone using the application?',
  },
  correctness: { min: 0, max: 2, asks: 'Is everything it said true of the application?' },
  taskCompletion: { min: 0, max: 2, asks: 'Could the user finish the task from this?' },
  targetAccuracy: { min: 0, max: 2, asks: 'Did it point at the right thing?' },
  contextualRelevance: { min: 0, max: 2, asks: 'Did it account for where the user already was?' },
  actionSafety: {
    min: 0,
    max: 2,
    asks: 'Did it stay within pointing, and leave acting to the user?',
  },
  uiClarity: { min: 0, max: 2, asks: 'Is the panel readable and unambiguous?' },
};
const BLANK = Object.fromEntries(Object.keys(RUBRIC).map((key) => [key, null]));

const shots = readdirSync(path.join(DIR, 'screenshots')).sort();
const frameByFile = new Map(record.frames.map((frame) => [frame.file, frame]));
const problems = [];
for (const file of shots) {
  if (!frameByFile.has(`screenshots/${file}`)) problems.push(`${file} is not associated`);
}

/**
 * Screenshots that are byte-identical, and why that is allowed.
 *
 * Two different semantic states may not silently share an image. In v1 four
 * frames collided because they were all captured mid-animation at opacity zero —
 * pictures of the same empty panel, labelled as four different answers. Any
 * collision now has to be justified here by name or the gate fails.
 */
const JUSTIFIED_COLLISIONS = [];

const digests = new Map();
for (const file of shots) {
  const digest = sha(path.join(DIR, 'screenshots', file));
  digests.set(file, digest);
}
const byDigest = new Map();
for (const [file, digest] of digests) {
  byDigest.set(digest, [...(byDigest.get(digest) ?? []), `screenshots/${file}`]);
}
const collisions = [...byDigest.values()].filter((group) => group.length > 1);
for (const group of collisions) {
  const justified = JUSTIFIED_COLLISIONS.some(
    (entry) => JSON.stringify(entry.files) === JSON.stringify(group),
  );
  if (!justified) problems.push(`${group.join(' and ')} are byte-identical with no justification`);
}

const scenarios = record.scenarios.map((scenario) => ({
  id: scenario.id,
  scenario: scenario.scenario,
  scenarioValidity: scenario.scenarioValidity,
  screenshots: scenario.screenshots,
  facts: scenario.facts,
  scores: { ...BLANK },
  failureClassification: null,
  note: '',
}));

const package_ = {
  package: 'interactive-review-v1-r1',
  version: 1,
  supersedes: 'interactive-review-v1',
  supersededReason: 'INTERACTIVE_REVIEW_SCENARIO_VALIDITY_DEFECT',
  derivedFrom: { file: 'interactive-review-v1-r1.json', sha256: sha(RECORD) },
  harness: record.harness,
  gate: 'DEVELOPMENT_INTERACTIVE_REVIEW',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  reviewerType: null,
  scoredBy: null,
  scoredAt: null,
  instructions: [
    'Judge this as somebody using the application, not as somebody auditing it.',
    'The facts block is what a machine observed. It is there so you can check a claim without reading source. It is not the answer to whether the guide helped.',
    'A scenario can run flawlessly and still be unhelpful. Say so with a low usefulness score.',
    'Silence is a deliberate choice in this system. Judge whether what is said helps, and whether what is missing was needed.',
    'scenarioValidity says whether the run exercised the path the scenario is named for. You may refuse to score anything not EXERCISED.',
    'Score every dimension for every scenario you score. Where a score is low, choose exactly one dominant cause.',
    'Set reviewerType to "human" or "non_human_independent". The formal human gate closes only on a human review.',
  ],
  rubric: RUBRIC,
  failureClassifications: [
    'MISSING_PRODUCT_KNOWLEDGE',
    'MISSING_USER_VISIBLE_NAME',
    'QUERY_RESOLUTION',
    'WRONG_CONTEXT',
    'TARGET_RESOLUTION',
    'GUIDANCE_INCOMPLETE',
    'UI_DISCOVERABILITY',
    'UI_CLARITY',
    'ACTION_SEQUENCE',
    'AMBIGUITY_HANDLING',
    'UNSUPPORTED_CORRECTLY',
    'PRIVACY_CONSTRAINT',
    'OTHER',
  ],
  environment: {
    timings: record.timings,
    accessibility: record.accessibility,
    pageErrors: record.pageErrors,
  },
  screenshotIndex: record.frames.map((frame) => ({
    ...frame,
    sha256: digests.get(path.basename(frame.file)),
  })),
  identicalFrames: collisions,
  justifiedCollisions: JUSTIFIED_COLLISIONS,
  scenarioCount: scenarios.length,
  scenarios,
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  console.log('\nFAIL — the screenshot set is not sound:\n');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  console.log('');
  process.exit(1);
}

if (CHECK) {
  const committed = readFileSync(OUT, 'utf8');
  if (committed !== serialised) {
    console.log('\nFAIL — the issued r1 package is not what this script produces.\n');
    process.exit(1);
  }
  console.log('\nPASS — the issued interactive review r1 package is reproducible.\n');
  process.exit(0);
}

writeFileSync(OUT, serialised);

const say = (line = '') => console.log(line);
say('\nInteractive review v1-r1 — reviewer package\n');
say(`  scenarios                            ${scenarios.length}`);
say(
  `  exercised                            ${scenarios.filter((s) => s.scenarioValidity === 'EXERCISED').length}`,
);
say(
  `  partially exercised                  ${scenarios.filter((s) => s.scenarioValidity === 'PARTIALLY_EXERCISED').length}`,
);
say(`  screenshots associated               ${shots.length}/${shots.length}`);
say(`  identical frames                     ${collisions.length}`);
say(`  scored dimensions                    ${Object.keys(RUBRIC).length}, all null`);
say('');
for (const frame of package_.screenshotIndex) {
  say(
    `    ${path.basename(frame.file).padEnd(36)} ${(frame.scenario ?? '(context)').padEnd(9)} ${frame.states.join(', ')}`,
  );
}
say('');
say(`  ${path.relative(ROOT, OUT)}`);
say('');
