/**
 * A profile is arithmetic, and arithmetic does not care what order it is given.
 *
 * Closed Loop #19 said the projection was deterministic and pinned the part that
 * is easy to pin: no clock is read. An audit of #20 pointed out that the other
 * half was never tested — remote events can arrive out of order, duplicated or
 * late, and "deterministic" has to mean *order-independent* before that is safe
 * to say. A local store returns what it was given in the order it was given;
 * `GET /v1/timeline` returns what a database felt like returning.
 */

import { describe, expect, it } from 'vitest';
import { hasCompletedGuide, planPresentation, projectMemoryProfile } from '../src/index.js';
import type { GuideMemoryEvent, GuideQueryResponse } from '../src/index.js';

const APP = 'demo';
const SUBJECT = 'u1';
const VERSION = 'build-1';

const event = (over: Partial<GuideMemoryEvent> & { eventId: string }): GuideMemoryEvent =>
  ({
    appId: APP,
    subjectId: SUBJECT,
    featureId: 'clients.create',
    kind: 'GUIDANCE_VIEWED',
    occurredAt: '2026-08-29T10:00:00Z',
    applicationVersion: VERSION,
    authority: 'OBSERVED_INTERACTION',
    ...over,
  }) as GuideMemoryEvent;

const HISTORY: readonly GuideMemoryEvent[] = [
  event({ eventId: 'ev-a-1', kind: 'GUIDANCE_VIEWED' }),
  event({ eventId: 'ev-a-2', kind: 'SHOW_ME_USED' }),
  event({ eventId: 'ev-a-3', kind: 'SHOW_ME_USED' }),
  event({ eventId: 'ev-a-4', kind: 'STEP_THROUGH_STARTED' }),
  event({ eventId: 'ev-a-5', kind: 'STEP_THROUGH_COMPLETED' }),
  event({ eventId: 'ev-a-6', kind: 'FULL_STEPS_EXPANDED' }),
  event({
    eventId: 'ev-a-7',
    kind: 'EXPLICIT_PREFERENCE_SET',
    authority: 'EXPLICIT_USER_PREFERENCE',
    metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
  } as Partial<GuideMemoryEvent> & { eventId: string }),
  // A second setting of the SAME preference, later in time.
  //
  // The fixture held exactly one preference event, which meant the only
  // order-sensitive branch in the projection was never permuted: counters
  // commute, so forty shuffles of six counter events prove nothing about the
  // one place order mattered. It did matter — the winner used to be whichever
  // record came last in the array, so a remote read could resolve the same two
  // records to CONCISE one time and FULL the next.
  event({
    eventId: 'ev-a-8',
    kind: 'EXPLICIT_PREFERENCE_SET',
    authority: 'EXPLICIT_USER_PREFERENCE',
    occurredAt: '2026-08-30T10:00:00Z',
    metadata: { preference: 'guidanceDetail', value: 'FULL' },
  } as Partial<GuideMemoryEvent> & { eventId: string }),
];

const profileOf = (events: readonly GuideMemoryEvent[]) =>
  projectMemoryProfile({ events, subjectId: SUBJECT, appId: APP, applicationVersion: VERSION });

/** Deterministic shuffles, so a failure is reproducible rather than occasional. */
function permutations<T>(items: readonly T[], count: number): T[][] {
  const out: T[][] = [];
  for (let seed = 1; seed <= count; seed += 1) {
    const copy = [...items];
    // A fixed linear congruential walk. No `Math.random` — a test that fails one
    // run in twenty is a test nobody believes.
    let state = seed * 2654435761;
    for (let index = copy.length - 1; index > 0; index -= 1) {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      const target = state % (index + 1);
      [copy[index], copy[target]] = [copy[target]!, copy[index]!];
    }
    out.push(copy);
  }
  return out;
}

describe('the order events arrive in does not change what is remembered', () => {
  const baseline = profileOf(HISTORY);

  it('produces the same profile for every ordering', () => {
    for (const shuffled of permutations(HISTORY, 40)) {
      expect(profileOf(shuffled)).toEqual(baseline);
    }
  });

  it('produces the same profile when events are reversed', () => {
    expect(profileOf([...HISTORY].reverse())).toEqual(baseline);
  });

  it('produces the same plan for every ordering', () => {
    const response = {
      contractVersion: 1,
      status: 'ANSWERED',
      intent: 'HOW_TO',
      featureId: 'clients.create',
      answer: {
        title: 'New client',
        steps: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
        conditions: [],
        questions: [],
      },
      actions: [{ kind: 'highlight', semanticId: 'clients.create' }],
      pruned: [],
    } as unknown as GuideQueryResponse;
    const expected = JSON.stringify(
      planPresentation({ response, profile: baseline, enabled: true }),
    );
    for (const shuffled of permutations(HISTORY, 20)) {
      expect(
        JSON.stringify(planPresentation({ response, profile: profileOf(shuffled), enabled: true })),
      ).toBe(expected);
    }
  });
});

