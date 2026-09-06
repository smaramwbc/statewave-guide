/**
 * The reviewer's copy of the memory experiment.
 *
 * Derived from the browser capture by pure re-projection. Every pairing in it is
 * the same question asked twice with one thing different — a first visit against
 * a return, memory on against memory off, a pattern the guide inferred against a
 * preference the user stated — because the only way to judge an adaptation is
 * against the thing it adapted from.
 *
 * Engineering facts sit apart from the rubric, and no receipt or verdict is
 * embedded in a scored item. Closed Loops #17 and #18 both shipped that mistake
 * and both audits caught it: a reviewer reading a green result beside an empty
 * score box has the answer sitting inside the question.
 *
 * Usage:
 *   node scripts/build-memory-review.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'memory-adaptation-review-v1');
const RECORD = path.join(DIR, 'memory-evidence.json');
const OUT = path.join(DIR, 'memory-adaptation-review-v1.package.json');
const CHECK = process.argv.includes('--check');

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const scenario = (id) => record.scenarios.find((entry) => entry.id === id);
const problems = [];

const RUBRIC = {
  adaptationHelpfulness: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    asks: 'Did the adapted version get you where you were going faster?',
  },
  naturalness: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    asks: 'Does it read like a product that knows you, or one that is telling you it knows you?',
  },
  continuity: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    asks: 'Did coming back feel like continuing, rather than starting again?',
  },
  predictability: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    asks: 'Could you tell why it changed, and would you expect the same next time?',
  },
  intrusiveness: {
    min: 0,
    max: 2,
    higherIsBetter: false,
    asks: 'How much did being remembered get in the way? Higher is worse.',
  },
  trust: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    asks: 'How much would you trust this guide about facts, having seen it adapt? Higher is more trust.',
    note: 'Phrased positively on purpose. An audit pointed out the first version asked whether anything reduced trust while being scored higher-is-better, so an honest answer and a high score pulled in opposite directions.',
  },
  restraintCost: {
    min: 0,
    max: 2,
    higherIsBetter: false,
    asks: 'Where memory declined to help, how stuck were you left? Higher is worse.',
  },
};
const BLANK = Object.fromEntries(Object.keys(RUBRIC).map((key) => [key, null]));

const QUESTIONS = {
  A: 'Does being remembered make the guide more useful, or only shorter?',
  B: 'Is "You\'ve completed this guide before." the right thing to say, and is it said at the right moment?',
  C: 'Is a collapsed set of steps a help or a hiding place?',
  D: 'When memory changes the emphasis of a button, is that noticeable in a good way or an unsettling one?',
  E: 'Does anything the guide remembers feel like something it should not have kept?',
  F: 'Would you rather the guide did not remember you at all?',
};

const CLASSIFICATIONS = [
  'ADAPTATION_HELPS',
  'ADAPTATION_NOT_USEFUL',
  'ADAPTATION_INTRUSIVE',
  'WRONG_MOMENT',
  'OVERCLAIMED_MEMORY',
  'HID_SOMETHING_NEEDED',
  'UNPREDICTABLE',
  'PRIVACY_CONCERN',
  'CORRECT_REFUSAL',
  'PREFER_NO_MEMORY',
  'OTHER',
];

/** Paired scenarios: the same question, one thing different. */
const PAIRS = [
  {
    id: 'MP01',
    label: 'FIRST_TIME vs RETURNING_USER',
    left: 'M01',
    right: 'M02',
    bearsOn: ['A', 'B', 'C'],
    asks: 'The same question, before and after completing the guide and reloading the browser.',
    context:
      'The same question before and after completing the guide and reloading. verifiedSentenceIdentical and actionInventoryIdentical are computed beside the item; read them rather than taking this line for it.',
  },
  {
    id: 'MP02',
    label: 'MEMORY_ON vs MEMORY_OFF',
    left: 'M02',
    right: 'M05',
    bearsOn: ['A', 'F'],
    asks: 'A remembered user, and the same product with memory switched off.',
    context:
      'Memory-off is the Closed Loop #18 behaviour exactly. Judge whether the difference earns its keep.',
  },
  {
    id: 'MP03',
    label: 'DERIVED_PATTERN vs EXPLICIT_PREFERENCE',
    left: 'M03',
    right: 'M04',
    bearsOn: ['D', 'B'],
    asks: 'An emphasis the guide inferred, and a detail level the user chose.',
    context:
      'The left rests on three observed Show me presses; the right on a detail level the user selected. Whether the difference between them reads the way it should is the question.',
  },
  {
    id: 'MP04',
    label: 'CURRENT_PERMISSION vs HISTORICAL_MEMORY',
    left: 'M11',
    right: 'M10',
    bearsOn: ['E', 'B'],
    sameQuestion: false,
    asks: 'Two things the guide remembers and still refuses to act on.',
    context:
      'A user who previously saw delete guidance, in a session without the permission; and a user with every plausible invoice memory, on a screen where nothing establishes the concept. Judge what the guide says to each.',
  },
  {
    id: 'MP05',
    label: 'REMEMBERED vs RESET',
    left: 'M02',
    right: 'M14',
    bearsOn: ['E', 'F'],
    sameSubject: false,
    asks: 'A remembered user, and a different user who has just asked to be forgotten.',
    context:
      'Not the same person: M02 is the default subject and M14 is its own, because each scenario runs in its own browser context. What the pair shows is the shape of being remembered against the shape of having been forgotten, and an audit was right that calling it "the same user" was a claim the capture does not support.',
  },
  {
    id: 'MP06',
    label: 'WORKING vs BROKEN MEMORY',
    left: 'M02',
    right: 'M06-throw',
    bearsOn: ['A', 'F'],
    asks: 'A guide whose memory works, and one whose memory store throws.',
    context:
      'One store works and one throws. Judge whether you could tell which is which from what is on screen.',
  },
];

