/**
 * The reviewer's copy of the Statewave persistence experiment.
 *
 * Earned rather than assumed: this package is only built from a capture that ran
 * against a real Statewave server. The brief for this loop was explicit that a
 * fake adapter may not be labelled Statewave, and the capture skips itself
 * rather than pretending when no server is configured — so a package existing at
 * all is evidence that a round trip happened.
 *
 * Every score is null. Measurements sit in their own container one level away
 * from the questions, and the pairings are the same screen with one thing
 * different,
 * because the only way to judge "the guide remembered me" is against the guide
 * that did not.
 *
 * Usage:
 *   node scripts/build-statewave-review.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'statewave-persistence-review-v1');
const RECORD = path.join(DIR, 'statewave-evidence.json');
const OUT = path.join(DIR, 'statewave-persistence-review-v1.package.json');
const CHECK = process.argv.includes('--check');

let record;
try {
  record = JSON.parse(readFileSync(RECORD, 'utf8'));
} catch {
  console.error(
    '\nNo Statewave capture is present. Run `pnpm capture:statewave` against a real server first.\n',
  );
  process.exit(1);
}

const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const scenario = (id) => record.scenarios.find((entry) => entry.id === id);
const problems = [];

const RUBRIC = {
  continuity: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    scope: 'PAIR',
    asks: 'Did coming back on a different machine feel like continuing rather than starting again?',
  },
  worthTheChange: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    scope: 'PAIR',
    asks: 'Is the difference between these two screens worth persisting anything for?',
  },
  truthfulness: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    scope: 'PER_SIDE',
    asks: 'Is everything on the screen true of the screen the user is looking at?',
  },
  restraint: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    scope: 'PER_SIDE',
    asks: 'Does it say as little as it can get away with, rather than as much as it knows?',
  },
  trustworthiness: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    scope: 'PAIR',
    asks: 'Knowing this is stored on a server, would you be comfortable with what it kept?',
  },
};

/** One side of a pair, quoted from the capture rather than described. */
function side(id, note) {
  const source = scenario(id)?.observed;
  if (source === undefined) {
    problems.push(`${id} is not in the record`);
    return { scenario: id };
  }
  return {
    scenario: id,
    note,
    screenshot: source.screenshot ?? null,
    screenshotSha256: source.screenshotSha256 ?? null,
    title: source.title ?? null,
    purpose: source.purpose ?? null,
    condition: source.condition ?? null,
    stepsVisible: source.stepsVisible ?? null,
    expandControl: source.expandControl ?? null,
    actions: source.actions ?? [],
    localStorageGuideKeys: source.localStorageGuideKeys ?? [],
    remoteEpisodes: source.remoteEpisodes ?? source.remoteEpisodesPresent ?? null,
    userFacingText: source.answerText ?? null,
  };
}

function item({ id, label, question, context, left, right, dimensions }) {
  const comparable = left.screenshotSha256 !== null && right.screenshotSha256 !== null;
  const scores = Object.fromEntries(
    dimensions.map((key) => [
      key,
      RUBRIC[key].scope === 'PAIR' ? { pair: null } : { left: null, right: null },
    ]),
  );
  return {
    id,
    label,
    question,
    context,
    left,
    right,
    /**
     * Measurements, in their own container.
     *
     * They used to sit as sibling fields of `scores`, which an audit called
     * engineering verdicts embedded in a scored item — a reviewer reading
     * `verifiedTextIdentical: true` beside an empty box for "is this truthful"
     * has been handed something that looks like the answer. They are still
     * published, because a reviewer should not have to take a claim on trust;
     * they are one level away from the question, and named as what they are.
     */
    measurements: {
      identicalScreenshots: comparable ? left.screenshotSha256 === right.screenshotSha256 : null,
      purposeAndConditionIdentical:
        left.purpose === right.purpose && left.condition === right.condition,
      actionsIdentical: JSON.stringify(left.actions) === JSON.stringify(right.actions),
      browserStorageKeysEitherSide: [
        ...(left.localStorageGuideKeys ?? []),
        ...(right.localStorageGuideKeys ?? []),
      ].length,
    },
    dimensions,
    scores,
    preferred: null,
    freeText: null,
  };
}

