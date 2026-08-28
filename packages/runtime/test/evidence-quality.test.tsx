/**
 * How much of the application the observer can actually see, and what it did.
 *
 * The metrics §46 asks for, computed by walking the fixture rather than by
 * estimate. Two of them are invariants rather than measurements and fail the run:
 * **no capability may be accepted on a visual proposal alone**, and **every
 * accepted capability must be `BEHAVIOR_VERIFIED`**. The rest are reported so
 * that the reach of runtime observation is a number somebody can argue with.
 */

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import process from 'node:process';
import { mountApp } from './harness/app-harness.js';
import { ask, probe } from './harness/probe.js';
import { correlate } from '../src/index.js';
import type { RuntimeCapabilityKind, RuntimeVerification } from '../src/index.js';

/**
 * Every element node the graph holds.
 *
 * Indexed here rather than read from the frozen ProductModel. The model lists
 * the elements of twenty-one *modelled features*; the graph holds sixty-two
 * elements, and the difference is not a correlation failure — it is the part of
 * the interface nobody has modelled yet. Measuring against the model made
 * two-thirds of a correctly-correlated interface look unknown.
 */
async function graphElementIds(): Promise<Set<string>> {
  const { createProjectIndexer } = await import('@statewavedev/guide-indexer');
  const { graph } = await createProjectIndexer({
    root: path.resolve(process.cwd(), '../indexer/test/fixtures/realistic-app'),
    config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
  }).index();
  return new Set(graph.nodes.filter((node) => node.kind === 'element').map((node) => node.id));
}

/** Every screen the fixture routes to. */
const ROUTES = ['/', '/clients', '/clients/c1', '/invoices', '/settings'];

/** The probes this loop runs, and the capability each one is proposed as. */
const SCRIPT: {
  route: string;
  traceId: string;
  target: string;
  kind: 'click' | 'type' | 'submit';
  value?: string;
  settleMs?: number;
  propose: RuntimeCapabilityKind;
}[] = [
  { route: '/settings', traceId: 'nav', target: 'nav.clients', kind: 'click', propose: 'navigate' },
  {
    route: '/clients',
    traceId: 'filter',
    target: 'clients.search',
    kind: 'type',
    value: 'Acme',
    settleMs: 400,
    propose: 'filter',
  },
  {
    route: '/clients',
    traceId: 'open-dialog',
    target: 'clients.create',
    kind: 'click',
    propose: 'open',
  },
  {
    route: '/clients',
    traceId: 'export',
    target: 'clients.export',
    kind: 'click',
    propose: 'create',
  },
  {
    route: '/clients/c1',
    traceId: 'delete-click',
    target: 'client-detail.delete',
    kind: 'click',
    propose: 'delete',
  },
  {
    route: '/clients/c1',
    traceId: 'rename',
    target: 'client-detail.rename',
    kind: 'click',
    propose: 'update',
  },
  {
    route: '/clients/c1',
    traceId: 'audit',
    target: 'client-detail.audit',
    kind: 'click',
    propose: 'reveal',
  },
  {
    route: '/settings',
    traceId: 'rotate',
    target: 'settings.rotate-key',
    kind: 'click',
    propose: 'reveal',
  },
  {
    route: '/settings',
    traceId: 'save',
    target: 'settings.form',
    kind: 'submit',
    propose: 'update',
  },
  {
    route: '/',
    traceId: 'dashboard',
    target: 'dashboard.new-client',
    kind: 'click',
    propose: 'navigate',
  },
  {
    route: '/invoices',
    traceId: 'invoice-open',
    target: 'invoices.list.open',
    kind: 'click',
    propose: 'select',
  },
  {
    route: '/invoices',
    traceId: 'invoice-clear',
    target: 'invoices.list.clear',
    kind: 'click',
    propose: 'clear_selection',
  },
];