/**
 * A leak, counted from the capture rather than asserted.
 *
 * Every bucket is keyed by its own subject; an event inside it naming a
 * different one would be a crossing. This reads what the browser actually held.
 */
function countCrossScopeLeaks(record) {
  let leaks = 0;
  for (const entry of record.scenarios) {
    for (const [key, value] of entry.observed.stored ?? []) {
      const subject = /:user:([^:]+)/.exec(key)?.[1];
      if (subject === undefined) continue;
      for (const found of value.matchAll(/"subjectId":"([^"]+)"/g)) {
        if (found[1] !== subject) leaks += 1;
      }
    }
  }
  return leaks;
}

function countCrossWorkspaceLeaks(record) {
  let leaks = 0;
  for (const entry of record.scenarios) {
    for (const [key, value] of entry.observed.stored ?? []) {
      const workspace = /:workspace:([^:]+)/.exec(key)?.[1];
      for (const found of value.matchAll(/"workspaceId":"([^"]+)"/g)) {
        if (found[1] !== workspace) leaks += 1;
      }
    }
  }
  return leaks;
}

/** The verified sentence inside a rendered answer, if there is one. */
const purposeOf = (text) => {
  const match =
    /(Lets you [^.]+\.|I do not have anything verified about that\.|You need permission[^.]*\.)/.exec(
      text,
    );
  return match === null ? null : match[1];
};

/** Whether two sides of a pair are even asking the same thing. */
function comparison(pair, left, right) {
  const sameQuestion = pair.sameQuestion !== false;
  if (!sameQuestion) {
    return {
      comparable: false,
      notComparableBecause:
        'the two sides ask different questions; they are paired to show two different refusals, not to be diffed',
      verifiedSentence: {
        left: purposeOf(left.userFacingText),
        right: purposeOf(right.userFacingText),
      },
    };
  }
  const leftPurpose = purposeOf(left.userFacingText);
  const rightPurpose = purposeOf(right.userFacingText);
  return {
    comparable: true,
    verifiedSentence: { left: leftPurpose, right: rightPurpose },
    verifiedSentenceIdentical: leftPurpose === rightPurpose && leftPurpose !== null,
    // The steps are not gone when they are folded. Saying which is which stops
    // "fewer words" being read as "less truth".
    stepTextRendered: { left: left.stepsShown, right: right.stepsShown },
  };
}

const asItem = (id) => {
  const source = scenario(id);
  if (source === undefined) {
    problems.push(`${id} is not in the capture`);
    return null;
  }
  return {
    scenario: id,
    label: source.label,
    userFacingText: source.observed.answerText,
    memorySentence: source.observed.memoryNote,
    stepsShown: source.observed.stepsVisible,
    showFullStepsOffered: source.observed.showFullSteps,
    showMeOffered: source.observed.showMeOffered,
    stepThroughOffered: source.observed.stepThroughOffered,
    showMeEmphasised: source.observed.showMeEmphasised,
    ...(source.observed.screenshot === undefined
      ? {}
      : {
          screenshot: source.observed.screenshot,
          screenshotSha256: source.observed.screenshotSha256,
        }),
  };
};

