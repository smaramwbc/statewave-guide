/**
 * The evidence for Closed Loop #20.1, assembled from the code rather than typed.
 *
 * A retention policy is a claim that some records are not worth keeping, and a
 * claim like that ages badly: the planner changes, a field starts being read,
 * and a table written once in a document goes on saying the opposite. So the
 * numbers in the review package are derived on every build — the classification
 * from the real planner, the volume arithmetic from the real filter — and
 * `--check` re-derives them and fails if the artifact and the code have drifted
 * apart.
 *
 * Timings are recorded but deliberately excluded from that comparison. They are
 * a property of the machine that ran them, and a package that failed on a
 * different laptop would train everyone to pass `--force`.
 *
 * Usage:
 *   node scripts/build-retention-review.mjs            write the package
 *   node scripts/build-retention-review.mjs --check     verify it still holds
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'benchmarks', 'remote-memory-retention-review-v1');
const RECORD = path.join(DIR, 'retention-evidence.json');
const CHECK = process.argv.includes('--check');

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);

const APP = 'demo';
const SUBJECT = 'u1';
const VERSION = 'v1';
const FEATURE = 'clients.create';

const event = (kind, index, over = {}) => ({
  eventId: `e${kind}${index}`,
  appId: APP,
  subjectId: SUBJECT,
  kind,
  occurredAt: `2026-08-30T10:00:0${index}Z`,
  applicationVersion: VERSION,
  authority:
    kind === 'EXPLICIT_PREFERENCE_SET' ? 'EXPLICIT_USER_PREFERENCE' : 'OBSERVED_INTERACTION',
  ...(kind === 'EXPLICIT_PREFERENCE_SET' ? {} : { featureId: FEATURE }),
  ...over,
});

// The four shapes the emphasis and collapse rules distinguish. A kind judged
// inert against one shape may only be inert because that shape could not have
// shown it.
const SHAPES = {
  'steps=3 actions=1': {
    featureId: FEATURE,
    answer: { steps: ['a', 'b', 'c'] },
    actions: [{ kind: 'highlight' }],
  },
  'steps=1 actions=1': {
    featureId: FEATURE,
    answer: { steps: ['a'] },
    actions: [{ kind: 'highlight' }],
  },
  'steps=3 actions=0': { featureId: FEATURE, answer: { steps: ['a', 'b', 'c'] }, actions: [] },
  'steps=0 actions=1': {
    featureId: FEATURE,
    answer: { steps: [] },
    actions: [{ kind: 'highlight' }],
  },
};

const variantsFor = (kind) =>
  kind === 'EXPLICIT_PREFERENCE_SET'
    ? [
        ['guidanceDetail', 'CONCISE'],
        ['guidanceDetail', 'FULL'],
        ['assistanceMode', 'SHOW_ME'],
        ['assistanceMode', 'STEP_THROUGH'],
      ].map(([preference, value]) => ({
        label: `${preference}=${value}`,
        events: [event(kind, 0, { metadata: { preference, value } })],
      }))
    : [
        { label: 'x1', events: [event(kind, 0)] },
        { label: 'x3', events: [0, 1, 2].map((i) => event(kind, i)) },
      ];

/** What each kind can change, on its own, across every shape. */
function classification() {
  const rows = [];
  for (const kind of core.GUIDE_MEMORY_EVENT_KINDS) {
    const applied = [];
    for (const variant of variantsFor(kind)) {
      const profile = core.projectMemoryProfile({
        events: variant.events,
        subjectId: SUBJECT,
        appId: APP,
        applicationVersion: VERSION,
      });
      if (profile.interactionPatterns.totalEvents !== variant.events.length) {
        throw new Error(`${kind} ${variant.label}: the fixture was rejected, so it proves nothing`);
      }
      for (const [shape, response] of Object.entries(SHAPES)) {
        for (const record of core.planPresentation({ response, profile, enabled: true })
          .adaptations) {
          if (record.outcome !== 'APPLIED') continue;
          applied.push(`${variant.label} | ${shape} | ${record.dimension}`);
        }
      }
    }
    rows.push({
      kind,
      durability: core.GUIDE_MEMORY_DURABILITY[kind],
      durableRemote: core.isDurableRemoteEvent({ kind }),
      appliedOutcomes: applied.length,
      // The first is enough to show the category is honest; the whole list would
      // be noise in a review package.
      example: applied[0] ?? null,
    });
  }
  return rows;
}

/**
 * Sessions, as the emit sites actually produce them.
 *
 * `GUIDANCE_VIEWED` is emitted by the host once per answered question; the other
 * five come from the panel, one per gesture. No site debounces or dedupes.
 */
const SESSIONS = {
  light: {
    GUIDANCE_VIEWED: 3,
    SHOW_ME_USED: 1,
    STEP_THROUGH_STARTED: 0,
    STEP_THROUGH_COMPLETED: 0,
    FULL_STEPS_EXPANDED: 0,
    EXPLICIT_PREFERENCE_SET: 0,
  },
  typical: {
    GUIDANCE_VIEWED: 6,
    SHOW_ME_USED: 2,
    STEP_THROUGH_STARTED: 1,
    STEP_THROUGH_COMPLETED: 1,
    FULL_STEPS_EXPANDED: 1,
    EXPLICIT_PREFERENCE_SET: 0,
  },
  heavy: {
    GUIDANCE_VIEWED: 15,
    SHOW_ME_USED: 6,
    STEP_THROUGH_STARTED: 4,
    STEP_THROUGH_COMPLETED: 3,
    FULL_STEPS_EXPANDED: 4,
    EXPLICIT_PREFERENCE_SET: 1,
  },
};

