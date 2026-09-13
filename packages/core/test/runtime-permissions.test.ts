/**
 * A condition, settled against the user who is actually asking.
 *
 * The compiled guidance says a feature needs `clients:create`. Whether *you*
 * have it is not a fact about the product and never reaches the ProductModel —
 * it arrives with the question, from the host's own auth layer, and is true for
 * exactly as long as that one answer takes.
 *
 * The three cases below are the whole feature, and the third is the one worth
 * defending. A host that reports nothing gets the sentence this contract has
 * always produced, because a guide that guessed at permissions would be wrong
 * in the direction that matters most: telling somebody they cannot do a thing
 * they can do teaches them to stop asking.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGuideQueryEngine } from '../src/query/engine.js';
import type { GuideKnowledgeBundle } from '../src/query/bundle.js';

const bundle = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures', 'guide-bundle.json'), 'utf8'),
) as GuideKnowledgeBundle;

const guide = createGuideQueryEngine({ bundle });
const V = bundle.applicationVersion;

/** `clients.create` carries exactly one condition: `clients:create`. */
const ask = (permissions?: readonly string[]) =>
  guide.query({
    query: 'How do I create a client?',
    context: {
      route: '/clients',
      applicationVersion: V,
      ...(permissions === undefined ? {} : { permissions }),
    },
  });

describe('a condition, against the runtime', () => {
  it('claims nothing about the user when the host reports no permissions', () => {
    expect(ask().answer?.conditions).toEqual([
      { text: 'You need permission to create a client.', status: 'UNKNOWN' },
    ]);
  });

  it('says so when the user holds it', () => {
    expect(ask(['clients:read', 'clients:create']).answer?.conditions).toEqual([
      { text: 'You have permission to create a client.', status: 'HELD' },
    ]);
  });

  it('says so when the user does not', () => {
    expect(ask(['clients:read']).answer?.conditions).toEqual([
      { text: 'You do not have permission to create a client.', status: 'NOT_HELD' },
    ]);
  });

  /**
   * An empty array is a report, not an absence.
   *
   * A signed-out session holds nothing, and that is a fact the host knows. The
   * distinction between `[]` and `undefined` is the only thing separating "you
   * cannot do this" from "I was not told" — collapsing them would either
   * silence the useful answer or invent it.
   */
  it('treats an empty list as a user who holds nothing', () => {
    expect(ask([]).answer?.conditions[0]?.status).toBe('NOT_HELD');
  });

  /**
   * Matching is on the identifier, never the prose.
   *
   * `capability` is the English half — "create a client" — and exists only to
   * build a sentence. If it were ever matched against a host's permission
   * strings, a rename in either vocabulary would silently flip a verdict.
   */
  it('does not match the capability phrase against the permission list', () => {
    expect(ask(['create a client']).answer?.conditions[0]?.status).toBe('NOT_HELD');
  });

  /**
   * Compiled guidance does not always carry a capability phrase, and a
   * permission identifier is not user-visible language. `clients:delete` is a
   * string from the source in exactly the way a route identifier is, so the
   * sentence stays general rather than naming it.
   */
  it('never reads a permission identifier out loud', () => {
    const response = guide.query({
      query: "Why can't I see Delete?",
      context: { route: '/clients/c1', applicationVersion: V, permissions: ['clients:read'] },
    });
    const conditions = response.answer?.conditions ?? [];
    expect(conditions.length).toBeGreaterThan(0);
    for (const condition of conditions) {
      expect(condition.status).toBe('NOT_HELD');
      expect(condition.text).not.toMatch(/clients:/);
    }
  });

  /**
   * Steps are not pruned by a permission.
   *
   * Being told how something works and being allowed to do it are different
   * questions — the same distinction the engine already draws between what it
   * will explain and what it will click. A user who cannot create a client is
   * often a user about to ask somebody who can.
   */
  it('still explains the feature to a user who may not use it', () => {
    const denied = ask(['clients:read']);
    const allowed = ask(['clients:read', 'clients:create']);
    expect(denied.answer?.steps.map((step) => step.text)).toEqual(
      allowed.answer?.steps.map((step) => step.text),
    );
    expect(denied.answer?.steps.length).toBeGreaterThan(0);
  });
});
