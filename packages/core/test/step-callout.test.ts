/**
 * The words the pointer carries with it.
 *
 * A ring drawn around a control says "this one" and nothing else. Beside a form
 * with six fields in forty pixels that is barely an answer, so the highlight
 * action carries a heading and a sentence, and the overlay renders them as a
 * callout next to the thing it is pointing at.
 *
 * Both halves are authorised prose chosen here rather than in the renderer:
 * the heading is the control's supported name, the body is the step verbatim.
 * A panel that wrote its own callout text would be asserting something about
 * the product — which is exactly the line ADR 0022 draws, and exactly the line
 * an earlier attempt at this feature crossed.
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

const howToCreate = () =>
  guide.query({
    query: 'How do I create a client?',
    context: { route: '/clients', applicationVersion: V },
  });

describe('the callout a step points with', () => {
  it('quotes the step, and never rewrites it', () => {
    const steps = howToCreate().answer?.steps ?? [];
    const withActions = steps.filter((step) => (step.actions ?? []).length > 0);
    expect(withActions.length).toBeGreaterThan(0);

    for (const step of withActions) {
      const highlight = (step.actions ?? []).find((action) => action.kind === 'highlight');
      expect(highlight).toBeDefined();
      if (highlight?.kind !== 'highlight') throw new Error('unreachable');
      expect(highlight.message).toBe(step.text);
    }
  });

  it('heads the callout with the control name the interface actually shows', () => {
    const steps = howToCreate().answer?.steps ?? [];
    for (const step of steps) {
      const highlight = (step.actions ?? []).find((action) => action.kind === 'highlight');
      if (highlight?.kind !== 'highlight') continue;
      // A control the interface never names contributes no heading rather than
      // a fabricated one — the same rule the action `label` obeys.
      if (highlight.title !== undefined) expect(highlight.title).toBe(highlight.label);
    }
  });

  /**
   * Scrolling is movement, not speech. Only the highlight carries words, so a
   * sequence cannot announce the same sentence twice on its way to one control.
   */
  it('says nothing while scrolling', () => {
    for (const step of howToCreate().answer?.steps ?? []) {
      for (const action of step.actions ?? []) {
        if (action.kind !== 'scroll') continue;
        expect(action).not.toHaveProperty('message');
      }
    }
  });

  /**
   * A response-level Show me is "this is the thing", not "do this" — there is
   * no step to quote, so it carries what the thing is *for*. A heading alone
   * beside a button already labelled "New client" tells the reader nothing.
   */
  it('carries the name and the purpose at response level', () => {
    const response = howToCreate();
    const highlight = response.actions.find((action) => action.kind === 'highlight');
    expect(highlight).toBeDefined();
    if (highlight?.kind !== 'highlight') throw new Error('unreachable');
    expect(highlight.title).toBe(highlight.label);
    expect(highlight.message).toBe(response.answer?.purpose);
    // Never a step's instruction: that would tell a user to do something they
    // did not ask to be walked through.
    const stepTexts = (response.answer?.steps ?? []).map((step) => step.text);
    expect(stepTexts).not.toContain(highlight.message);
  });
});
