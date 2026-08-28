/**
 * The reviewer's copy of interactive review v1.
 *
 * Derived from the frozen run record by pure re-projection: no browser, no
 * screenshots re-captured, no product executed. `interactive-review-v1.json` is
 * *evidence* — what a real Chromium session did — and stays byte-identical
 * forever. This is the *instrument*, which is a different thing and has
 * different requirements, the same way a Product Model capture and a human
 * review package have always been different files here.
 *
 * Two of those requirements the raw record does not meet, and could not:
 *
 *   - **Facts and judgements must not share a structure.** In the record each
 *     scenario carries `response`, `interaction` and `safety` alongside an empty
 *     `scores`. A reviewer reading that has the engineering verdict sitting
 *     inside the thing they are being asked to judge, and "the harness recorded
 *     `focused: true`" is not an answer to "was this useful". They are separated
 *     here so a low score can coexist with a clean run — which is the outcome
 *     this whole loop most needs to remain possible.
 *   - **Every screenshot must belong to something.** Three of the nine were
 *     captured as panel states rather than scenario evidence and referenced
 *     nowhere. They are associated as context frames rather than quietly
 *     attributed to a scenario they did not come from.
 *
 * Usage:
 *   node scripts/build-interactive-review-package.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'interactive-review-v1');
const RECORD = path.join(DIR, 'interactive-review-v1.json');
const OUT = path.join(DIR, 'interactive-review-v1.package.json');
const CHECK = process.argv.includes('--check');

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** The seven dimensions the incoming review will carry, and their ranges. */
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

/**
 * What each screenshot is a picture of.
 *
 * Taken from the run that produced them — the order the end-to-end script
 * captures in — rather than inferred from the images. A frame with no scenario
 * says so; none is attributed to a scenario it did not come from.
 */
const FRAMES = {
  'A-host-guide-closed.png': {
    scenario: null,
    state: 'The host application with the guide closed.',
    route: '/clients',
  },
  'B-guide-empty.png': {
    scenario: null,
    state: 'The panel open, before anything has been asked.',
    route: '/clients',
  },
  'C-create-client-response.png': {
    scenario: 'IR01',
    state: 'The answer, on the Clients screen.',
    route: '/clients',
  },
  'D-showme-highlight-new-client.png': {
    scenario: 'IR05',
    state: 'The answer to a focused question about the New client control.',
    route: '/clients',
  },
  'E-filter-clients-response.png': {
    scenario: 'IR02',
    state: 'The answer, before Show me.',
    route: '/clients',
  },
  'F-unnamed-input-highlighted.png': {
    scenario: 'IR02',
    state: 'After Show me: the unnamed filter input scrolled to, highlighted and focused.',
    route: '/clients',
    highlightedTarget: 'clients.search',
  },
  'G-permission-explanation.png': {
    scenario: 'IR04',
    state: 'The permission explanation.',
    route: '/clients/c1',
  },
  'H-ambiguous-response.png': {
    scenario: 'IR06',
    state: 'An ambiguous question, answered with a choice rather than a guess.',
    route: '/clients',
  },
  'I-developer-inspector.png': {
    scenario: null,
    state: 'The developer inspector, open. Never present in user mode.',
    route: '/clients?dev=1',
  },
};

const shots = readdirSync(path.join(DIR, 'screenshots')).sort();
const problems = [];
for (const file of shots)
  if (FRAMES[file] === undefined) problems.push(`${file} is not associated`);
for (const file of Object.keys(FRAMES))
  if (!shots.includes(file)) problems.push(`${file} does not exist`);

/**
 * The objective half.
 *
 * Everything a machine observed, verbatim from the run. A reviewer may read it —
 * it is how they check a claim without source access — and it is deliberately
 * not phrased as a verdict.
 */
