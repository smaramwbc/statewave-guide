/**
 * Which records earn a durable life, decided by the planner rather than by us.
 *
 * `GUIDE_MEMORY_DURABILITY` says `GUIDANCE_VIEWED` changes nothing a person
 * sees. That is a claim about the planner, and a claim about the planner should
 * be re-derived from the planner, not maintained by hand next to it. So this
 * gate writes each kind on its own, projects a profile, plans a presentation
 * across every response shape the emphasis rules distinguish, and checks the
 * table against what actually came back.
 *
 * The failure it exists to catch is not somebody editing the table. It is
 * somebody making `views` matter — adding a branch that reads it — and leaving
 * a table behind that now says the highest-volume record in the system is safe
 * to drop. That would be a silent, permanent loss of the thing the new branch
 * depends on.
 *
 * Aspects:
 *
 *   classification  the table matches what the planner does with each kind
 *   effect          every DURABLE_REMOTE kind really does change a presentation
 *   coverage        every kind in the closed taxonomy is classified, exactly once
 *   volume          the durable set is the bounded one, and the dropped set is not
 *
 * @packageDocumentation
 */

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const aspectIndex = process.argv.indexOf('--aspect');
const ASPECT = aspectIndex === -1 ? 'all' : (process.argv[aspectIndex + 1] ?? 'all');
const runs = (aspect) => ASPECT === 'all' || ASPECT === aspect;

const failures = [];
const notes = [];

const core = await import(pathToFileURL(path.join(ROOT, 'packages/core/dist/index.js')).href);

const APP = 'demo';
const SUBJECT = 'u1';
const VERSION = 'v1';
const FEATURE = 'clients.create';

const event = (kind, index, overrides = {}) => ({
  eventId: `e${kind}${index}`,
  appId: APP,
  subjectId: SUBJECT,
  kind,
  occurredAt: `2026-08-29T10:00:0${index}Z`,
  applicationVersion: VERSION,
  authority:
    kind === 'EXPLICIT_PREFERENCE_SET' ? 'EXPLICIT_USER_PREFERENCE' : 'OBSERVED_INTERACTION',
  ...(kind === 'EXPLICIT_PREFERENCE_SET' ? {} : { featureId: FEATURE }),
  ...overrides,
});

// The four shapes the emphasis and collapse rules actually distinguish. Fewer
// than this and a kind can look inert only because the one shape tried could
// not have shown it.
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
  'steps=3 actions=0': {
    featureId: FEATURE,
    answer: { steps: ['a', 'b', 'c'] },
    actions: [],
  },
  'steps=0 actions=1': {
    featureId: FEATURE,
    answer: { steps: [] },
    actions: [{ kind: 'highlight' }],
  },
};

// Enough of each kind to cross PATTERN_THRESHOLD, plus every preference the
// closed vocabulary allows. A kind judged inert on one event when three would
// have moved something is a false negative.
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

/** Every APPLIED adaptation this kind can produce, on its own. */
function appliedFor(kind) {
  const applied = [];
  for (const variant of variantsFor(kind)) {
    const profile = core.projectMemoryProfile({
      events: variant.events,
      subjectId: SUBJECT,
      appId: APP,
      applicationVersion: VERSION,
    });
    // A kind whose events never reached the profile proves nothing about the
    // planner — it proves the fixture was rejected.
    if (profile.interactionPatterns.totalEvents !== variant.events.length) {
      failures.push(
        `${kind} ${variant.label}: ${variant.events.length} events in, ` +
          `${profile.interactionPatterns.totalEvents} counted — the fixture was rejected`,
      );
      continue;
    }
    for (const [shape, response] of Object.entries(SHAPES)) {
      const plan = core.planPresentation({ response, profile, enabled: true });
      for (const record of plan.adaptations) {
        if (record.outcome !== 'APPLIED') continue;
        applied.push(
          `${variant.label} | ${shape} | ${record.dimension}: ${record.base} -> ${record.result}`,
        );
      }
    }
  }
  return applied;
}

const observed = new Map();
for (const kind of core.GUIDE_MEMORY_EVENT_KINDS) observed.set(kind, appliedFor(kind));

// ---------------------------------------------------------------------------

if (runs('coverage')) {
  const classified = Object.keys(core.GUIDE_MEMORY_DURABILITY);
  for (const kind of core.GUIDE_MEMORY_EVENT_KINDS) {
    if (!classified.includes(kind))
      failures.push(`${kind} is in the taxonomy but has no durability`);
  }
  for (const kind of classified) {
    if (!core.GUIDE_MEMORY_EVENT_KINDS.includes(kind))
      failures.push(`${kind} has a durability but is not a memory event kind`);
  }
  const allowed = ['DURABLE_REMOTE', 'SESSION_ONLY', 'DERIVED_ONLY', 'NOT_USEFUL'];
  for (const [kind, durability] of Object.entries(core.GUIDE_MEMORY_DURABILITY)) {
    if (!allowed.includes(durability))
      failures.push(`${kind} has an unknown durability ${durability}`);
  }
  notes.push(`all ${classified.length} event kinds are classified, in a closed vocabulary`);
}