const items = [
  item({
    id: 'SP01',
    label: 'REMOTE FIRST TIME vs REMOTE RETURNING, NEW BROWSER CONTEXT',
    question:
      'The same person asks the same question twice. Between the two, the browser was thrown away. Is the second answer better for them?',
    context:
      'Both screens come from the same build and the same Statewave server. The second is a second, independent browser context — separate storage, nothing shared — whose local storage was empty before it asked and after. `measurements.browserStorageKeysEitherSide` is that count, and it is the whole claim of this loop.',
    left: side('SW01', 'first visit, nothing remembered anywhere'),
    right: side('SW02', 'a second context, recognising a completed guide from the server'),
    dimensions: ['continuity', 'worthTheChange', 'truthfulness', 'restraint'],
  }),
  item({
    id: 'SP02',
    label: 'REMOTE RETURNING vs REMOTE UNREACHABLE',
    question:
      'The memory server is down. Compare what the user gets to what they get when it is up. Is the degradation acceptable?',
    context:
      'The right-hand screen was produced with the memory endpoint pointed at a port with nothing on it. Judge whether a person could tell that something was broken, and whether they should be able to.',
    left: side('SW02', 'the server answered'),
    right: side('SW06', 'the server was unreachable'),
    dimensions: ['truthfulness', 'restraint', 'worthTheChange'],
  }),
  item({
    id: 'SP03',
    label: 'ALICE RETURNING vs BOB FIRST TIME',
    question:
      'Alice finished this guide; Bob never has. Both ask the same question against the same server. Is the separation evident from the screens?',
    context:
      "Alice's completion is still in Statewave while Bob asks — otherSubjectEpisodes in the capture records that it was present and not applied.",
    left: side('SW02', 'Alice, recognised'),
    right: side('SW03', 'Bob, on the same server, unrecognised'),
    dimensions: ['truthfulness', 'trustworthiness', 'worthTheChange'],
  }),
  item({
    id: 'SP04',
    label: 'SAME BUILD vs DIFFERENT BUILD',
    question:
      'The same completion, read on a build the application has moved past. Should the guide still shorten the answer?',
    context:
      'Version scoping is a Closed Loop #19 rule this loop did not change: a guide completed against a build the application has moved past is history, not a reason to collapse the steps somebody is looking at now.',
    left: side('SW02', 'the build the completion happened on'),
    right: side('SW05', 'a different application version'),
    dimensions: ['truthfulness', 'worthTheChange', 'trustworthiness'],
  }),
  item({
    id: 'SP05',
    label: 'REMEMBERED vs RESET',
    question:
      'The user pressed "Reset Guide memory", and the records were deleted from the server. Does the guide behave as though it never knew them?',
    context:
      'episodesBefore and episodesAfter in the capture are counts taken from Statewave itself, not from the browser. Deletion here is the real `DELETE /v1/subjects/{id}`, which is why the Statewave subject is the guide scope and nothing else.',
    left: side('SW02', 'remembered'),
    right: side('SW11', 'after a reset that reached the server'),
    dimensions: ['trustworthiness', 'truthfulness', 'worthTheChange'],
  }),
  item({
    id: 'SP06',
    label: 'RICH REMOTE HISTORY vs WHAT THE EVIDENCE SUPPORTS',
    question:
      'This person has nine invoice-related guide records in a real database. On a screen where nothing establishes the concept, they ask how to open an invoice. Is the answer right?',
    context:
      'The left-hand side is the ordinary answer for a supported question. The right-hand side is the refusal. Remote persistence is not more authoritative than local persistence — this is the same negative Closed Loop #16 established, asked again with a database behind it.',
    left: side('SW02', 'a question the evidence supports'),
    right: side('SW12', 'a question it does not, with a remote history that suggests otherwise'),
    dimensions: ['truthfulness', 'trustworthiness'],
  }),
  item({
    id: 'SP07',
    label: 'REMEMBERED DELETE GUIDE vs CURRENT PERMISSION',
    question:
      'The server remembers this person completing the delete guide. They no longer have the permission. What should they be told?',
    context:
      'What a person may do is a fact about now, and a stored record of having once been shown how is not a grant. Judge whether the screen makes the current state clear.',
    left: side('SW02', 'a feature the user may use'),
    right: side('SW13', 'a feature they may not, with history saying they once did'),
    dimensions: ['truthfulness', 'trustworthiness', 'restraint'],
  }),
];