function factsOf(scenario) {
  const response = scenario.response ?? null;
  return {
    initialRoute: scenario.initialRoute ?? null,
    routeAfter: scenario.routeAfter ?? null,
    question: scenario.question ?? null,
    context: scenario.context ?? null,
    guideSaid: response,
    expectedTarget: scenario.expectedTarget ?? null,
    actualTarget: scenario.actualTarget ?? null,
    interaction: scenario.interaction ?? {},
    safety: scenario.safety ?? {},
    ...(scenario.runtimeInstanceNames === undefined
      ? {}
      : { runtimeInstanceNames: scenario.runtimeInstanceNames }),
    ...(scenario.revealedValuePresentInHost === undefined
      ? {}
      : {
          revealedValuePresentInHost: scenario.revealedValuePresentInHost,
          revealedValueInGuide: scenario.revealedValueInGuide,
        }),
    ...(scenario.note === undefined ? {} : { harnessNote: scenario.note }),
  };
}

/**
 * How each scenario relates to a Round 8 R1 item, where it relates at all.
 *
 * The mapping is recorded; the Round 8 numbers are **not**, because they are not
 * in this repository. No scored Round 8 or Round 8 R1 file was ever committed —
 * the R1 result exists as an aggregate stated in a loop specification, and the
 * only per-item Round 8 scores that ever existed belong to the superseded
 * package that was withdrawn for a fact-attribution defect and explicitly not
 * imported. Writing "text usefulness 1" beside `clients.search` here would be
 * citing a number this system cannot produce, from a package it refused.
 *
 * So the comparison is prepared as a mapping and left for a reviewer to make.
 */
const ROUND_8 = {
  note: 'Round 8 R1 scored the Markdown instrument. No per-item Round 8 or Round 8 R1 scores are committed to this repository, so no text score is asserted here. The mapping below is structural only.',
  r1Aggregates: {
    source: 'stated in the Closed Loop #11 specification; no scored file is committed',
    distribution: { 0: 6, 1: 2, 2: 10, 3: 3 },
    meanUsefulness: 1.48,
    medianUsefulness: 2,
    shareAtLeastTwo: 0.619,
    correctness: 2.0,
    incorrectFactualClaims: 0,
  },
  mapping: [
    { scenario: 'IR01', featureId: 'clients.create', textScore: null },
    { scenario: 'IR02', featureId: 'clients.search', textScore: null, headline: true },
    { scenario: 'IR03', featureId: 'clients.export', textScore: null },
    { scenario: 'IR04', featureId: 'client-detail.delete', textScore: null },
    { scenario: 'IR05', featureId: 'clients.create', textScore: null },
    { scenario: 'IR06', featureId: null, textScore: null },
    { scenario: 'IR07', featureId: 'invoices.list.open', textScore: null },
    { scenario: 'IR08', featureId: null, textScore: null },
    { scenario: 'IR09', featureId: 'invoices.list.open', textScore: null },
    { scenario: 'IR10', featureId: 'settings.new-key', textScore: null },
  ],
};

/**
 * Where the run did not exercise what the scenario is named for.
 *
 * Computed from the record, not asserted. Freezing the package is what surfaced
 * these: two screenshots turned out to be byte-identical, which is only possible
 * if the focused question and the ambiguous one produced the same screen — and
 * they did. A reviewer scoring `IR05` would otherwise be told they were looking
 * at a focused answer and be looking at a refusal.
 *
 * The scenarios are issued anyway, carrying the caveat. Removing them would hide
 * a defect; fixing them would mean re-running a frozen experiment.
 */
