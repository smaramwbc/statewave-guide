/**
 * The reviewer's copy of the memory UX resolution.
 *
 * Closed Loop #19 asked whether memory could adapt guidance without becoming
 * product truth. It could. An independent review then answered a different
 * question — whether the adaptations were worth having — and found two of the
 * three were not: a completion sentence that announced the mechanism, and an
 * inferred Show me preference that changed nothing anybody could see.
 *
 * This package is the evidence for the fix, and it is built to be argued with.
 * Every score is null. Every pairing comes from one build. The one pairing whose
 * two sides are pixel-identical says so in its own item, because a reviewer who
 * discovers that for themselves has been misled up to the moment they do.
 *
 * Usage:
 *   node scripts/build-memory-ux-review.mjs [--check]
 *
 * @packageDocumentation
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'memory-ux-resolution-review-v1');
const RECORD = path.join(DIR, 'memory-ux-evidence.json');
const OUT = path.join(DIR, 'memory-ux-resolution-review-v1.package.json');
const CHECK = process.argv.includes('--check');

const record = JSON.parse(readFileSync(RECORD, 'utf8'));
const sha = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const capture = (name) => record.captures[name];
const problems = [];

/**
 * Some questions are about a side; some are about the difference.
 *
 * An audit pointed out that scoring "is this difference worth making" once per
 * side asks a reviewer to answer a question that has no per-side answer — and
 * that UX05, whose left side is a quotation rather than a screen, was being
 * given score boxes for a screen nobody can look at. `scope` says which shape a
 * dimension has, and the score slots are built to match.
 */
const RUBRIC = {
  worthTheChange: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    scope: 'PAIR',
    asks: 'Is the difference between these two screens worth making at all?',
  },
  naturalness: {
    min: 0,
    max: 3,
    higherIsBetter: true,
    scope: 'PER_SIDE',
    asks: 'Does it read like a product that knows you, or one telling you it knows you?',
  },
  reversibility: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    scope: 'PAIR',
    asks: 'If the shorter version is not what you wanted, is getting the rest obvious and cheap?',
  },
  predictability: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    scope: 'PAIR',
    asks: 'Could you tell why it changed, and would you expect the same next time?',
  },
  restraint: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    scope: 'PER_SIDE',
    asks: 'Does it say as little as it can get away with, rather than as much as it knows?',
  },
  truthfulness: {
    min: 0,
    max: 2,
    higherIsBetter: true,
    scope: 'PER_SIDE',
    asks: 'Is everything on the screen true of the screen the user is looking at?',
  },
};

/** One side of a pair, quoted from the capture rather than described. */
function side(name, note) {
  const source = capture(name);
  if (source === undefined) {
    problems.push(`${name} is not in the record`);
    return { capture: name };
  }
  return {
    capture: name,
    note,
    screenshot: source.screenshot,
    screenshotSha256: source.screenshotSha256,
    title: source.title,
    purpose: source.purpose,
    condition: source.condition,
    location: source.location,
    stepsVisible: source.stepsVisible,
    stepsShown: source.steps.length,
    expandControl: source.expandControl,
    memoryLines: source.memoryLines,
    // `memoryMarked` is kept. It was dropped, and it is the only recorded
    // difference between UX03's two sides — an item asking whether an adaptation
    // should exist was hiding that the adaptation emits anything at all.
    actions: source.actions.map((action) => ({
      label: action.label,
      primary: action.primary,
      memoryMarked: action.memoryMarked === true,
    })),
    userFacingText: source.answerText,
  };
}

/**
 * A paired item.
 *
 * `identical` is computed, not asserted: two sides with the same screenshot hash
 * are the same picture, and saying so in the item is the difference between an
 * honest null result and a reviewer being invited to imagine a difference.
 */
function item({ id, label, question, context, left, right, dimensions, notComparableBecause }) {
  const both = [left, right].map((entry) => entry.screenshotSha256);
  const comparable = notComparableBecause === undefined;
  const identical = comparable && both[0] !== undefined && both[0] === both[1];
  // Score slots follow the dimension's scope. "Is this difference worth making"
  // has no per-side answer, and UX05's left side is a quotation rather than a
  // screen — giving either of them two boxes asks for judgements that cannot be
  // made, which is how a rubric collects noise.
  const scores = Object.fromEntries(
    dimensions.map((key) => [
      key,
      RUBRIC[key].scope === 'PAIR'
        ? { pair: null }
        : comparable
          ? { left: null, right: null }
          : { right: null },
    ]),
  );
  return {
    id,
    label,
    question,
    context,
    left,
    right,
    // Engineering facts, kept beside the item rather than inside a scored field.
    // Null where the two sides are not the same kind of thing, because "false"
    // there would read as a difference somebody found.
    ...(comparable ? {} : { notComparable: notComparableBecause }),
    identicalScreenshots: comparable ? identical : null,
    verifiedTextIdentical: comparable
      ? left.purpose === right.purpose && left.condition === right.condition
      : null,
    actionLabelsIdentical: comparable
      ? JSON.stringify((left.actions ?? []).map((a) => a.label)) ===
        JSON.stringify((right.actions ?? []).map((a) => a.label))
      : null,
    primaryActionIdentical: comparable
      ? JSON.stringify((left.actions ?? []).map((a) => [a.label, a.primary])) ===
        JSON.stringify((right.actions ?? []).map((a) => [a.label, a.primary]))
      : null,
    dimensions,
    scores,
    preferred: null,
    freeText: null,
  };
}

