/**
 * Ten ways to make the guide point at the wrong thing, or say too much.
 *
 * The distinction under test: **`invoice` is a product concept and `INV-001` is
 * a runtime instance.** The first is compiled from verified evidence and lives
 * in the ProductModel. The second is observed, belongs to one snapshot, and must
 * never end up in it. Each test below removes one guard and expects a refusal.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createGuideQueryEngine } from '../src/query/engine.js';
import {
  conceptNounsOnRoute,
  isDisplayableInstanceName,
  redactContextForDiagnostics,
  resolveRuntimeChoices,
} from '../src/query/instances.js';
import type { GuideKnowledgeBundle } from '../src/query/bundle.js';
import type { RuntimeInstanceRef } from '../src/query/contract.js';

const bundle = JSON.parse(
  readFileSync(path.join(import.meta.dirname, 'fixtures', 'guide-bundle.json'), 'utf8'),
) as GuideKnowledgeBundle;
const guide = createGuideQueryEngine({ bundle });
const V = bundle.applicationVersion;

const row = (name: string, ref: string, route = '/invoices'): RuntimeInstanceRef => ({
  semanticId: 'invoices.list.open',
  ref,
  containerSemanticId: 'invoices.list.row',
  runtimeAccessibleName: name,
  ownerFeatureId: 'invoices.list.open',
  route,
});

const ask = (instances: RuntimeInstanceRef[], extra: Record<string, unknown> = {}) =>
  guide.query({
    query: 'How do I open an invoice?',
    context: {
      route: '/invoices',
      applicationVersion: V,
      visibleSemanticIds: ['invoices.list.open'],
      runtimeInstances: instances,
      ...extra,
    },
    developer: true,
  });

describe('A. two instances become a contextual choice', () => {
  it('offers the things on screen instead of picking one', () => {
    const response = ask([row('INV-001', 'a'), row('INV-002', 'b')]);
    expect(response.status).toBe('AMBIGUOUS');
    expect(response.runtimeChoices?.map((choice) => choice.label)).toEqual(['INV-001', 'INV-002']);
    // No sentence is written about them. Nothing verified says what they are.
    expect(response.answer).toBeUndefined();
  });

  it('labels them with the runtime name exactly, undecorated', () => {
    const response = ask([row('INV-001', 'a'), row('INV-002', 'b')]);
    for (const choice of response.runtimeChoices ?? []) {
      expect(choice.label).toMatch(/^INV-00[12]$/);
      expect(choice.label).not.toContain('Invoice');
    }
  });
});

describe('B/C. a chosen instance is the one pointed at', () => {
  for (const [label, ref] of [
    ['INV-001', 'a'],
    ['INV-002', 'b'],
  ] as const) {
    it(`${label} produces actions carrying its own handle`, () => {
      const response = ask([row('INV-001', 'a'), row('INV-002', 'b')], {
        selectedInstanceRef: ref,
      });
      expect(response.status).toBe('ANSWERED');
      expect(response.actions.length).toBeGreaterThan(0);
      for (const action of response.actions) {
        expect(['scroll', 'highlight']).toContain(action.kind);
        // The semantic id is shared by both rows, so the handle is what
        // distinguishes them. Without it the executor takes the first match.
        expect('instanceRef' in action ? action.instanceRef : undefined).toBe(ref);
        expect('label' in action ? action.label : undefined).toBe(label);
      }
    });
  }

  it('never emits an action that operates the application', () => {
    const response = ask([row('INV-001', 'a'), row('INV-002', 'b')], { selectedInstanceRef: 'a' });
    for (const action of response.actions) {
      expect(['navigate', 'highlight', 'scroll', 'focus', 'open_guide_step']).toContain(
        action.kind,
      );
    }
  });
});

describe('D. an instance that is not there', () => {
  it('asks again rather than choosing something else', () => {
    const response = ask([row('INV-001', 'a'), row('INV-002', 'b')], {
      selectedInstanceRef: 'inv-999',
    });
    // The reference resolves to nothing, so the choice is offered again. It
    // never degrades into "the first invoice".
    expect(response.status).toBe('AMBIGUOUS');
    expect(response.actions).toEqual([]);
  });

  it('says nothing about a name that was never observed', () => {
    const response = guide.query({
      query: 'Show me INV-999',
      context: {
        route: '/invoices',
        applicationVersion: V,
        runtimeInstances: [row('INV-001', 'a')],
      },
    });
    expect(JSON.stringify(response)).not.toContain('INV-999');
  });
});

describe('E. a name is not identity', () => {
  it('refuses when two things on screen answer to the same name', () => {
    const response = ask([row('INV-001', 'a'), row('INV-001', 'b')]);
    expect(response.runtimeChoices ?? []).toEqual([]);
    const refusals = response.diagnostics?.refusals.map((entry) => entry.reason) ?? [];
    expect(refusals).toContain('AMBIGUOUS_NAMES');
  });
});

describe('F. names that may not be shown', () => {
  it('keeps secret shapes out of the choices and out of diagnostics', () => {
    const secrets = [
      'sk_live_9f2a71b3c4d5',
      'Bearer abc123def456',
      'a3f5c9d1e7b2048fa3f5c9d1e7b2048f',
      'eyJhbGciOi.eyJzdWIi',
      'hunter2password',
    ];
    for (const secret of secrets) {
      const response = ask([row(secret, 'a'), row('INV-002', 'b')]);
      expect(JSON.stringify(response)).not.toContain(secret);
    }
  });

  it('does not redact a control somebody labelled', () => {
    // `Reset password` is a button; `hunter2password` is a value that happens to
    // be rendered. Whitespace is the only signal available without reading it.
    expect(isDisplayableInstanceName('Reset password')).toBe(true);
    expect(isDisplayableInstanceName('Change password settings')).toBe(true);
    expect(isDisplayableInstanceName('hunter2password')).toBe(false);
  });

  it('leaves an unnameable instance addressable, only unlabelled', () => {
    const context = {
      route: '/invoices',
      runtimeInstances: [row('sk_live_9f2a71b3c4d5', 'a')],
    };
    const redacted = redactContextForDiagnostics(context);
    expect(redacted.runtimeInstances?.[0]?.runtimeAccessibleName).toBe('[redacted]');
    // Identity survives; only the name is withheld.
    expect(redacted.runtimeInstances?.[0]?.ref).toBe('a');
    expect(redacted.runtimeInstances?.[0]?.semanticId).toBe('invoices.list.open');
  });
});

describe('G/H. an instance belongs to a moment', () => {
  it('refuses a reference from another snapshot', () => {
    const stale = { ...row('INV-001', 'a'), snapshotId: 'snapshot-1' };
    const response = ask([stale], { snapshotId: 'snapshot-2' });
    const refusals = response.diagnostics?.refusals.map((entry) => entry.reason) ?? [];
    expect(refusals).toContain('STALE_SNAPSHOT');
  });

  it('does not carry an instance across a route change', () => {
    const response = guide.query({
      query: 'How do I open an invoice?',
      context: {
        route: '/settings',
        applicationVersion: V,
        runtimeInstances: [row('INV-001', 'a'), row('INV-002', 'b')],
        selectedInstanceRef: 'a',
      },
      developer: true,
    });
    // The instances describe `/invoices`; the user is on `/settings`.
    expect(response.actions).toEqual([]);
  });
});

describe('I. a provider cannot invent an instance', () => {
  it('offers only what runtime evidence contains', () => {
    const engine = createGuideQueryEngine({
      bundle,
      provider: { classify: () => 'SHOW_ME', chooseCandidate: () => 'INV-999' },
    });
    const response = engine.query({
      query: 'How do I open an invoice?',
      context: {
        route: '/invoices',
        applicationVersion: V,
        runtimeInstances: [row('INV-001', 'a'), row('INV-002', 'b')],
      },
    });
    const labels = response.runtimeChoices?.map((choice) => choice.label) ?? [];
    expect(labels).toEqual(['INV-001', 'INV-002']);
    expect(labels).not.toContain('INV-999');
  });
});

describe('J. an instance is never product truth', () => {
  it('appears in no feature, control, step or concept in the bundle', () => {
    const serialised = JSON.stringify(bundle);
    for (const name of ['INV-001', 'INV-002', 'INV-999']) {
      expect(serialised).not.toContain(name);
    }
  });

  it('leaves the bundle untouched after a full choose-and-point interaction', () => {
    const before = JSON.stringify(bundle);
    ask([row('INV-001', 'a'), row('INV-002', 'b')]);
    ask([row('INV-001', 'a'), row('INV-002', 'b')], { selectedInstanceRef: 'b' });
    expect(JSON.stringify(bundle)).toBe(before);
  });
});

describe('the concept has to be earned, and on this screen', () => {
  it('knows "invoice" only where a verified claim establishes it', () => {
    expect([...conceptNounsOnRoute(bundle, '/invoices')]).toContain('invoice');
    // Same rows render here, and nothing on this screen speaks for them. The
    // component is called `InvoiceList` and the ids begin `invoices.`; neither
    // is evidence, which is the whole rule.
    expect([...conceptNounsOnRoute(bundle, '/clients/c1')]).not.toContain('invoice');
  });

  it('refuses instances on a screen where the concept is not established', () => {
    const response = guide.query({
      query: 'How do I open an invoice?',
      context: {
        route: '/clients/c1',
        applicationVersion: V,
        runtimeInstances: [
          row('INV-001', 'a', '/clients/:clientId'),
          row('INV-002', 'b', '/clients/:clientId'),
        ],
      },
      developer: true,
    });
    expect(response.runtimeChoices ?? []).toEqual([]);
    expect(response.diagnostics?.refusals.map((entry) => entry.reason)).toContain(
      'CONCEPT_NOT_ESTABLISHED_HERE',
    );
  });

  it('offers nothing for a word this product never earned', () => {
    const resolution = resolveRuntimeChoices(bundle, 'How do I open a purchase order?', {
      route: '/invoices',
      runtimeInstances: [row('INV-001', 'a'), row('INV-002', 'b')],
    });
    expect(resolution.refusal).toBe('NO_CONCEPT_IN_QUERY');
  });
});
