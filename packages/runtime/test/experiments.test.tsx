/**
 * The eight features Round 7 could not help a user with, put in front of a
 * running application.
 *
 * Static analysis had exhausted itself on these. The Round 7 diagnostic measured
 * that fifteen of twenty-one benchmark features could verify no meaningful
 * capability *even if a claim were proposed* — the chain from control to
 * endpoint breaks at a service that takes its HTTP verb as an argument, a
 * handler passed through a prop, a dispatch table keyed by a string that
 * resolves to nothing. None of those is a gap a cleverer static rule closes.
 *
 * A running application has no chain to walk. The request happened or it did
 * not. So each test below asks the same question — *what does this control
 * actually do?* — and then asks the verifier whether that is enough.
 *
 * Several of these end in a refusal, and the refusals are the point. A loop that
 * only demonstrated recoveries would have proved that runtime observation can
 * find things, not that it knows when it has not.
 */

import { describe, expect, it } from 'vitest';
import { mountApp } from './harness/app-harness.js';
import { ask, probe } from './harness/probe.js';

// ---------------------------------------------------------------------------
// clients.search — the headline
// ---------------------------------------------------------------------------

describe('clients.search', () => {
  it('is observably a filter, and nothing grander', async () => {
    // Closed Loop #7 refused `capability/search` and was right to: the graph
    // proves a text box and a chain of hooks no relationship expresses, and
    // `GET /api/clients` proves listing rather than searching. Round 6 scored the
    // feature 1 with the note "it never tells the user what to enter".
    //
    // At runtime the question is answerable by watching. Typing narrows the
    // visible collection and does not navigate. That is *filtering*, which is
    // the narrowest true thing, and it is not "search".
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'search',
        action: {
          kind: 'type',
          targetSemanticId: 'clients.search',
          safety: 'SAFE_PROBE',
          valueShape: 'Acme',
        },
        settleMs: 400,
      });

      const collection = trace.observedEffects.find(
        (effect) =>
          effect.kind === 'COLLECTION_MEMBERS_CHANGED' &&
          effect.containerSemanticId === 'clients.table',
      );
      expect(collection, 'typing should change the visible client collection').toBeDefined();
      expect(collection).toMatchObject({ before: 5, after: 2 });

      const { verdict } = ask(trace, 'filter');
      expect(verdict.status).toBe('verified');
      if (verdict.status === 'verified') expect(verdict.authority).toBe('BEHAVIOR_VERIFIED');
    } finally {
      app.destroy();
    }
  });

  it('would not verify a filter if nothing had narrowed', async () => {
    // The negative control that makes the positive one mean something. Typing a
    // term that matches everything leaves the collection alone, and a control
    // called Search that changes nothing filters nothing.
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'search-noop',
        action: {
          kind: 'type',
          targetSemanticId: 'clients.search',
          safety: 'SAFE_PROBE',
          valueShape: '',
        },
        settleMs: 400,
      });
      const { verdict } = ask(trace, 'filter');
      expect(verdict.status).toBe('rejected');
      if (verdict.status === 'rejected') expect(verdict.reason).toBe('COLLECTION_UNCHANGED');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// nav.clients — navigation, which static analysis already had
// ---------------------------------------------------------------------------

