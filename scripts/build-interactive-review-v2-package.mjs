/**
 * The reviewer's copy of interactive review v2.
 *
 * Derived from the v2 run record by pure re-projection — no browser, no
 * screenshots recaptured, no product executed. The record is *evidence*; this is
 * the *instrument*, and they have different requirements: facts and judgements
 * must not share a structure, because a reviewer reading `focused: true` beside
 * an empty score box has the engineering verdict sitting inside the thing they
 * are being asked to judge. A scenario can run flawlessly and still be
 * unhelpful, and the shape has to leave that outcome available.
 *
 * Usage:
 *   node scripts/build-interactive-review-v2-package.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v2');
const RECORD = path.join(DIR, 'interactive-review-v2.json');
const OUT = path.join(DIR, 'interactive-review-v2.package.json');
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
  uiClarity: { min: 0, max: 2, asks: 'Is the panel readable and unambiguous at a glance?' },
};
const BLANK = Object.fromEntries(Object.keys(RUBRIC).map((key) => [key, null]));

const shots = readdirSync(path.join(DIR, 'screenshots')).sort();
const frameByFile = new Map(record.frames.map((frame) => [frame.file, frame]));
const problems = [];
for (const file of shots)
  if (!frameByFile.has(`screenshots/${file}`)) problems.push(`${file} is not associated`);

const byDigest = new Map();
for (const frame of record.frames) {
  byDigest.set(frame.sha256, [...(byDigest.get(frame.sha256) ?? []), frame.file]);
}
const collisions = [...byDigest.values()].filter((group) => group.length > 1);
for (const group of collisions) problems.push(`${group.join(' and ')} are byte-identical`);

const package_ = {
  package: 'interactive-review-v2',
  version: 1,
  evaluates: record.evaluates,
  derivedFrom: { file: 'interactive-review-v2.json', sha256: sha(RECORD) },
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
    'Four scenarios evaluate the product surface rather than product knowledge: step-through, dark theme, host branding and mobile. Judge those on clarity and usability.',
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
    'THEME_INTEGRATION',
    'RESPONSIVE_LAYOUT',
    'OTHER',
  ],
  /**
   * Objective interaction measurements, kept apart from the rubric on purpose.
   *
   * These say the guide behaved correctly. They do not say anybody was helped,
   * and nothing here may be converted into a usefulness score.
   */
  objectiveMetrics: record.metrics,
  environment: { timings: record.timings, pageErrors: record.pageErrors },
  /**
   * Round 8 was text-only, and no scored Round 8 artefact is committed to this
   * repository. The mapping is structural; no score is transferred or inferred.
   */
  roundEightComparison: {
    note: 'Structural mapping only. No committed scored Round 8 artefact exists, so no text score is asserted anywhere in this package.',
    mapping: [
      { scenario: 'IR2-01', featureId: 'clients.create', textScore: null },
      { scenario: 'IR2-02', featureId: 'clients.search', textScore: null, headline: true },
      { scenario: 'IR2-03', featureId: 'clients.export', textScore: null },
      { scenario: 'IR2-04', featureId: 'client-detail.delete', textScore: null },
      { scenario: 'IR2-05', featureId: 'clients.create', textScore: null },
      { scenario: 'IR2-07', featureId: 'invoices.list.open', textScore: null },
      { scenario: 'IR2-09', featureId: 'invoices.list.open', textScore: null },
      { scenario: 'IR2-10', featureId: 'settings.new-key', textScore: null },
    ],
  },
  screenshotIndex: record.frames,
  identicalFrames: collisions,
  justifiedCollisions: [],
  scenarioCount: record.scenarios.length,
  scenarios: record.scenarios.map((scenario) => ({
    id: scenario.id,
    scenario: scenario.scenario,
    scenarioValidity: scenario.scenarioValidity,
    screenshots: scenario.screenshots,
    facts: scenario.facts,
    caveats: scenario.caveats,
    scores: { ...BLANK },
    failureClassification: null,
    note: '',
  })),
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  console.log('\nFAIL — the screenshot set is not sound:\n');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  process.exit(1);
}
if (CHECK) {
  if (readFileSync(OUT, 'utf8') !== serialised) {
    console.log('\nFAIL — the issued v2 package is not what this script produces.\n');
    process.exit(1);
  }
  console.log('\nPASS — the issued interactive review v2 package is reproducible.\n');
  process.exit(0);
}
writeFileSync(OUT, serialised);

const say = (line = '') => console.log(line);
say('\nInteractive review v2 — reviewer package\n');
say(`  scenarios                            ${package_.scenarioCount}`);
say(
  `  exercised                            ${package_.scenarios.filter((s) => s.scenarioValidity === 'EXERCISED').length}`,
);
say(
  `  partially exercised                  ${package_.scenarios.filter((s) => s.scenarioValidity === 'PARTIALLY_EXERCISED').length}`,
);
say(`  screenshots                          ${shots.length}, all associated`);
say(`  identical frames                     ${collisions.length}`);
say(`  scored dimensions                    ${Object.keys(RUBRIC).length}, all null`);
say(`\n  ${path.relative(ROOT, OUT)}\n`);