describe('a duplicate does not become a second thing that happened', () => {
  it('counts a repeated delivery of one event once', () => {
    // Statewave deduplicates by idempotency key, so this is belt and braces —
    // but a retry that reached a *different* replica, or a store that is not
    // Statewave, would deliver the same event twice and the profile must not
    // start believing somebody pressed Show me four times.
    const doubled = [...HISTORY, ...HISTORY];
    const once = profileOf(HISTORY);
    const twice = profileOf(doubled);
    expect(twice.interactionPatterns.showMeUses).toBe(once.interactionPatterns.showMeUses);
    expect(twice.featureHistory).toEqual(once.featureHistory);
  });

  it('still knows the guide was completed exactly once', () => {
    const doubled = [...HISTORY, ...HISTORY, ...HISTORY];
    expect(hasCompletedGuide(profileOf(doubled), 'clients.create')).toBe(true);
    expect(profileOf(doubled).featureHistory[0]?.stepThroughCompletions).toBe(1);
  });
});

describe('a preference belongs to when it was set, not to when it arrived', () => {
  it('resolves to the later setting whichever way round the store returns them', () => {
    const earlier = event({
      eventId: 'ev-p-early',
      kind: 'EXPLICIT_PREFERENCE_SET',
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: '2026-01-01T10:00:00Z',
      metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
    } as Partial<GuideMemoryEvent> & { eventId: string });
    const later = event({
      eventId: 'ev-p-late',
      kind: 'EXPLICIT_PREFERENCE_SET',
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: '2026-01-02T10:00:00Z',
      metadata: { preference: 'guidanceDetail', value: 'FULL' },
    } as Partial<GuideMemoryEvent> & { eventId: string });

    expect(profileOf([earlier, later]).explicitPreferences.guidanceDetail).toBe('FULL');
    expect(profileOf([later, earlier]).explicitPreferences.guidanceDetail).toBe('FULL');
  });

  it('keeps the two preferences independent of each other', () => {
    const detail = event({
      eventId: 'ev-p-d',
      kind: 'EXPLICIT_PREFERENCE_SET',
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: '2026-01-03T10:00:00Z',
      metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
    } as Partial<GuideMemoryEvent> & { eventId: string });
    const mode = event({
      eventId: 'ev-p-m',
      kind: 'EXPLICIT_PREFERENCE_SET',
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: '2026-01-01T10:00:00Z',
      metadata: { preference: 'assistanceMode', value: 'STEP_THROUGH' },
    } as Partial<GuideMemoryEvent> & { eventId: string });

    // A newer `guidanceDetail` must not evict an older `assistanceMode`: they are
    // separate answers to separate questions, not one slot.
    const profile = profileOf([mode, detail]);
    expect(profile.explicitPreferences.guidanceDetail).toBe('CONCISE');
    expect(profile.explicitPreferences.assistanceMode).toBe('STEP_THROUGH');
  });

  it('breaks a same-instant tie by event id rather than by arrival', () => {
    // Two settings can share a timestamp — the field is second-resolution and a
    // host may stamp a batch. Whatever the answer is, it has to be the same
    // answer every time, so the tie-break is a property of the records.
    const a = event({
      eventId: 'ev-p-aaa',
      kind: 'EXPLICIT_PREFERENCE_SET',
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: '2026-01-01T10:00:00Z',
      metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
    } as Partial<GuideMemoryEvent> & { eventId: string });
    const b = event({
      eventId: 'ev-p-bbb',
      kind: 'EXPLICIT_PREFERENCE_SET',
      authority: 'EXPLICIT_USER_PREFERENCE',
      occurredAt: '2026-01-01T10:00:00Z',
      metadata: { preference: 'guidanceDetail', value: 'FULL' },
    } as Partial<GuideMemoryEvent> & { eventId: string });

    expect(profileOf([a, b]).explicitPreferences.guidanceDetail).toBe('FULL');
    expect(profileOf([b, a]).explicitPreferences.guidanceDetail).toBe('FULL');
  });
});