const package_ = {
  experiment: 'statewave-persistence-review-v1',
  version: 1,
  reviewerType: 'non_human_independent',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  status: 'UNSCORED',
  question:
    'Does structured guidance experience, persisted in a real Statewave, make a returning user better off — without the persistence becoming authority?',
  derivedFrom: {
    file: path.relative(ROOT, RECORD),
    sha256: `sha256:${sha(RECORD)}`,
    statewave: record.metrics?.statewaveBaseUrl ?? null,
    harness: record.harness ?? null,
  },
  instructions: [
    'Every score is null and stays null until an independent reviewer fills it in. Nothing here has been scored by the author.',
    'Judge the screens, not the architecture. Each item names its two captures; the screenshots are in this directory.',
    'NEITHER is a permitted preference on every item, and so is preferring the left-hand side.',
    'Each item carries a `measurements` object, one level away from the questions. It is there so you do not have to take a claim on trust, and it is deliberately not a sibling of the score boxes: `purposeAndConditionIdentical: true` is a fact about two strings, not an answer to whether the screen is truthful.',
    '`browserStorageKeysEitherSide` is the number of guide keys either page kept in the browser. Zero is the claim of this loop: the continuity you are judging came from a server, not from the machine.',
    'Some dimensions are scored once for the pair (scope PAIR in the rubric) because the question is about the difference rather than about either screen.',
    'SW02 — the returning user — is the left-hand side of almost every pair, because it is what the others are compared against. reusedCaptures lists exactly how often each capture appears; you are looking at that one screen more than once, by design.',
    '`purposeAndConditionIdentical` compares only the purpose sentence and the permission condition — the two things memory must never change. It was called `verifiedTextIdentical`, which promised more than it measured.',
  ],
  rubric: RUBRIC,
  preferenceOptions: ['LEFT', 'RIGHT', 'NEITHER'],
  objectiveMetrics: record.metrics,
  scenarioMatrix: record.scenarios.map((entry) => ({ id: entry.id, label: entry.label })),
  /**
   * Where one capture stands on more than one side.
   *
   * SW02 — the returning user — is the left-hand side of almost every pair,
   * because it is the state each of the others is compared *against*. That is
   * deliberate and it is not obvious: a reviewer scoring seven items is looking
   * at that one screen six times, under six different descriptions. The previous
   * loop's package had the same omission and its audit found it, so it is listed
   * here rather than left to be discovered.
   */
  reusedCaptures: Object.entries(
    items
      .flatMap((entry) => [entry.left, entry.right])
      .reduce(
        (counts, entry) => ({ ...counts, [entry.scenario]: (counts[entry.scenario] ?? 0) + 1 }),
        {},
      ),
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
  if (parsed.reviewerType !== 'non_human_independent')
    failures.push(`reviewerType is ${parsed.reviewerType}`);
  if (parsed.status !== 'UNSCORED') failures.push(`status is ${parsed.status}`);
  for (const entry of parsed.items) {
    for (const [dimension, slots] of Object.entries(entry.scores ?? {})) {
      for (const [which, value] of Object.entries(slots)) {
        if (value !== null) failures.push(`${entry.id}.${dimension}.${which} is scored`);
      }
    }
    if (entry.preferred !== null) failures.push(`${entry.id} states a preference`);
    const built = package_.items.find((candidate) => candidate.id === entry.id);
    if (built === undefined) {
      failures.push(`${entry.id} is not produced by this builder`);
      continue;
    }
    for (const which of ['left', 'right']) {
      if (entry[which]?.userFacingText !== built[which].userFacingText)
        failures.push(`${entry.id}.${which} quotes text the record does not contain`);
      // And the file on disk, not only the record's opinion of it.
      const shot = built[which].screenshot;
      if (typeof shot === 'string') {
        let onDisk;
        try {
          onDisk = `sha256:${sha(path.join(DIR, shot))}`;
        } catch {
          failures.push(`${entry.id}.${which} cites ${shot}, which is not on disk`);
          continue;
        }
        if (onDisk !== built[which].screenshotSha256)
          failures.push(`${entry.id}.${which}: ${shot} on disk does not match the record`);
      }
    }
  }
  if (failures.length > 0) {
    console.error('\nThe review instrument and the evidence disagree.\n');
    for (const failure of failures) console.error(`  x ${failure}`);
    process.exit(1);
  }
  console.log(
    `\nStatewave persistence review package — ${parsed.items.length} paired items, evidence matches.\n`,
  );
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(
  `\nWrote ${path.relative(ROOT, OUT)} — ${items.length} paired items, every score null.\n`,
);