describe('nav.clients', () => {
  it('verifies navigation from a route transition', async () => {
    const app = await mountApp({ route: '/settings' });
    try {
      const trace = await probe({
        app,
        traceId: 'nav',
        action: { kind: 'click', targetSemanticId: 'nav.clients', safety: 'SAFE_PROBE' },
      });
      const { verdict } = ask(trace, 'navigate');
      expect(verdict.status).toBe('verified');
      expect(app.route()).toBe('/clients');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// clients.create — a dialog, then a write
// ---------------------------------------------------------------------------

describe('clients.create', () => {
  it('opens a dialog, and that is all clicking it does', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'create-open',
        action: { kind: 'click', targetSemanticId: 'clients.create', safety: 'SAFE_PROBE' },
      });
      const { verdict } = ask(trace, 'open');
      expect(verdict.status).toBe('verified');

      // And it is not a create. Nothing was written by opening a form — which is
      // exactly the distinction `client-detail.delete` failed statically, where
      // a button named Delete only flips a boolean.
      const { verdict: asCreate } = ask(trace, 'create');
      expect(asCreate.status).toBe('rejected');
      if (asCreate.status === 'rejected') expect(asCreate.reason).toBe('NO_WRITE_OBSERVED');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// settings.rotate-key → settings.new-key — reveal
// ---------------------------------------------------------------------------

describe('settings.rotate-key', () => {
  it('reveals the key display, and says nothing about when the key was made', async () => {
    // Round 5 shipped "Shows the freshly generated API key", and Closed Loop #7
    // withheld the whole sentence: a `<code>` element records no history of when
    // its contents were made. Runtime does not change that. What it *can* prove
    // is that the display was absent and then present — a reveal, which is a
    // structural fact and not a temporal one.
    const app = await mountApp({ route: '/settings' });
    try {
      expect(app.find('settings.new-key'), 'the key display starts absent').toBeNull();

      const trace = await probe({
        app,
        traceId: 'rotate',
        action: { kind: 'click', targetSemanticId: 'settings.rotate-key', safety: 'SAFE_PROBE' },
      });

      const appeared = trace.observedEffects.find(
        (effect) => effect.kind === 'ELEMENT_APPEARED' && effect.semanticId === 'settings.new-key',
      );
      expect(appeared, 'the key display should appear').toBeDefined();

      const { verdict } = ask(trace, 'reveal');
      expect(verdict.status).toBe('verified');
      if (verdict.status === 'verified') {
        // The wording of the verdict matters as much as the verdict.
        expect(verdict.detail).toContain('What it contains is not established');
      }
    } finally {
      app.destroy();
    }
  });

  it('does not record the key it revealed', async () => {
    const app = await mountApp({ route: '/settings' });
    try {
      const trace = await probe({
        app,
        traceId: 'rotate-redact',
        action: { kind: 'click', targetSemanticId: 'settings.rotate-key', safety: 'SAFE_PROBE' },
      });
      const serialised = JSON.stringify(trace);
      expect(serialised).not.toContain('sk_live_fixture_0000');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// settings.form — rendered containment, and what it still does not prove
// ---------------------------------------------------------------------------

describe('settings.form', () => {
  it('proves in the DOM the containment source composition made hard', async () => {
    const app = await mountApp({ route: '/settings' });
    try {
      await app.settle();
      const snapshot = app.snapshot('settings');
      const fields = snapshot.elements.filter(
        (element) => element.semanticParent === 'settings.form',
      );
      const ids = fields.map((element) => element.semanticId).sort();
      expect(ids).toContain('settings.name');
      expect(ids).toContain('settings.notifications');
      expect(ids).toContain('settings.save');
    } finally {
      app.destroy();
    }
  });

  it('recovers the rendered names of both fields', async () => {
    const app = await mountApp({ route: '/settings' });
    try {
      await app.settle();
      const snapshot = app.snapshot('settings');
      const byId = new Map(
        snapshot.elements.filter((e) => e.semanticId !== undefined).map((e) => [e.semanticId!, e]),
      );
      expect(byId.get('settings.name')?.accessibleName?.text).toBe('Organisation');
      expect(byId.get('settings.notifications')?.accessibleName?.text).toBe(
        'Email me when an invoice is paid',
      );
    } finally {
      app.destroy();
    }
  });

  it('still does not prove what saving does, until saving is observed', async () => {
    // ADR 0018's rule, restated at runtime: containment supplies structure and
    // never semantics. A form holding fields says nothing about what submitting
    // it accomplishes.
    const app = await mountApp({ route: '/settings' });
    try {
      const trace = await probe({
        app,
        traceId: 'settings-submit',
        action: { kind: 'submit', targetSemanticId: 'settings.form', safety: 'SAFE_PROBE' },
      });
      const request = trace.observedEffects.find((effect) => effect.kind === 'NETWORK_REQUEST');
      expect(request, 'submitting should send a request').toBeDefined();

      const { verdict } = ask(trace, 'update');
      expect(verdict.status).toBe('verified');
      if (verdict.status === 'verified') expect(verdict.detail).toContain('PUT');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// dashboard.new-client — the dynamic handler
// ---------------------------------------------------------------------------

describe('dashboard.new-client', () => {
  it('is finally observable, because a browser does not care that the handler was dynamic', async () => {
    // Statically this is `handlers[label] ?? startClientCreation`, a computed
    // member read whose key resolves to nothing. `UNRESOLVED_DYNAMIC_CALL` is
    // the correct static answer and it has scored the feature 1 in every round.
    // The button still does something when pressed.
    const app = await mountApp({ route: '/' });
    try {
      const trace = await probe({
        app,
        traceId: 'dashboard-new',
        action: { kind: 'click', targetSemanticId: 'dashboard.new-client', safety: 'SAFE_PROBE' },
      });
      const route = trace.observedEffects.find((effect) => effect.kind === 'ROUTE_CHANGED');
      expect(route, 'the dashboard button should go somewhere').toBeDefined();
      const { verdict } = ask(trace, 'navigate');
      expect(verdict.status).toBe('verified');
      expect(app.route()).toBe('/clients');
    } finally {
      app.destroy();
    }
  });

  it('is not a create, whatever it is called', async () => {
    const app = await mountApp({ route: '/' });
    try {
      const trace = await probe({
        app,
        traceId: 'dashboard-not-create',
        action: { kind: 'click', targetSemanticId: 'dashboard.new-client', safety: 'SAFE_PROBE' },
      });
      const { verdict } = ask(trace, 'create');
      expect(verdict.status).toBe('rejected');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// clients.error — the silence that must hold
// ---------------------------------------------------------------------------

describe('clients.error', () => {
  it('offers nothing to observe, so nothing is claimed', async () => {
    // Round 4 through Round 7 all scored this 0, and every round the right
    // answer was to say nothing. A runtime harness is exactly the tool that
    // could be used to invent a recovery story here, so this is the test that
    // says it must not be.
    const app = await mountApp({ route: '/clients' });
    try {
      await app.settle();
      const snapshot = app.snapshot('clients');
      // The fixture's happy path renders no error at all.
      expect(snapshot.elements.find((e) => e.semanticId === 'clients.error')).toBeUndefined();
      expect(app.find('clients.error')).toBeNull();
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// api.get.partial-clients — the negative control
// ---------------------------------------------------------------------------

describe('api.get.partial-clients', () => {
  it('has no runtime surface, and runtime evidence is not forced onto it', async () => {
    // §30's negative control. A browser cannot help a feature that has no
    // interface, and a subsystem that produced evidence for it anyway would be
    // producing evidence about nothing.
    const app = await mountApp({ route: '/clients' });
    try {
      await app.settle();
      const snapshot = app.snapshot('clients');
      const anything = snapshot.elements.find((element) => element.semanticId?.startsWith('api.'));
      expect(anything).toBeUndefined();
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// invoices.list.open — the rule that was not a rule
// ---------------------------------------------------------------------------

describe('invoices.list.open', () => {
  /**
   * The one false claim this loop produced, and the reason it produced it.
   *
   * `select` was written as *"something appeared, or the route changed"* — a
   * disjunction so wide that almost every click on earth satisfies it. It duly
   * verified this control and put **"Lets you select an invoice."** into a
   * review package, while what the control actually does is leave the invoice
   * list and show a *client*.
   *
   * A rule that cannot fail is not a check, so it now requires a selection to be
   * observable *and* the user to have stayed put. That refuses this control, and
   * the refusal is correct: nothing here selects anything a browser can see.
   */
  it('is not a selection, whatever the identifier says', async () => {
    const app = await mountApp({ route: '/invoices' });
    try {
      const trace = await probe({
        app,
        traceId: 'select-guard',
        action: {
          kind: 'click',
          targetSemanticId: 'invoices.list.open',
          safety: 'SAFE_PROBE',
        },
      });

      const { verdict } = ask(trace, 'select');
      expect(verdict.status).toBe('rejected');
      if (verdict.status !== 'rejected') return;
      expect(verdict.reason).toBe('NAVIGATION_OCCURRED');

      // And what it *did* do is a plain route change, which the navigate rule
      // was always able to see. The evidence was never the problem.
      const route = trace.observedEffects.find((effect) => effect.kind === 'ROUTE_CHANGED');
      expect(route).toBeDefined();
      expect(ask(trace, 'navigate').verdict.status).toBe('verified');
    } finally {
      app.destroy();
    }
  });

  /**
   * The local `navigate` trap, seen from the other side.
   *
   * `InvoiceList` defines a function called `navigate` that routes nowhere — it
   * parks a string in local state — and `clearSelection` calls it with a
   * route-shaped literal specifically so a name-keyed static extractor will
   * report a navigation that does not happen. A browser is not fooled: nothing
   * moves, and nothing observable changes, so the capability is refused.
   */
  it('refuses the clear control, because the trap moves nothing', async () => {
    const app = await mountApp({ route: '/invoices' });
    try {
      const trace = await probe({
        app,
        traceId: 'clear-guard',
        action: {
          kind: 'click',
          targetSemanticId: 'invoices.list.clear',
          safety: 'SAFE_PROBE',
        },
      });
      expect(trace.observedEffects.some((effect) => effect.kind === 'ROUTE_CHANGED')).toBe(false);
      expect(ask(trace, 'navigate').verdict.status).toBe('rejected');
      expect(ask(trace, 'clear_selection').verdict.status).toBe('rejected');
    } finally {
      app.destroy();
    }
  });
});

// ---------------------------------------------------------------------------
// Closed Loop #11 — the real traces, against the corrected semantics
// ---------------------------------------------------------------------------

describe('clients.create, as a regression', () => {
  /**
   * The false-positive path that was live after Closed Loop #10.
   *
   * Clicking **New client** opens a dialog inside the clients `<section>`. Under
   * the old effect vocabulary the section's child count went 6 to 7, that was
   * reported as `COLLECTION_CHANGED`, and `select` — which had just been
   * tightened to require a membership change — accepted it. A button that opens
   * a dialog verified as a selection.
   *
   * Nothing shipped on it, because no probe proposed `select` for this control.
   * That is luck, not a safeguard, which is why this is permanent.
   */
  it('opens a dialog and changes no collection, selects nothing, clears nothing', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'cl11-open-create',
        action: { kind: 'click', targetSemanticId: 'clients.create', safety: 'SAFE_PROBE' },
      });

      const kinds = trace.observedEffects.map((effect) => effect.kind);
      expect(kinds).toContain('REGION_APPEARED');
      expect(kinds).toContain('ELEMENT_APPEARED');

      // The page section gaining a dialog is not a collection changing size.
      expect(kinds).not.toContain('COLLECTION_MEMBERS_CHANGED');
      expect(kinds).not.toContain('SELECTION_CHANGED');

      expect(ask(trace, 'select').verdict.status).toBe('rejected');
      expect(ask(trace, 'clear_selection').verdict.status).toBe('rejected');

      // What it actually does is still established.
      expect(ask(trace, 'open').verdict.status).toBe('verified');
    } finally {
      app.destroy();
    }
  });
});

describe('clients.search, as the positive control', () => {
  /**
   * Proof the new rules narrow rather than silence.
   *
   * A rule that refuses everything passes every false-positive test ever
   * written. `clients.search` is the case that must survive: typing into a real
   * input, narrowing a real `<table>` from five `<tr>` rows to two.
   */
  it('still narrows a real table, and still verifies as a filter', async () => {
    const app = await mountApp({ route: '/clients' });
    try {
      const trace = await probe({
        app,
        traceId: 'cl11-filter',
        action: {
          kind: 'type',
          targetSemanticId: 'clients.search',
          safety: 'SAFE_PROBE',
          valueShape: 'Acme',
        },
        settleMs: 400,
      });

      const change = trace.observedEffects.find(
        (effect) => effect.kind === 'COLLECTION_MEMBERS_CHANGED',
      );
      expect(change, 'a real table must still report its members').toBeDefined();
      expect(change).toMatchObject({
        containerSemanticId: 'clients.table',
        collectionRole: 'table',
        memberRole: 'row',
        before: 5,
        after: 2,
      });
      expect(ask(trace, 'filter').verdict.status).toBe('verified');

      // Narrowing a list is not picking from it.
      expect(ask(trace, 'select').verdict.status).toBe('rejected');
    } finally {
      app.destroy();
    }
  });
});

describe('invoices.list, and what the interface never says', () => {
  /**
   * The fixture marks its selected row with a CSS class and nothing else.
   *
   * `InvoiceList` sets `className="is-active"` on the chosen `<li>`. There is no
   * `aria-selected`, no `aria-activedescendant`, no native selected state — so
   * the application tells assistive technology nothing about having a selection,
   * and the runtime is in exactly the same position. Reading the class would
   * mean treating an implementation detail as a declaration, which is the
   * substitution Closed Loop #8 removed from titles.
   *
   * So the honest answer is that selection here is unobservable, and both
   * capabilities are refused. That is a finding about the application, not a gap
   * in the observer.
   */
  it('exposes no declared selection state, so neither capability can be claimed', async () => {
    const app = await mountApp({ route: '/invoices' });
    try {
      const open = await probe({
        app,
        traceId: 'cl11-open-invoice',
        action: { kind: 'click', targetSemanticId: 'invoices.list.open', safety: 'SAFE_PROBE' },
      });
      expect(open.observedEffects.map((e) => e.kind)).not.toContain('SELECTION_CHANGED');
      expect(ask(open, 'select').verdict.status).toBe('rejected');

      const clear = await probe({
        app,
        traceId: 'cl11-clear-invoice',
        action: { kind: 'click', targetSemanticId: 'invoices.list.clear', safety: 'SAFE_PROBE' },
      });
      expect(clear.observedEffects.map((e) => e.kind)).not.toContain('SELECTION_CHANGED');
      // The label reads "Clear selection". Naming is not proof.
      expect(ask(clear, 'clear_selection').verdict.status).toBe('rejected');
    } finally {
      app.destroy();
    }
  });
});