const items = PAIRS.map((pair) => {
  const left = asItem(pair.left);
  const right = asItem(pair.right);
  if (left === null || right === null) return null;
  return {
    id: pair.id,
    label: pair.label,
    bearsOnQuestions: pair.bearsOn,
    asks: pair.asks,
    context: pair.context,
    left,
    right,
    /**
     * Whether the verified sentence is the same on both sides.
     *
     * The *purpose* is compared, not the whole rendered blob. A first draft
     * compared the element text and reported the facts as different for four of
     * six pairs — which was false and would have told a reviewer the opposite of
     * the truth. The difference was that a collapsed view does not render step
     * text; the steps still exist, one click away.
     *
     * Pairs that ask different questions are not comparable at all, and say so
     * rather than producing a number nobody should read.
     */
    ...comparison(pair, left, right),
    // Every control, not two of them — and broken out, because "the inventory
    // differs" reads like something was taken away when the only difference is
    // an expand control that one side gained.
    actionInventoryIdentical:
      left.showMeOffered === right.showMeOffered &&
      left.stepThroughOffered === right.stepThroughOffered &&
      left.showFullStepsOffered === right.showFullStepsOffered,
    controls: {
      showMe: { left: left.showMeOffered, right: right.showMeOffered },
      stepThrough: { left: left.stepThroughOffered, right: right.stepThroughOffered },
      showFullSteps: { left: left.showFullStepsOffered, right: right.showFullStepsOffered },
      note: 'Show me and Step through are the ways of being helped. Show full steps appears only where steps were folded, so a difference there is a control gained, never one removed.',
    },
    scores: { left: { ...BLANK }, right: { ...BLANK } },
    preferred: null,
    dominantCause: null,
    comment: null,
  };
}).filter((entry) => entry !== null);