if (runs('classification')) {
  // Every category, checked in the direction that can catch it being wrong.
  //
  // The DERIVED_ONLY row is the one worth explaining. Those kinds are dropped
  // from durable storage even though they DO change a presentation — that is a
  // cost decision, not the exclusion rule. So the check runs the other way: it
  // fails if such a kind ever becomes inert. The day that happens the honest
  // classification is NOT_USEFUL, and leaving it as DERIVED_ONLY would keep a
  // documented sacrifice that nobody is making any more.
  for (const [kind, applied] of observed) {
    const durability = core.GUIDE_MEMORY_DURABILITY[kind];
    if (durability === 'NOT_USEFUL' && applied.length > 0) {
      failures.push(`${kind} is classified NOT_USEFUL but changed a presentation: ${applied[0]}`);
    }
    if (durability === 'DURABLE_REMOTE' && applied.length === 0) {
      failures.push(`${kind} is persisted durably but changed nothing in any response shape`);
    }
    if (durability === 'DERIVED_ONLY' && applied.length === 0) {
      failures.push(
        `${kind} is classified DERIVED_ONLY — dropped at a stated cost — but changes nothing, ` +
          'so the cost is imaginary and the honest classification is NOT_USEFUL',
      );
    }
    if (durability === 'SESSION_ONLY' && applied.length === 0) {
      failures.push(`${kind} is classified SESSION_ONLY but changes nothing even in session`);
    }
  }
  const inert = [...observed].filter(([, a]) => a.length === 0).map(([k]) => k);
  notes.push(`inert on every response shape: ${inert.join(', ') || 'none'}`);
}

if (runs('effect')) {
  // No future presentation effect, no durable guide memory — the exclusion rule
  // itself, stated as a check rather than a sentence in a doc.
  for (const kind of core.DURABLE_REMOTE_EVENT_KINDS) {
    const applied = observed.get(kind) ?? [];
    if (applied.length === 0) failures.push(`${kind} is durable and demonstrably inert`);
    if (!core.isDurableRemoteEvent({ kind }))
      failures.push(`${kind} is listed durable but the filter drops it`);
  }
  for (const kind of core.GUIDE_MEMORY_EVENT_KINDS) {
    const durable = core.DURABLE_REMOTE_EVENT_KINDS.includes(kind);
    if (core.isDurableRemoteEvent({ kind }) !== durable)
      failures.push(`${kind}: the filter and the durable list disagree`);
  }
  notes.push(
    `durable kinds and their effect: ${core.DURABLE_REMOTE_EVENT_KINDS.map(
      (k) => `${k} (${(observed.get(k) ?? []).length} applied outcomes)`,
    ).join(', ')}`,
  );
}

if (runs('volume')) {
  // The point of the policy is volume, so the gate should be able to see volume.
  // One session of a plausible shape, counted by what the policy would keep.
  const session = [
    ...Array.from({ length: 13 }, (_, i) => event('GUIDANCE_VIEWED', i, { featureId: `f${i}` })),
    ...Array.from({ length: 4 }, (_, i) => event('SHOW_ME_USED', i, { featureId: `f${i}` })),
    ...Array.from({ length: 2 }, (_, i) =>
      event('STEP_THROUGH_STARTED', i, { featureId: `f${i}` }),
    ),
    ...Array.from({ length: 2 }, (_, i) => event('FULL_STEPS_EXPANDED', i, { featureId: `f${i}` })),
    event('STEP_THROUGH_COMPLETED', 0, { featureId: 'f0' }),
  ];
  const kept = session.filter((e) => core.isDurableRemoteEvent(e));
  if (kept.length >= session.length)
    failures.push('the policy kept everything — it is not a policy');
  const keptKinds = new Set(kept.map((e) => e.kind));
  for (const kind of keptKinds) {
    if (core.GUIDE_MEMORY_DURABILITY[kind] !== 'DURABLE_REMOTE')
      failures.push(`${kind} survived the filter without being DURABLE_REMOTE`);
  }
  notes.push(
    `a ${session.length}-event session writes ${kept.length} durable record(s) ` +
      `— ${Math.round((1 - kept.length / session.length) * 100)}% fewer`,
  );
}

const say = (line = '') => console.log(line);
say(`\nMemory durability — ${ASPECT}\n`);
for (const note of notes) say(`  · ${note}`);
if (failures.length > 0) {
  say('\n  Failures\n');
  for (const failure of failures) say(`    x ${failure}`);
  say('\nFAIL — the durability table and the planner disagree.\n');
  process.exit(1);
}
say('\nPASS — what is kept is what a later answer can use.\n');