function caveatsFor(scenario) {
  const caveats = [];
  const said = scenario.response?.allText ?? '';
  const declaredFocus = scenario.context?.focusedSemanticId;

  if (declaredFocus !== undefined && scenario.response?.purpose === undefined) {
    caveats.push(
      `The scenario supplied a focused target (${declaredFocus}) and the guide answered as though none was supplied. ` +
        'Opening the panel moves focus into its composer, so by the time the question is asked the host no longer ' +
        'reports the element the user was looking at. The focused path is therefore NOT exercised by this run.',
    );
  }
  if (scenario.id === 'IR06' && !said.includes('mean')) {
    caveats.push(
      'This is recorded as an ambiguous question but the guide returned an unsupported answer, not a choice. ' +
        'The host registers no elements explicitly — it marks its markup with `data-guide` — so the visible-target ' +
        'list reaching the query contract is empty and there is nothing to be ambiguous between.',
    );
  }
  if (scenario.id === 'IR08') {
    caveats.push(
      'Stale context is exercised in the contract test suite rather than in the browser: the host always reports its ' +
        'own live build, so it cannot produce a stale snapshot without being made to lie.',
    );
  }
  if (scenario.id === 'IR09') {
    caveats.push(
      'The runtime instance names below are read from the running application. No screenshot was captured for this ' +
        'scenario, and nothing here entered the ProductModel or any guide sentence.',
    );
  }
  return caveats;
}

const scenarios = record.scenarios.map((scenario) => ({
  id: scenario.id,
  scenario: scenario.scenario,
  evidence:
    scenario.id === 'IR08'
      ? 'contract-suite'
      : scenario.screenshots !== undefined
        ? 'browser'
        : 'browser-no-screenshot',
  screenshots: shots
    .filter((file) => FRAMES[file]?.scenario === scenario.id)
    .map((file) => `screenshots/${file}`),
  facts: factsOf(scenario),
  caveats: caveatsFor(scenario),
  scores: { ...BLANK },
  /** One dominant cause, chosen by the reviewer only where a score is low. */
  failureClassification: null,
  note: '',
}));

const package_ = {
  package: 'interactive-review-v1',
  version: 1,
  derivedFrom: { file: 'interactive-review-v1.json', sha256: sha(RECORD) },
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
    'Score every dimension for every scenario. Leave nothing null.',
    'Where a score is low, choose exactly one dominant cause from failureClassifications.',
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
  contextFrames: shots
    .filter((file) => FRAMES[file].scenario === null)
    .map((file) => ({ file: `screenshots/${file}`, ...FRAMES[file] })),
  screenshotIndex: shots.map((file) => ({
    file: `screenshots/${file}`,
    ...FRAMES[file],
    sha256: sha(path.join(DIR, 'screenshots', file)),
  })),
  /**
   * Frames that turned out to be the same image.
   *
   * Two questions that were meant to produce different screens produced one, and
   * the digests are how that was noticed. Recorded because it is the evidence
   * for the caveat on `IR05`.
   */
  identicalFrames: (() => {
    const byDigest = new Map();
    for (const file of shots) {
      const digest = sha(path.join(DIR, 'screenshots', file));
      byDigest.set(digest, [...(byDigest.get(digest) ?? []), `screenshots/${file}`]);
    }
    return [...byDigest.values()].filter((group) => group.length > 1);
  })(),
  roundEightComparison: ROUND_8,
  scenarioCount: scenarios.length,
  scenarios,
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  console.log('\nFAIL — the screenshot association is incomplete:\n');
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  console.log('');
  process.exit(1);
}

if (CHECK) {
  const committed = readFileSync(OUT, 'utf8');
  if (committed !== serialised) {
    console.log('\nFAIL — the issued package is not what this script produces.\n');
    process.exit(1);
  }
  console.log('\nPASS — the issued interactive review package is reproducible.\n');
  process.exit(0);
}

writeFileSync(OUT, serialised);

const say = (line = '') => console.log(line);
say('\nInteractive review v1 — reviewer package\n');
say(`  scenarios                            ${scenarios.length}`);
say(`  screenshots associated               ${shots.length}/${shots.length}`);
say(`  orphan screenshots                   0`);
say(`  scored dimensions                    ${Object.keys(RUBRIC).length}, all null`);
say(`  derived from                         interactive-review-v1.json`);
say('');
for (const entry of package_.screenshotIndex) {
  say(
    `    ${entry.file.replace('screenshots/', '').padEnd(34)} ${entry.scenario ?? '(context frame)'}`,
  );
}
say('');
say(`  ${path.relative(ROOT, OUT)}`);
say('');
