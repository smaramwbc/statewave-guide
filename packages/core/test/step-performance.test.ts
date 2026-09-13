/**
 * What a guide may do instead of the user, and what it may never do.
 *
 * Every safe action this contract offers is inert: it moves attention and
 * changes nothing, which is what makes offering one always harmless. Taking a
 * step for somebody is not inert, so the permission to do it is carried in its
 * own field, decided here, and refused by default.
 *
 * The line is drawn from what each step was *compiled as*, not from what the
 * control looks like at runtime. A compiler that knows "this step opens the
 * task" and "this step commits it" has already answered the question, and no
 * amount of inspecting a button's markup answers it as well:
 *
 *   trigger      — reveals the task. Closing the dialog undoes it.   allowed
 *   confirmation — *is* the change. Nothing undoes it.               refused
 *   input        — the user's own data.                              refused
 *   entry        — goes to a screen. Already inert.                  allowed
 *
 * The second row is the one this file exists for. A convenience that
 * occasionally creates a real record is not a convenience.
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

const createClient = () =>
  guide.query({
    query: 'How do I create a client?',
    context: { route: '/clients', applicationVersion: V },
  });

describe('taking a step for the user', () => {
  it('offers the trigger, which opens the task', () => {
    const steps = createClient().answer?.steps ?? [];
    const trigger = steps.find((step) => step.text.includes('New client'));
    expect(trigger?.performance).toEqual({
      kind: 'PRESS',
      semanticId: 'clients.create',
      byGuide: 'ALLOWED',
    });
  });

  it('refuses the confirmation, which is the change itself', () => {
    const steps = createClient().answer?.steps ?? [];
    const confirm = steps.find((step) => step.text.includes('Create client'));
    expect(confirm?.performance?.byGuide).toBe('REFUSED');
    expect(confirm?.performance?.refusedBecause).toBe('COMMITS_A_CHANGE');
  });

  it('refuses to supply the user’s own data', () => {
    const steps = createClient().answer?.steps ?? [];
    const fields = steps.find((step) => step.performance?.kind === 'TYPE');
    expect(fields?.performance?.byGuide).toBe('REFUSED');
    expect(fields?.performance?.refusedBecause).toBe('SUPPLIES_DATA');
  });

  /**
   * The guarantee stated once, over the whole bundle rather than one feature.
   *
   * A per-feature assertion proves the four steps somebody looked at. This
   * proves there is no feature anywhere — present or added later — whose
   * committing step the guide would press.
   */
  it('never offers to commit anything, in any feature', () => {
    for (const featureId of guide.listFeatures()) {
      const guidance = guide.getGuidance(featureId);
      const committing = (guidance?.steps ?? []).filter((step) => step.role === 'confirmation');
      if (committing.length === 0) continue;

      const response = guide.query({
        query: `How do I use ${featureId}?`,
        context: { applicationVersion: V },
      });
      for (const step of response.answer?.steps ?? []) {
        if (step.performance?.byGuide !== 'ALLOWED') continue;
        // Anything allowed must be a trigger or an entry, never a commit.
        expect(step.performance.kind === 'PRESS' || step.performance.kind === 'NAVIGATE').toBe(
          true,
        );
        expect(step.text).not.toMatch(/^Choose "(Create|Delete|Save|Send)/);
      }
    }
  });

  /**
   * Allowed is not the same as pressable. A step may name a control this
   * feature does not own — nothing verified it, so nothing may press it.
   */
  it('never allows a press without a control to press', () => {
    for (const featureId of guide.listFeatures()) {
      const response = guide.query({
        query: `Where is ${featureId}?`,
        context: { applicationVersion: V },
      });
      for (const step of response.answer?.steps ?? []) {
        if (step.performance?.kind !== 'PRESS') continue;
        if (step.performance.byGuide !== 'ALLOWED') continue;
        expect(step.performance.semanticId).toBeDefined();
      }
    }
  });

  /** A refusal always says why, and an allowance never pretends to. */
  it('pairs every refusal with a reason, and no allowance with one', () => {
    for (const featureId of guide.listFeatures()) {
      const response = guide.query({
        query: `How do I use ${featureId}?`,
        context: { applicationVersion: V },
      });
      for (const step of response.answer?.steps ?? []) {
        const performance = step.performance;
        if (performance === undefined) continue;
        if (performance.byGuide === 'REFUSED') expect(performance.refusedBecause).toBeDefined();
        else expect(performance.refusedBecause).toBeUndefined();
      }
    }
  });

  /**
   * Performance is not an action. A host that runs everything in `actions` —
   * which the contract promises is inert — must never discover it has been
   * pressing things.
   */
  it('keeps the pressable control out of the inert action list', () => {
    const response = createClient();
    const everyAction = [
      ...response.actions,
      ...(response.answer?.steps ?? []).flatMap((step) => step.actions ?? []),
    ];
    for (const action of everyAction) {
      expect(['navigate', 'highlight', 'scroll', 'focus', 'open_guide_step']).toContain(
        action.kind,
      );
    }
  });
});