const items = [
  item({
    id: 'UX01',
    label: 'FIRST_TIME vs RETURNING_COLLAPSED',
    question:
      'A person asks the same question twice, weeks apart, having finished the guide the first time. Is the second answer better for them?',
    context:
      'Same build, same question, same verified content. What differs is whether the three steps start on screen or behind a control. Read verifiedTextIdentical beside the item rather than taking that on trust.',
    left: side('UX01-first-time', 'never seen this guide'),
    right: side('UX02-returning-collapsed', 'finished this guide once before'),
    dimensions: ['worthTheChange', 'naturalness', 'reversibility', 'predictability', 'restraint'],
  }),
  item({
    id: 'UX02',
    label: 'RETURNING_COLLAPSED vs RETURNING_EXPANDED',
    question:
      'The returning user wants the steps after all and presses the control. Is getting back to them cheap enough to justify folding them?',
    context:
      'One click apart, same session. The question is about the cost of being wrong: if folding is a mistake for this person, how much does the mistake cost them?',
    left: side('UX02-returning-collapsed', 'as the answer arrived'),
    right: side('UX02-returning-expanded', 'after pressing the control'),
    dimensions: ['reversibility', 'worthTheChange', 'predictability'],
  }),
  item({
    id: 'UX03',
    label: 'BASE vs DERIVED_SHOW_ME_PATTERN',
    question:
      'The guide has watched this person press Show me three times and has decided to emphasise it. Look at both screens. Should this adaptation exist?',
    context:
      'These two screens are the same picture — identicalScreenshots beside the item says whether they are byte-identical. Show me is already the primary action on any answer with more than one step, so the inference asks for what the interface was doing anyway. The right-hand button does carry one machine-readable marker recording that memory chose it (`memoryMarked` in the actions below); it has no styling, so it changes nothing on screen. An earlier round drew a ring there to make the change visible; this loop removed the ring and reports ALREADY_SATISFIED instead. Whether that is honesty or a feature that should not exist is the question.',
    left: side('UX03-base', 'no pattern observed'),
    right: side('UX03-derived-show-me', 'three Show me presses observed'),
    dimensions: ['worthTheChange', 'naturalness', 'truthfulness', 'restraint'],
  }),
  item({
    id: 'UX04',
    label: 'BASE_FULL vs EXPLICIT_FULL',
    question:
      'This person finished the guide, and then explicitly asked for full detail. Does the explicit request read as having been honoured?',
    context:
      'The completion alone would have folded the steps; the stated preference overrules it, so the fold is refused and both screens show the full answer. identicalScreenshots beside the item is the exact-hash comparison and may say false over an antialiased pixel — reusedCaptures says which files are literally the same. A preference that produces no visible difference is either reassuring or invisible, and which one it is is the question.',
    left: side('UX04-base-full', 'no memory'),
    right: side('UX04-explicit-full', 'completed the guide, then asked for full detail'),
    dimensions: ['worthTheChange', 'predictability', 'truthfulness', 'restraint'],
  }),
  item({
    id: 'UX05',
    label: 'CREATE_CLIENT_CONTEXT_BEFORE vs AFTER',
    question:
      'Where does the guide say the New client button is? Is the sentence true of the screen in front of the user?',
    context:
      'The button sits in a toolbar above the client table. The left-hand sentence is quoted from the frozen Closed Loop #19 capture — it is not re-photographed, because reproducing it would mean shipping it again — and the right-hand one is from this build. A page section really did contain the button, in the document and in the coordinates; the word that was wrong is "list".',
    // One side of this pair is a quotation, not a photograph, so the
    // side-by-side engineering flags below do not mean anything for it and are
    // reported as null rather than as a difference.
    notComparableBecause: 'the left-hand side is quoted from a frozen record, not captured',
    left: {
      capture: 'historical',
      note: 'Closed Loop #19, quoted from frozen evidence',
      source: record.historical.source,
      sourceSha256: record.historical.sha256,
      location: record.historical.sentence,
      screenshot: null,
      screenshotSha256: null,
      actions: [],
    },
    right: side('UX05-context-after', 'this build'),
    dimensions: ['truthfulness', 'worthTheChange', 'naturalness'],
  }),
  item({
    id: 'UX06',
    label: 'MEMORY_ON vs MEMORY_OFF',
    question:
      'One of these guides remembers this person and one has no memory at all. Is the remembering one better to use?',
    context:
      'The blunt version of the whole loop. Memory-off is this same build with memory switched off, not a different release. These are the same two states as UX01 reached by a different route — a memory-less guide and one that remembers a completed guide — so a reviewer who scored UX01 is looking at the same pair of screens again, deliberately, with the question asked about the feature rather than about the visit.',
    // Unadapted on the left, as in every other item. It was the other way round,
    // which meant LEFT meant "adapted" here and "unadapted" everywhere else — and
    // an audit noticed this pair is UX01's two screens with the sides swapped.
    left: side('UX06-memory-off', 'no memory at all'),
    right: side('UX06-memory-on', 'remembers a completed guide'),
    dimensions: ['worthTheChange', 'naturalness', 'restraint', 'truthfulness'],
  }),
];

