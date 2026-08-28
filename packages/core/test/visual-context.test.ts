/**
 * Saying where something is, without saying what it is.
 *
 * Closed Loop #12 established that an action may address a control a sentence
 * may not name. This is the smaller half that took until #17: `clients.search`
 * has no supported name and never will until the interface displays one, and a
 * person looking at it can still be told where it sits.
 *
 * Everything asserted here is additive. The last test is the one that matters
 * most — remove the location and the answer is unchanged — because that is the
 * difference between a presentation layer and an authority.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGuideQueryEngine, describeVisualContext } from '../src/index.js';
import type { GuideKnowledgeBundle, GuideQueryContext } from '../src/index.js';

const bundle = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures/guide-bundle.json'), 'utf8'),
) as GuideKnowledgeBundle;

const SEARCH = { x: 32, y: 170, width: 238, height: 36 };
const TABLE = { x: 32, y: 210, width: 1376, height: 320 };

const onClients = (overrides: Partial<GuideQueryContext> = {}): GuideQueryContext => ({
  route: '/clients',
  applicationVersion: bundle.applicationVersion,
  visibleSemanticIds: ['clients.search', 'clients.table'],
  runtimeInstances: [
    {
      semanticId: 'clients.table.row',
      ref: 'i1',
      containerSemanticId: 'clients.table',
      route: '/clients',
      runtimeAccessibleName: 'Acme Corp',
    },
  ],
  elementBoxes: { 'clients.search': SEARCH, 'clients.table': TABLE },
  ...overrides,
});

describe('a location for a control the interface never names', () => {
  it('is offered when geometry proves one', () => {
    const context = onClients();
    const described = describeVisualContext({
      bundle,
      context,
      targetSemanticId: 'clients.search',
    });
    expect(described?.targetDescription).toBe('directly above the list');
    expect(described?.regionDescription).toBe('the list');
    // Closed Loop #18 added the composed sentence and its receipt. The location
    // parts are unchanged, which is the thing this test was written to pin.
    expect(described?.sentences?.geometryOnly).toBe(
      'On this screen, it is directly above the list.',
    );
    expect(described?.receipt?.verified).toBe(true);
  });

  it('is absent when the host measured nothing', () => {
    const context = onClients({ elementBoxes: undefined });
    expect(
      describeVisualContext({ bundle, context, targetSemanticId: 'clients.search' }),
    ).toBeUndefined();
  });

  it('is absent when nothing observed members in the region', () => {
    // A rectangle on screen is not a collection. Only the runtime saying it has
    // members makes it one, which is the same rule instance grounding follows.
    const context = onClients({ runtimeInstances: [] });
    expect(
      describeVisualContext({ bundle, context, targetSemanticId: 'clients.search' }),
    ).toBeUndefined();
  });
});

describe('what a region may be called', () => {
  it('is generic unless the product earned a noun for that container', () => {
    // `clients.table` carries no concept noun, so it is "the list" — flat, and
    // true of anything with rows.
    const described = describeVisualContext({
      bundle,
      context: onClients(),
      targetSemanticId: 'clients.search',
    });
    expect(described?.regionDescription).toBe('the list');
  });

  it('never borrows a concept the route did not establish', () => {
    // The critical negative, at the sentence level. These rows say INV-002 and
    // the screen has never established "invoice".
    const context: GuideQueryContext = {
      route: '/clients/c1',
      applicationVersion: bundle.applicationVersion,
      visibleSemanticIds: ['client-detail.rename', 'invoices.list.open'],
      runtimeInstances: [
        {
          semanticId: 'invoices.list.open',
          ref: 'i1',
          containerSemanticId: 'invoices.list.open',
          route: '/clients/c1',
          runtimeAccessibleName: 'INV-002',
        },
      ],
      elementBoxes: {
        'client-detail.rename': { x: 32, y: 120, width: 120, height: 36 },
        'invoices.list.open': { x: 32, y: 200, width: 800, height: 300 },
      },
    };
    const described = describeVisualContext({
      bundle,
      context,
      targetSemanticId: 'client-detail.rename',
    });
    expect(described?.regionDescription).toBe('the list');
    expect(JSON.stringify(described)).not.toMatch(/invoice/i);
  });
});

describe('containment', () => {
  // Found by re-running an earlier capture rather than by reasoning: a modal
  // dialog rendered over the client table sits exactly inside its rectangle and
  // is not in it. "Inside the list" about a dialog control is precisely the
  // plausible false statement this system exists to refuse.
  const dialog = { x: 400, y: 260, width: 480, height: 220 };
  const context = onClients({
    visibleSemanticIds: ['clients.create-dialog.name', 'clients.table'],
    elementBoxes: { 'clients.create-dialog.name': dialog, 'clients.table': TABLE },
  });

  it('is refused when only coordinates agree', () => {
    expect(
      describeVisualContext({ bundle, context, targetSemanticId: 'clients.create-dialog.name' }),
    ).toBeUndefined();
  });

  it('is allowed when the document agrees', () => {
    const contained = describeVisualContext({
      bundle,
      context: {
        ...context,
        elementContainers: { 'clients.create-dialog.name': ['clients.table'] },
      },
      targetSemanticId: 'clients.create-dialog.name',
    });
    expect(contained?.targetDescription).toBe('inside the list');
  });

  it('does not quietly downgrade a refused containment to a direction', () => {
    // Dropping to "above the list" would be a different false statement, not a
    // safer one.
    const described = describeVisualContext({
      bundle,
      context,
      targetSemanticId: 'clients.create-dialog.name',
    });
    expect(described).toBeUndefined();
  });
});

describe('the location is additive', () => {
  it('changes nothing about the answer it accompanies', () => {
    const engine = createGuideQueryEngine({ bundle });
    const withGeometry = engine.query({
      query: 'How do I filter clients?',
      context: onClients(),
    });
    const without = engine.query({
      query: 'How do I filter clients?',
      context: onClients({ elementBoxes: undefined }),
    });

    expect(withGeometry.visualContext).toBeDefined();
    expect(without.visualContext).toBeUndefined();
    expect(without.status).toBe(withGeometry.status);
    expect(without.answer).toEqual(withGeometry.answer);
    expect(without.actions).toEqual(withGeometry.actions);
  });
});