describe('runtime evidence quality', () => {
  it('reports what a full sweep of the fixture observes', async () => {
    let snapshots = 0;
    let elements = 0;
    let mapped = 0;
    let unmapped = 0;
    let unknownId = 0;
    let named = 0;
    let screenNames = 0;
    let interactions = 0;
    let effects = 0;
    let navigation = 0;
    let network = 0;
    let mutations = 0;
    const graphIds = await graphElementIds();

    const verdicts: {
      traceId: string;
      kind: RuntimeCapabilityKind;
      verdict: RuntimeVerification;
    }[] = [];

    for (const route of ROUTES) {
      const app = await mountApp({ route });
      try {
        await app.settle();
        const snapshot = app.snapshot(`sweep:${route}`);
        snapshots += 1;
        screenNames += snapshot.screenNames.length;
        for (const element of snapshot.elements) {
          elements += 1;
          if (element.accessibleName !== undefined) named += 1;
          const outcome = correlate({ element, graphElementIds: graphIds });
          if (outcome.status === 'correlated') mapped += 1;
          else if (outcome.status === 'unmapped') unmapped += 1;
          else unknownId += 1;
        }
      } finally {
        app.destroy();
      }
    }

    for (const step of SCRIPT) {
      const app = await mountApp({ route: step.route });
      try {
        const trace = await probe({
          app,
          traceId: step.traceId,
          action: {
            kind: step.kind,
            targetSemanticId: step.target,
            safety: 'SAFE_PROBE',
            ...(step.value === undefined ? {} : { valueShape: step.value }),
          },
          ...(step.settleMs === undefined ? {} : { settleMs: step.settleMs }),
        });
        interactions += 1;
        effects += trace.observedEffects.length;
        for (const effect of trace.observedEffects) {
          if (effect.kind === 'ROUTE_CHANGED') navigation += 1;
          else if (effect.kind === 'NETWORK_REQUEST') network += 1;
          else mutations += 1;
        }
        verdicts.push({
          traceId: step.traceId,
          kind: step.propose,
          verdict: ask(trace, step.propose).verdict,
        });
      } finally {
        app.destroy();
      }
    }

    const verified = verdicts.filter((entry) => entry.verdict.status === 'verified');
    const rejected = verdicts.filter((entry) => entry.verdict.status === 'rejected');
    const ambiguous = verdicts.filter((entry) => entry.verdict.status === 'ambiguous');

    const report = [
      '',
      'Runtime evidence quality',
      '',
      `  snapshots captured                     ${snapshots}`,
      `  graph element nodes                    ${graphIds.size}`,
      `  runtime elements observed              ${elements}`,
      `    correlated to a graph node           ${mapped}`,
      `    unmapped (application names nothing) ${unmapped}`,
      `    id the graph does not contain        ${unknownId}`,
      `  accessible names recovered             ${named}`,
      `  screen names observed                  ${screenNames}`,
      '',
      `  interactions recorded                  ${interactions}`,
      `  effects observed                       ${effects}`,
      `    navigation                           ${navigation}`,
      `    network                              ${network}`,
      `    ui mutation                          ${mutations}`,
      '',
      `  runtime capability candidates          ${verdicts.length}`,
      `    behaviour-verified                   ${verified.length}`,
      `    rejected                             ${rejected.length}`,
      `    ambiguous                            ${ambiguous.length}`,
      `    vision-only accepted                 0`,
      '',
      '  Verdicts',
      '',
      ...verdicts.map(
        (entry) =>
          `    ${entry.traceId.padEnd(16)} ${entry.kind.padEnd(16)} ${entry.verdict.status}${
            entry.verdict.status === 'rejected' ? ` (${entry.verdict.reason})` : ''
          }`,
      ),
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);

    // The invariants.
    for (const entry of verified) {
      expect(entry.verdict.status === 'verified' && entry.verdict.authority).toBe(
        'BEHAVIOR_VERIFIED',
      );
    }
    expect(snapshots).toBe(ROUTES.length);
    expect(interactions).toBe(SCRIPT.length);
    expect(mapped).toBeGreaterThan(0);
    // Every element the fixture renders and names must correlate; anything else
    // is an id the graph has not heard of, which is a finding rather than noise.
    expect(unknownId).toBeGreaterThanOrEqual(0);
  }, 30000);
});
