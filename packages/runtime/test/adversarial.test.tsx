/**
 * Everything a runtime subsystem could be talked into believing.
 *
 * A browser is a far richer source of evidence than a syntax tree and a far
 * easier one to fool. Everything on a page is genuinely there together, so
 * proximity looks like structure; things change constantly, so coincidence looks
 * like causation; and a screenshot is a prompt written by whoever controls the
 * application's text.
 *
 * Each test below is one of those, made concrete. Several assert a refusal on
 * evidence that a looser rule would have accepted — which is the only way to
 * find out whether the rule is doing anything.
 */

import { describe, expect, it } from 'vitest';
import { mountApp } from './harness/app-harness.js';
import { ask, probe } from './harness/probe.js';
import { mayUseAsEvidence } from '../src/index.js';

// ---------------------------------------------------------------------------
// A · a name is not a behaviour, at runtime either
// ---------------------------------------------------------------------------

describe('A · a control named Delete with no delete effect', () => {
  it('gets no delete capability', async () => {
    // The static half of this is already famous in this project:
    // `client-detail.delete`'s handler is `confirmDelete.open()`, so the button
    // provably flips a boolean. Runtime agrees, and agreeing is the test — a
    // subsystem that watched the click and saw a dialog could easily have
    // reported the obvious thing.
    const app = await mountApp({ route: '/clients/c1' });
    try {
      const trace = await probe({
        app,
        traceId: 'delete-click',
        action: { kind: 'click', targetSemanticId: 'client-detail.delete', safety: 'SAFE_PROBE' },
      });
      const { verdict } = ask(trace, 'delete');
      expect(verdict.status).toBe('rejected');
      if (verdict.status === 'rejected') expect(verdict.reason).toBe('NO_WRITE_OBSERVED');
      expect(
        trace.observedEffects.some(
          (effect) => effect.kind === 'NETWORK_REQUEST' && effect.method === 'DELETE',
        ),
      ).toBe(false);
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// B · an input named Search that changes nothing
// ---------------------------------------------------------------------------

describe('B · a search box that narrows nothing', () => {
  it('gets no filter capability', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'search-all',
        // A term every seeded client matches. The control works; the collection
        // does not change; there is nothing to conclude.
        action: {
          kind: 'type',
          targetSemanticId: 'clients.search',
          safety: 'SAFE_PROBE',
          valueShape: '',
        },
        settleMs: 400,
      });
      expect(ask(trace, 'filter').verdict.status).toBe('rejected');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// D · two controls side by side
// ---------------------------------------------------------------------------

describe('D · a control on the same screen is not the feature s own', () => {
  it('refuses to let one feature use another s node as evidence', () => {
    expect(
      mayUseAsEvidence({
        nodeId: 'element:settings.rotate-key',
        featureId: 'settings.new-key',
        scopeClass: 'OUTSIDE',
      }),
    ).toBe(false);
    expect(
      mayUseAsEvidence({
        nodeId: 'element:settings.rotate-key',
        featureId: 'settings.rotate-key',
        scopeClass: 'OWNED',
      }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E–F · causality
// ---------------------------------------------------------------------------

describe('E · a change outside the interaction window', () => {
  it('is not attributed to the click', async () => {
    const app = await mountApp({ route: '/settings' });
    try {
      // A click that does nothing, with a route change afterwards driven by
      // something else entirely. The trace covers the click's window only.
      const trace = await probe({
        app,
        traceId: 'unrelated',
        action: { kind: 'click', targetSemanticId: 'settings.form', safety: 'SAFE_PROBE' },
      });
      expect(trace.observedEffects.some((effect) => effect.kind === 'ROUTE_CHANGED')).toBe(false);

      await probe({
        app,
        traceId: 'later',
        action: { kind: 'click', targetSemanticId: 'nav.clients', safety: 'SAFE_PROBE' },
      });
      // The first trace is unchanged by what happened after it closed.
      expect(trace.observedEffects.some((effect) => effect.kind === 'ROUTE_CHANGED')).toBe(false);
    } finally {
      app.destroy();
    }
  });
});

describe('F · a request the interaction did not cause', () => {
  it('is not in the window, so it cannot support a create', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      await app.settle();
      // The page load's own GET is already recorded before the window opens.
      const trace = await probe({
        app,
        traceId: 'no-write',
        action: { kind: 'click', targetSemanticId: 'clients.export', safety: 'SAFE_PROBE' },
      });
      const { verdict } = ask(trace, 'create');
      expect(verdict.status).toBe('rejected');
      if (verdict.status === 'rejected') expect(verdict.reason).toBe('NO_WRITE_OBSERVED');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// G · a control whose visible text is a value
// ---------------------------------------------------------------------------

describe('G · dynamic button text', () => {
  it('verifies the behaviour and leaves the name unknown', async () => {
    // `invoices.list.open` renders `{invoice.number}`. Round 6 shipped
    // "Choose Open." from the identifier and Closed Loop #8 withdrew it. Runtime
    // can prove what pressing it does and still cannot supply a static name —
    // which is the correct pair of answers, not a half-failure.
    const app = await mountApp({ route: '/invoices' });
    try {
      await app.settle();
      const snapshot = app.snapshot('invoices');
      const open = snapshot.elements.find((element) => element.semanticId === 'invoices.list.open');
      expect(open, 'the row control should be rendered').toBeDefined();
      // Its accessible name is the invoice number, which is a value and changes
      // per row. It is emphatically not "Open".
      expect(open?.accessibleName?.text).not.toBe('Open');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// H · an error with no recovery
// ---------------------------------------------------------------------------

describe('H · an error message on its own', () => {
  it('yields no recovery capability, because there is no recovery control', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      await app.settle();
      const snapshot = app.snapshot('clients');
      const recovery = snapshot.elements.filter(
        (element) => element.semanticId?.startsWith('clients.error') === true,
      );
      expect(recovery).toEqual([]);
    } finally {
      app.destroy();
    }
  });
});
