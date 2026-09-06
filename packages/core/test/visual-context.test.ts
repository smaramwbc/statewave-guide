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
  // Two rows, not one. A container holding a single thing is a container; a
  // list is a repetition, and Closed Loop #19.1 made the describer ask for one
  // before it calls anything "the list" — a page wrapper holding one of each
  // control had been qualifying.
  runtimeInstances: [
    // Unnamed on purpose. A named row is a thing a question could be *about*,
    // and two of them make the engine offer a choice — correctly, and in a
    // different test than this one. What these fixtures need from the rows is
    // only that there are two of them.
    {
      semanticId: 'clients.table.row',
      ref: 'i1',
      containerSemanticId: 'clients.table',
      route: '/clients',
    },
    {
      semanticId: 'clients.table.row',
      ref: 'i2',
      containerSemanticId: 'clients.table',
      route: '/clients',
    },
  ],
  elementBoxes: { 'clients.search': SEARCH, 'clients.table': TABLE },
  // Roles, because since Closed Loop #19.1 a region is a collection when the
  // runtime reports it as one. The React binding always supplies these; a
  // fixture that omitted them was describing a host that does not exist.
  elementRoles: { 'clients.search': 'searchbox', 'clients.table': 'table' },
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

  it('is absent when nothing on the screen reports itself a collection', () => {
    // A rectangle is not a collection, and neither is a region that merely holds
    // things. The runtime has to report the *element* as one.
    const context = onClients({ elementRoles: { 'clients.search': 'searchbox' } });
    expect(
      describeVisualContext({ bundle, context, targetSemanticId: 'clients.search' })?.sentences,
    ).toBeUndefined();
  });

  it('is offered for an empty collection, because an empty table is still a table', () => {
    // Requiring an observed repetition made this data-dependent: an audit found
    // Closed Loop #18's sentence disappearing whenever the search matched one
    // client. Being a list is a property of the element, not of its contents.
    const context = onClients({ runtimeInstances: [] });
    expect(
      describeVisualContext({ bundle, context, targetSemanticId: 'clients.search' })
        ?.regionDescription,
    ).toBe('the list');
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
        {
          semanticId: 'invoices.list.open',
          ref: 'i2',
          containerSemanticId: 'invoices.list.open',
          route: '/clients/c1',
        },
      ],
      elementBoxes: {
        'client-detail.rename': { x: 32, y: 120, width: 120, height: 36 },
        'invoices.list.open': { x: 32, y: 200, width: 800, height: 300 },
      },
      elementRoles: { 'client-detail.rename': 'button', 'invoices.list.open': 'list' },
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

// ---------------------------------------------------------------------------
// A structural container is not a collection a person perceives
// ---------------------------------------------------------------------------

describe('a page wrapper is not "the list"', () => {
  /**
   * The defect an independent review caught, reproduced from the geometry a
   * browser actually reported. `clients.create` is a toolbar button whose top
   * edge is flush with the page section's top edge, and the section holds one
   * of everything — a count, three buttons, a search field and a table. It was
   * described as being *inside the list*, which sends a reader to the wrong half
   * of the screen.
   */
  const page = (overrides: Partial<GuideQueryContext> = {}): GuideQueryContext => ({
    route: '/clients',
    applicationVersion: bundle.applicationVersion,
    visibleSemanticIds: ['clients', 'clients.create', 'clients.search', 'clients.table'],
    runtimeInstances: [
      {
        semanticId: 'clients.create',
        ref: 'a1',
        containerSemanticId: 'clients',
        route: '/clients',
      },
      {
        semanticId: 'clients.search',
        ref: 'a2',
        containerSemanticId: 'clients',
        route: '/clients',
      },
      { semanticId: 'clients.table', ref: 'a3', containerSemanticId: 'clients', route: '/clients' },
      {
        semanticId: 'clients.table.row',
        ref: 'r1',
        containerSemanticId: 'clients.table',
        route: '/clients',
      },
      {
        semanticId: 'clients.table.row',
        ref: 'r2',
        containerSemanticId: 'clients.table',
        route: '/clients',
      },
    ],
    elementBoxes: {
      clients: { x: 30, y: 103, width: 1380, height: 424 },
      'clients.create': { x: 184, y: 103, width: 91, height: 34 },
      'clients.search': { x: 30, y: 169, width: 240, height: 34 },
      'clients.table': { x: 30, y: 203, width: 1380, height: 324 },
    },
    elementContainers: {
      'clients.create': ['clients'],
      'clients.search': ['clients'],
      'clients.table': ['clients'],
    },
    elementRoles: {
      clients: 'section',
      'clients.create': 'button',
      'clients.search': 'searchbox',
      'clients.table': 'table',
    },
    ...overrides,
  });

  it('describes a toolbar button as above the table, not inside the page', () => {
    const described = describeVisualContext({
      bundle,
      context: page(),
      targetSemanticId: 'clients.create',
    });
    expect(described?.sentences?.geometryOnly).toBe(
      'On this screen, it is directly above the list.',
    );
    expect(described?.targetDescription).not.toContain('inside');
  });

  it('says why the wrapper was not used', () => {
    const described = describeVisualContext({
      bundle,
      context: page(),
      targetSemanticId: 'clients.create',
    });
    expect(described?.receipt?.refusals.join(' ')).toContain(
      'clients holds members but reports section',
    );
  });

  it('offers nothing at all when the only container is structural', () => {
    // No table on this screen: a wrapper of one-of-each and a button inside it.
    // Unknown beats wrong, so there is no sentence — and a receipt explains it.
    const described = describeVisualContext({
      bundle,
      context: page({
        elementBoxes: {
          clients: { x: 30, y: 103, width: 1380, height: 424 },
          'clients.create': { x: 184, y: 103, width: 91, height: 34 },
        },
      }),
      targetSemanticId: 'clients.create',
    });
    expect(described?.sentences).toBeUndefined();
    expect(described?.receipt?.refusals.length).toBeGreaterThan(0);
  });

  it('still allows a control genuinely inside a repeated collection', () => {
    // The permitted case: a control that lives in the table, in a table that
    // really does repeat. The rule refuses wrappers, not containment.
    const described = describeVisualContext({
      bundle,
      context: page({
        visibleSemanticIds: ['clients.table', 'clients.table.delete'],
        elementBoxes: {
          'clients.table': { x: 30, y: 203, width: 1380, height: 324 },
          'clients.table.delete': { x: 1200, y: 240, width: 80, height: 30 },
        },
        elementContainers: { 'clients.table.delete': ['clients.table'] },
        elementRoles: { 'clients.table': 'table', 'clients.table.delete': 'button' },
      }),
      targetSemanticId: 'clients.table.delete',
    });
    expect(described?.targetDescription).toBe('inside the list');
  });

  it('refuses containment by a repeated container that reports a structural role', () => {
    // A section that happens to render the same control twice clears the
    // repetition test. The role stops it from containing anything.
    const described = describeVisualContext({
      bundle,
      context: page({
        visibleSemanticIds: ['clients', 'clients.create'],
        runtimeInstances: [
          {
            semanticId: 'clients.create',
            ref: 'a1',
            containerSemanticId: 'clients',
            route: '/clients',
          },
          {
            semanticId: 'clients.create',
            ref: 'a2',
            containerSemanticId: 'clients',
            route: '/clients',
          },
        ],
        elementBoxes: {
          clients: { x: 30, y: 103, width: 1380, height: 424 },
          'clients.create': { x: 184, y: 140, width: 91, height: 34 },
        },
      }),
      targetSemanticId: 'clients.create',
    });
    expect(JSON.stringify(described?.sentences ?? {})).not.toContain('inside');
  });
});
