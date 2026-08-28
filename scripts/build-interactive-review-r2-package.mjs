/**
 * Interactive review v1-r2 — the same experiment, under an honest identity.
 *
 * The r1 *package* was issued at `2300258` claiming to derive from a run record
 * whose digest is `651c5568…`. No such record is in this repository: the
 * end-to-end capture was re-run by a later gate in the same sweep, overwriting
 * the record after the package had been built, and the record that reached the
 * commit is `cf5cf6fe…`. The package therefore cited evidence nobody has.
 *
 * Closed Loop #14 corrected that by rebuilding the package **in place**, which
 * fixed the citation and introduced a worse problem: an issued artefact changed
 * bytes under the same name. Anyone holding r1 from the first commit and anyone
 * pulling it afterwards had different files and no way to know.
 *
 * So r1 is restored to exactly what was issued — inconsistent, and preserved
 * because that is what inconsistency looks like — and the corrected package is
 * issued here under a new identity. Only the *package* is superseded: the record
 * and the screenshots were never in question, so this cites them where they live
 * rather than duplicating thirteen images to make a directory look complete.
 *
 * Usage:
 *   node scripts/build-interactive-review-r2-package.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const R1 = path.join(ROOT, 'benchmarks', 'interactive-review-v1-r1');
const OUT = path.join(
  ROOT,
  'benchmarks',
  'interactive-review-v1-r2',
  'interactive-review-v1-r2.package.json',
);
const RECORD = path.join(R1, 'interactive-review-v1-r1.json');
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

const shots = readdirSync(path.join(R1, 'screenshots')).sort();
const frameByFile = new Map(record.frames.map((frame) => [frame.file, frame]));
const problems = [];
for (const file of shots) {
  if (!frameByFile.has(`screenshots/${file}`)) problems.push(`${file} is not associated`);
}

const digests = new Map(shots.map((file) => [file, sha(path.join(R1, 'screenshots', file))]));
const byDigest = new Map();
for (const [file, digest] of digests) {
  byDigest.set(digest, [...(byDigest.get(digest) ?? []), `screenshots/${file}`]);
}
const collisions = [...byDigest.values()].filter((group) => group.length > 1);
for (const group of collisions) problems.push(`${group.join(' and ')} are byte-identical`);

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
  package: 'interactive-review-v1-r2',
  version: 1,
  supersedes: 'interactive-review-v1-r1',
  supersededReason: 'REVIEW_PACKAGE_RECORD_DIVERGENCE',
  supersededDetail:
    'The r1 package cited a run record (651c5568…) that is not in this repository: the capture was re-run after the package was built and the committed record is cf5cf6fe…. r1 has been restored to the bytes actually issued and is preserved unchanged; this package cites the record that exists.',
  derivedFrom: {
    file: '../interactive-review-v1-r1/interactive-review-v1-r1.json',
    sha256: sha(RECORD),
  },
  screenshotBase: '../interactive-review-v1-r1/',
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
    'scenarioValidity says whether the run exercised the path the scenario is named for. You may refuse to score anything not EXERCISED.',
    'This evaluates the Closed Loop #13.1 engineering UI, not the current product surface. See interactive-review-v2 for that.',
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
  justifiedCollisions: [],
  scenarioCount: scenarios.length,
  scenarios,
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  console.log('\nFAIL — the screenshot set is not sound:\n');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  process.exit(1);
}
if (CHECK) {
  if (readFileSync(OUT, 'utf8') !== serialised) {
    console.log('\nFAIL — the issued r2 package is not what this script produces.\n');
    process.exit(1);
  }
  console.log('\nPASS — the issued interactive review r2 package is reproducible.\n');
  process.exit(0);
}
writeFileSync(OUT, serialised);
console.log('\nInteractive review v1-r2\n');
console.log(`  supersedes                           interactive-review-v1-r1`);
console.log(`  reason                               REVIEW_PACKAGE_RECORD_DIVERGENCE`);
console.log(`  scenarios                            ${scenarios.length}`);
console.log(
  `  cites record                         ${sha(RECORD).slice(0, 16)} (the one that exists)`,
);
console.log(`\n  ${path.relative(ROOT, OUT)}\n`);
