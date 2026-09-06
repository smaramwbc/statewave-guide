/**
 * Naming the state, rather than the moment it was observed.
 *
 * The rule these pin: a completion is monotonic and may be deduplicated at
 * ingest; a preference is a value that changes and may not. Getting that
 * backwards is silent and expensive — deduplicating a preference pins somebody
 * to whatever they chose first, and it looks like a working write.
 */

import { describe, expect, it } from 'vitest';
import { GUIDE_STATE_NAMESPACE, guideStateKey, ingestKeyFor } from '../src/index.js';
import type { GuideMemoryEvent } from '../src/index.js';

const EVENT = (over: Partial<GuideMemoryEvent> = {}): GuideMemoryEvent =>
  ({
    eventId: 'ev-1',
    appId: 'demo',
    subjectId: 'u1',
    featureId: 'clients.create',
    kind: 'STEP_THROUGH_COMPLETED',
    occurredAt: '2026-08-30T10:00:00Z',
    applicationVersion: 'build-1',
    authority: 'OBSERVED_INTERACTION',
    ...over,
  }) as GuideMemoryEvent;

const PREF = (
  value: 'AUTO' | 'CONCISE' | 'FULL' | 'SHOW_ME' | 'STEP_THROUGH',
  over: Partial<GuideMemoryEvent> = {},
): GuideMemoryEvent =>
  EVENT({
    kind: 'EXPLICIT_PREFERENCE_SET',
    featureId: undefined,
    authority: 'EXPLICIT_USER_PREFERENCE',
    metadata: { preference: 'guidanceDetail', value },
    ...over,
  });

describe('a completion names one fact', () => {
  it('is the same key however many times it is observed', () => {
    const first = guideStateKey(EVENT({ eventId: 'ev-1', occurredAt: '2026-01-01T10:00:00Z' }));
    const fiftieth = guideStateKey(EVENT({ eventId: 'ev-50', occurredAt: '2026-06-01T10:00:00Z' }));
    expect(first?.key).toBe(fiftieth?.key);
    expect(first?.dedupeOnWrite).toBe(true);
  });

  it('belongs to the build it happened on', () => {
    // The version rule Closed Loop #19 froze. Without the version in the key,
    // finishing a guide once would mark it finished for every future build of
    // steps that have since changed.
    const a = guideStateKey(EVENT({ applicationVersion: 'build-1' }));
    const b = guideStateKey(EVENT({ applicationVersion: 'build-2' }));
    expect(a?.key).not.toBe(b?.key);
  });

  it('keeps two features, two apps and two workspaces apart', () => {
    const base = guideStateKey(EVENT())?.key;
    expect(guideStateKey(EVENT({ featureId: 'clients.delete' }))?.key).not.toBe(base);
    expect(guideStateKey(EVENT({ appId: 'other' }))?.key).not.toBe(base);
    expect(guideStateKey(EVENT({ workspaceId: 'w1' }))?.key).not.toBe(base);
    // And two different workspaces are not each other.
    expect(guideStateKey(EVENT({ workspaceId: 'w1' }))?.key).not.toBe(
      guideStateKey(EVENT({ workspaceId: 'w2' }))?.key,
    );
  });

  it('has no key without the two things that identify it', () => {
    expect(guideStateKey(EVENT({ featureId: undefined }))).toBeUndefined();
    expect(guideStateKey(EVENT({ applicationVersion: undefined }))).toBeUndefined();
  });
});

describe('a preference names a slot, not a value', () => {
  it('is the same key whatever the value is', () => {
    expect(guideStateKey(PREF('FULL'))?.key).toBe(guideStateKey(PREF('CONCISE'))?.key);
  });

  it('is never deduplicated on write', () => {
    // Measured on a real server: four alternating choices under one ingest key
    // store one episode reading the FIRST value, and the rest are gone. A
    // preference has to be superseded, which is a different mechanism.
    expect(guideStateKey(PREF('FULL'))?.dedupeOnWrite).toBe(false);
    expect(ingestKeyFor(PREF('FULL'))).toBe('ev-1');
  });

  it('is not scoped to a build', () => {
    // Somebody who asked for concise answers in March did not withdraw the
    // request by the product shipping in April.
    expect(guideStateKey(PREF('FULL', { applicationVersion: 'build-1' }))?.key).toBe(
      guideStateKey(PREF('FULL', { applicationVersion: 'build-2' }))?.key,
    );
  });

  it('keeps two preference names apart', () => {
    expect(guideStateKey(PREF('SHOW_ME'))?.key).not.toBe(
      guideStateKey(
        PREF('SHOW_ME', { metadata: { preference: 'assistanceMode', value: 'SHOW_ME' } }),
      )?.key,
    );
  });
});

describe('the ingest key', () => {
  it('collapses a repeated completion and a retry alike', () => {
    const repeat = ingestKeyFor(EVENT({ eventId: 'ev-99' }));
    expect(repeat).toBe(ingestKeyFor(EVENT({ eventId: 'ev-1' })));
    expect(repeat.startsWith(`${GUIDE_STATE_NAMESPACE}:completion:`)).toBe(true);
  });

  it('falls back to the event id for a kind with no durable state', () => {
    // A retry still collapses to one record, which is what the id was for.
    for (const kind of ['GUIDANCE_VIEWED', 'SHOW_ME_USED', 'STEP_THROUGH_STARTED'] as const) {
      expect(ingestKeyFor(EVENT({ kind, eventId: 'ev-7' }))).toBe('ev-7');
    }
  });

  it('refuses to spell two states into one key', () => {
    // A key built by joining has to police its own separator, or a featureId
    // carrying a colon could name a state it was never allowed to.
    expect(() => guideStateKey(EVENT({ featureId: 'clients:create' }))).toThrow(TypeError);
    expect(() => guideStateKey(EVENT({ appId: 'demo:evil' }))).toThrow(TypeError);
  });
});