/** What the search field says, which this loop was required not to disturb. */
const searchCapture = capture('UX05-search-after');

const package_ = {
  experiment: 'memory-ux-resolution-review-v1',
  version: 1,
  reviewerType: 'non_human_independent',
  formalHumanValidation: 'DEFERRED_UNTIL_PRE_RELEASE',
  status: 'UNSCORED',
  question:
    'After Closed Loop #19.1, do the surviving memory adaptations produce real user-visible value — and is the one that produces none honest about it?',
  derivedFrom: {
    file: path.relative(ROOT, RECORD),
    sha256: `sha256:${sha(RECORD)}`,
  },
  instructions: [
    'Every score is null and stays null until an independent reviewer fills it in. Nothing here has been scored by the author.',
    'Judge the screens, not the intent. Each item names its two captures; the screenshots are in this directory.',
    'A pair whose sides are identical is not a failure of the capture. UX03 is expected to be identical, and whether an adaptation that changes nothing should exist at all is a real question with a real answer either way.',
    'NEITHER is a permitted preference on every item. So is preferring the left-hand, unadapted side.',
    'The engineering facts beside each item (identicalScreenshots, verifiedTextIdentical, actionLabelsIdentical, primaryActionIdentical) are stated so you do not have to take a claim on trust. They are not answers to the scored questions.',
    'Identity is by exact hash. Two screens that look the same to you may hash differently over a single antialiased pixel, so identicalScreenshots: false is not a claim that you will see a difference — reusedCaptures below lists which captures are literally the same file.',
    'Some dimensions are scored once for the pair (scope PAIR in the rubric) because the question is about the difference rather than about either screen. UX05 has score slots on the right only: its left side is a quotation from a frozen record, not a screen.',
  ],
  rubric: RUBRIC,
  preferenceOptions: ['LEFT', 'RIGHT', 'NEITHER'],
  objectiveMetrics: {
    captures: record.metrics.captures,
    pageErrors: record.metrics.pageErrors,
    distinctScreenshots: record.metrics.distinctScreenshots,
    memoryLinesRendered: record.metrics.memoryLinesRendered,
    identicalGroups: record.identicalGroups ?? [],
    searchFieldSentence: searchCapture?.location ?? null,
  },
  /**
   * Where one capture stands on more than one side.
   *
   * UX06 is UX01's two screens reached by a different route, and several
   * captures are literally the same file. Reusing a capture is not wrong;
   * letting somebody believe they are looking at six independent comparisons is.
   */
  reusedCaptures: Object.entries(
    items
      .flatMap((entry) => [entry.left, entry.right])
      .filter((entry) => typeof entry.screenshot === 'string')
      .reduce(
        (counts, entry) => ({
          ...counts,
          [entry.screenshotSha256]: [...(counts[entry.screenshotSha256] ?? []), entry.capture],
        }),
        {},
      ),
  )
    .filter(([, names]) => names.length > 1)
    .map(([hash, appearances]) => ({ image: hash.slice(0, 19), appearances })),
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
    for (const [dimension, pair] of Object.entries(entry.scores ?? {})) {
      for (const [which, value] of Object.entries(pair)) {
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
      if (entry[which]?.screenshotSha256 !== built[which].screenshotSha256)
        failures.push(`${entry.id}.${which} cites a screenshot that has changed`);
      // And the file on disk, not only the record's opinion of it. The first
      // version compared the package to the evidence and never opened a PNG, so
      // a replaced screenshot would have passed.
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
    if (entry.identicalScreenshots !== built.identicalScreenshots)
      failures.push(`${entry.id} disagrees with the record about whether its sides are identical`);
    for (const flag of ['verifiedTextIdentical', 'actionLabelsIdentical', 'primaryActionIdentical'])
      if (entry[flag] !== built[flag])
        failures.push(`${entry.id}.${flag} disagrees with the record`);
  }
  if (failures.length > 0) {
    console.error('\nThe review instrument and the evidence disagree.\n');
    for (const failure of failures) console.error(`  x ${failure}`);
    process.exit(1);
  }
  console.log(
    `\nMemory UX review package — ${parsed.items.length} paired items, evidence matches.\n`,
  );
  process.exit(0);
}

writeFileSync(OUT, serialised);
console.log(
  `\nWrote ${path.relative(ROOT, OUT)} — ${items.length} paired items, every score null.\n`,
);