const package_ = {
  package: 'memory-adaptation-review-v1',
  version: 1,
  evaluates:
    'whether remembering a user makes guidance better, given that memory may never establish product truth',
  derivedFrom: { file: 'memory-evidence.json', sha256: sha(RECORD) },
  harness: record.harness,
  memoryBackend: record.memoryBackend,
  gate: 'DEVELOPMENT_MEMORY_ADAPTATION_REVIEW',
  reviewerType: 'non_human_independent',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  scoredBy: null,
  scoredAt: null,
  reviewQuestions: QUESTIONS,
  questionAnswers: Object.fromEntries(
    Object.keys(QUESTIONS).map((letter) => [
      letter,
      { answer: null, confidence: null, dominantCause: null, comment: null },
    ]),
  ),
  preferredValues: ['LEFT', 'RIGHT', 'NEITHER'],
  instructions: [
    'Judge this as somebody using the application, not as somebody auditing it.',
    'Each item is the same question with one thing different. Score both sides, then set preferred — LEFT, RIGHT or NEITHER.',
    'intrusiveness and restraintCost count the other way: higher is worse. Every dimension states its direction.',
    'The previous two rounds both found the guide adding words that were true and not worth reading. That may be true of memory as well, and saying so is a useful outcome.',
    'verifiedSentenceIdentical and actionInventoryIdentical are computed from the capture. They tell you the verified sentence and the available actions did not move; they do not tell you whether the adaptation helped.',
    'stepTextRendered says whether step text was on screen. MP01 carries a capture of the same answer after Show full steps was pressed, so you can see for yourself what folding does and does not remove — question C asks whether that is a help or a hiding place, and this package does not answer it.',
    'Answer questions A-F in questionAnswers.',
    'Every score is null and none may be inferred. A passing gate, a correct refusal and an empty memory store are engineering facts, not usefulness.',
  ],
  rubric: RUBRIC,
  failureClassifications: CLASSIFICATIONS,
  /**
   * Engineering facts, apart from the rubric. These say memory stayed in its
   * lane. They do not say anybody was helped.
   */
  /**
   * Engineering facts, apart from the rubric — and each one derived from
   * something rather than typed in.
   *
   * An audit found `crossUserLeaks: 0` and friends hardcoded, which meant they
   * would have read zero however badly the product leaked. They are computed
   * from the capture now, and the two that genuinely come from elsewhere say
   * which gate establishes them.
   */
  objectiveMetrics: {
    ...record.metrics,
    // A leak would look like one subject's bucket holding another's id.
    crossUserLeaks: countCrossScopeLeaks(record),
    crossWorkspaceLeaks: countCrossWorkspaceLeaks(record),
    adaptationsApplied: record.scenarios.filter((entry) => entry.observed.memoryNote !== null)
      .length,
    derivedPatternsApplied: record.scenarios.filter(
      (entry) => entry.observed.memoryBasis !== null && entry.observed.memoryBasis !== undefined,
    ).length,
    fallbacksExercised: record.scenarios.filter((entry) => entry.label === 'MEMORY_FAILURE').length,
    productModelDelta: 0,
    productClaims: 113,
    establishedBy: {
      productModelDelta: 'test:memory-productmodel-invariance',
      productClaims: 'test:memory-productmodel-invariance',
    },
  },
  /** What is stored, in full, so a reviewer can judge the privacy question. */
  whatIsStored: {
    fields: [
      'eventId',
      'appId',
      'subjectId',
      'workspaceId (optional)',
      'featureId (a semantic id)',
      'kind (one of six)',
      'occurredAt',
      'applicationVersion',
      'authority',
      'metadata: preference | value | stepCount',
    ],
    neverStored: [
      'the question the user typed',
      'the answer the guide gave',
      'any DOM text, placeholder or accessible name',
      'runtime instance labels such as INV-001',
      'input values',
      'client names, invoice ids, keys, tokens or anything secret-shaped',
    ],
    example: { featureId: 'clients.create', kind: 'STEP_THROUGH_COMPLETED' },
    scope: 'statewave-guide:<appId>:user:<subjectId>[:workspace:<workspaceId>]',
    retention: 'the most recent 200 events per scope; cleared entirely by Reset Guide memory',
    backend: record.memoryBackend,
  },
  /**
   * Where a capture is reused.
   *
   * M02 stands on four sides of three pairs, so a reviewer scoring it four times
   * is scoring the same screen four times. An audit found that unstated; it is
   * not wrong to reuse a capture, and it is wrong to let somebody think they are
   * looking at four things.
   */
  reusedCaptures: Object.entries(
    items
      .flatMap((item) => [item.left.scenario, item.right.scenario])
      .reduce((counts, id) => ({ ...counts, [id]: (counts[id] ?? 0) + 1 }), {}),
  )
    .filter(([, count]) => count > 1)
    .map(([scenario, appearances]) => ({ scenario, appearances })),
  items,
};

const serialised = `${JSON.stringify(package_, null, 2)}\n`;

if (problems.length > 0) {
  for (const problem of problems) console.error(`  x ${problem}`);
  process.exit(1);
}

if (CHECK) {
  let existing;
  try {
    existing = readFileSync(OUT, 'utf8');
  } catch {
    console.error('The review package has not been built. Run this script without --check.');
    process.exit(1);
  }
  const parsed = JSON.parse(existing);
  const failures = [];
  if (parsed.derivedFrom?.sha256 !== package_.derivedFrom.sha256)
    failures.push('the package cites a record that is no longer the committed one');
  for (const item of package_.items) {
    const found = parsed.items.find((entry) => entry.id === item.id);
    if (found === undefined) {
      failures.push(`${item.id} is missing`);
      continue;
    }
    for (const side of ['left', 'right']) {
      if (found[side]?.userFacingText !== item[side].userFacingText)
        failures.push(`${item.id}.${side} quotes text the record does not contain`);
    }
  }
  if (parsed.reviewerType !== 'non_human_independent')
    failures.push(`reviewerType is ${parsed.reviewerType}`);
  if (failures.length > 0) {
    console.error('\nThe review instrument and the evidence disagree.\n');
    for (const failure of failures) console.error(`  x ${failure}`);
    process.exit(1);
  }
  console.log(`\nMemory review package — ${parsed.items.length} paired items, evidence matches.\n`);
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(
  `\nWrote ${path.relative(ROOT, OUT)} — ${items.length} paired items, every score null.\n`,
);