const READ_CEILING = 100;

function volume() {
  const rows = [];
  for (const [shape, mix] of Object.entries(SESSIONS)) {
    const before = Object.values(mix).reduce((a, b) => a + b, 0);
    const after = Object.entries(mix)
      .filter(([kind]) => core.isDurableRemoteEvent({ kind }))
      .reduce((a, [, n]) => a + n, 0);
    rows.push({
      shape,
      writtenBefore: before,
      writtenAfter: after,
      reductionPercent: before === 0 ? 0 : Math.round((1 - after / before) * 100),
      sessionsToCeilingBefore: Math.ceil(READ_CEILING / before),
      sessionsToCeilingAfter: after === 0 ? null : Math.ceil(READ_CEILING / after),
    });
  }
  return rows;
}

function timings() {
  const mix = [
    ...Array(15).fill('GUIDANCE_VIEWED'),
    ...Array(6).fill('SHOW_ME_USED'),
    ...Array(4).fill('STEP_THROUGH_STARTED'),
    ...Array(3).fill('STEP_THROUGH_COMPLETED'),
    ...Array(4).fill('FULL_STEPS_EXPANDED'),
  ];
  const features = Array.from({ length: 21 }, (_, i) => `feature.itemx${i}`);
  const rows = [];
  for (const n of [10, 100, 500, 1000]) {
    // `INSTANCE_SHAPED` rejects ids like `ev-100`, so the suffix keeps every id
    // out of that shape. A benchmark over rejected events measures nothing.
    const events = Array.from({ length: n }, (_, i) => ({
      eventId: `e${i}x`,
      appId: APP,
      subjectId: SUBJECT,
      featureId: features[i % features.length],
      kind: mix[i % mix.length],
      occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i % 60)).toISOString(),
      applicationVersion: VERSION,
      authority: 'OBSERVED_INTERACTION',
    }));
    const project = () =>
      core.projectMemoryProfile({
        events,
        subjectId: SUBJECT,
        appId: APP,
        applicationVersion: VERSION,
      });
    const profile = project();
    if (profile.interactionPatterns.totalEvents !== n) {
      throw new Error(`${n} events in, ${profile.interactionPatterns.totalEvents} counted`);
    }
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const time = (fn) => {
      for (let i = 0; i < 20; i += 1) fn();
      const s = [];
      for (let i = 0; i < 200; i += 1) {
        const t0 = process.hrtime.bigint();
        fn();
        s.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      return Number(median(s).toFixed(4));
    };
    rows.push({
      events: n,
      projectMs: time(project),
      planMs: time(() =>
        core.planPresentation({ response: SHAPES['steps=3 actions=1'], profile, enabled: true }),
      ),
      profileBytes: JSON.stringify(profile).length,
    });
  }
  return rows;
}

const derived = {
  readCeiling: READ_CEILING,
  durableKinds: [...core.DURABLE_REMOTE_EVENT_KINDS],
  classification: classification(),
  volume: volume(),
};

if (CHECK) {
  if (!existsSync(RECORD)) {
    console.error('\nThe retention review has not been built. Run this script without --check.\n');
    process.exit(1);
  }
  const stored = JSON.parse(readFileSync(RECORD, 'utf8'));
  const drift = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(stored.derived?.durableKinds, derived.durableKinds)) drift.push('the durable kinds');
  if (!same(stored.derived?.classification, derived.classification))
    drift.push('the classification, re-derived from the planner');
  if (!same(stored.derived?.volume, derived.volume)) drift.push('the write-volume arithmetic');
  if (stored.derived?.readCeiling !== derived.readCeiling) drift.push('the read ceiling');

  console.log('\nRetention review — check\n');
  if (drift.length > 0) {
    for (const item of drift) console.log(`    x ${item} no longer matches the code`);
    console.log(
      '\nFAIL — the artifact and the system disagree. Rebuild it, and say why it moved.\n',
    );
    process.exit(1);
  }
  console.log('  · the classification still matches what the planner does');
  console.log('  · the volume arithmetic still matches what the filter keeps');
  console.log('\nPASS — the recorded evidence is still true of the code.\n');
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
writeFileSync(
  RECORD,
  `${JSON.stringify(
    {
      loop: 'closed-loop-20-1-remote-memory-retention',
      rule: 'No future presentation effect, no durable guide memory.',
      derived,
      // Recorded for the reader, excluded from --check: these are a property of
      // the machine, and an artifact that failed on a different laptop would
      // teach everybody to ignore it.
      timings: { note: 'machine-dependent; not compared by --check', rows: timings() },
    },
    null,
    2,
  )}\n`,
);
console.log(`\nWrote ${path.relative(ROOT, RECORD)}\n`);
