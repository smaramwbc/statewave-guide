/**
 * What survives a session, and why nothing decides that by hand.
 *
 * The durability table is a claim about the planner: that `GUIDANCE_VIEWED`
 * cannot change what anybody sees later, and that a completion can.
 * `scripts/memory-durability.mjs` re-derives the whole table from the real
 * planner on every run. These are the properties around it that a gate reading
 * outcomes cannot see — that the vocabulary is closed, that the filter and the
 * table cannot drift apart, and that the policy reads nothing but the kind.
 */

import { describe, expect, it } from 'vitest';
import {
  DURABLE_REMOTE_EVENT_KINDS,
  GUIDE_MEMORY_DURABILITY,
  GUIDE_MEMORY_EVENT_KINDS,
  isDurableRemoteEvent,
  remoteMemoryWriteDecision,
} from '../src/index.js';
import type { GuideMemoryEvent, GuideMemoryEventKind } from '../src/index.js';

describe('the durability table', () => {
  it('classifies every kind in the closed taxonomy, and nothing else', () => {
    const classified = Object.keys(GUIDE_MEMORY_DURABILITY).sort();
    expect(classified).toEqual([...GUIDE_MEMORY_EVENT_KINDS].sort());
  });

  it('is frozen, so a caller cannot reclassify a kind at runtime', () => {
    expect(Object.isFrozen(GUIDE_MEMORY_DURABILITY)).toBe(true);
    expect(() => {
      (GUIDE_MEMORY_DURABILITY as Record<string, string>).GUIDANCE_VIEWED = 'DURABLE_REMOTE';
    }).toThrow();
    expect(GUIDE_MEMORY_DURABILITY.GUIDANCE_VIEWED).toBe('NOT_USEFUL');
  });

  it('keeps the two highest-volume kinds out of durable storage', () => {
    // The whole problem in one assertion: one record per answer shown and one
    // per fold opened were the two nothing read.
    expect(GUIDE_MEMORY_DURABILITY.GUIDANCE_VIEWED).toBe('NOT_USEFUL');
    expect(GUIDE_MEMORY_DURABILITY.FULL_STEPS_EXPANDED).toBe('NOT_USEFUL');
  });

  it('names the derived pair as derived rather than useless', () => {
    // They do reach the screen, through `preferredAssistanceModeHint`. Calling
    // them NOT_USEFUL would be a false statement that happened to give the same
    // write behaviour, and the next person to read the table would believe it.
    expect(GUIDE_MEMORY_DURABILITY.SHOW_ME_USED).toBe('DERIVED_ONLY');
    expect(GUIDE_MEMORY_DURABILITY.STEP_THROUGH_STARTED).toBe('DERIVED_ONLY');
  });
});

describe('the write filter', () => {
  it('agrees with the table for every kind', () => {
    for (const kind of GUIDE_MEMORY_EVENT_KINDS) {
      const expected = GUIDE_MEMORY_DURABILITY[kind] === 'DURABLE_REMOTE';
      expect(isDurableRemoteEvent({ kind })).toBe(expected);
      expect(remoteMemoryWriteDecision(kind).persist).toBe(expected);
    }
  });

  it('derives the durable list from the table rather than repeating it', () => {
    const fromTable = GUIDE_MEMORY_EVENT_KINDS.filter(
      (kind) => GUIDE_MEMORY_DURABILITY[kind] === 'DURABLE_REMOTE',
    ).sort();
    expect([...DURABLE_REMOTE_EVENT_KINDS]).toEqual(fromTable);
  });

  it('keeps a preference and a completion, and drops the rest', () => {
    expect([...DURABLE_REMOTE_EVENT_KINDS]).toEqual([
      'EXPLICIT_PREFERENCE_SET',
      'STEP_THROUGH_COMPLETED',
    ]);
  });

  it('reads the kind and nothing else', () => {
    // A policy that could see the payload is a policy that can be argued with one
    // record at a time, and the first argument anybody wins is "this one matters".
    const base = {
      eventId: 'e1',
      appId: 'demo',
      subjectId: 'u1',
      featureId: 'clients.create',
      occurredAt: '2026-08-29T10:00:00Z',
      applicationVersion: 'v1',
      authority: 'OBSERVED_INTERACTION',
    } as const;

    const plain = { ...base, kind: 'GUIDANCE_VIEWED' } as GuideMemoryEvent;
    const dressedUp = {
      ...base,
      kind: 'GUIDANCE_VIEWED',
      metadata: { preference: 'guidanceDetail', value: 'CONCISE' },
    } as GuideMemoryEvent;

    expect(isDurableRemoteEvent(plain)).toBe(false);
    expect(isDurableRemoteEvent(dressedUp)).toBe(false);
  });

  it('refuses a kind outside the taxonomy rather than defaulting to keep', () => {
    // An unknown kind has no demonstrated effect by definition. Failing open
    // would let a future kind reach durable storage without anyone deciding it
    // should.
    const unknown = 'GUIDANCE_DISMISSED' as GuideMemoryEventKind;
    expect(isDurableRemoteEvent({ kind: unknown })).toBe(false);
    expect(remoteMemoryWriteDecision(unknown).persist).toBe(false);
  });
});
