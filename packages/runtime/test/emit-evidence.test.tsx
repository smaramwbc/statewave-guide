/**
 * The behaviour-verified record, as a committed artefact.
 *
 * A build script cannot mount a React tree, and a DOM harness cannot be a build
 * script. So the eight capabilities Closed Loop #9 verified travel between them
 * as a file: produced here, hashed, committed, and read by the Round 8 builder.
 *
 * That is also what makes a runtime-backed claim **replayable and perishable**.
 * The record carries the hash of the graph it was correlated against and the
 * hash of its own normalised evidence, so a claim that rests on it can be shown
 * to rest on *this* observation of *this* application — and can go stale when
 * either changes. A runtime fact with no expiry would be the one kind of
 * evidence in this system that nothing could ever falsify.
 *
 * The file is written only under `RUNTIME_EVIDENCE_UPDATE=1`. A test that wrote
 * to the repository on every run would be the `--check` defect from Closed Loop
 * #8 again, where a gate quietly rewrote the evidence it was checking; here the
 * default run *compares* and fails on a difference.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { mountApp } from './harness/app-harness.js';
import { ask, probe } from './harness/probe.js';
import type { RuntimeCapabilityKind } from '../src/index.js';

const ARTEFACT = path.resolve(
  process.cwd(),
  '../../benchmarks/provider-reality-check/runtime-evidence-v1.json',
);

/**
 * The probe script, and what each interaction is proposed as.
 *
 * Fixed and ordered, because the artefact's determinism is the artefact's whole
 * value. Adding a probe changes the hash, which is the intended signal.
 */
const SCRIPT: {
  route: string;
  traceId: string;
  featureId: string;
  target: string;
  kind: 'click' | 'type' | 'submit';
  value?: string;
  settleMs?: number;
  propose: RuntimeCapabilityKind;
}[] = [
  {
    route: '/settings',
    traceId: 'nav-clients',
    featureId: 'nav.clients',
    target: 'nav.clients',
    kind: 'click',
    propose: 'navigate',
  },
  {
    route: '/clients',
    traceId: 'filter-clients',
    featureId: 'clients.search',
    target: 'clients.search',
    kind: 'type',
    value: 'Acme',
    settleMs: 400,
    propose: 'filter',
  },
  {
    route: '/clients',
    traceId: 'open-create',
    featureId: 'clients.create',
    target: 'clients.create',
    kind: 'click',
    propose: 'open',
  },
  {
    route: '/clients',
    traceId: 'export',
    featureId: 'clients.export',
    target: 'clients.export',
    kind: 'click',
    propose: 'create',
  },
  {
    route: '/clients/c1',
    traceId: 'delete',
    featureId: 'client-detail.delete',
    target: 'client-detail.delete',
    kind: 'click',
    propose: 'delete',
  },
  {
    route: '/clients/c1',
    traceId: 'rename',
    featureId: 'client-detail.rename',
    target: 'client-detail.rename',
    kind: 'click',
    propose: 'update',
  },
  {
    route: '/clients/c1',
    traceId: 'audit',
    featureId: 'client-detail.audit',
    target: 'client-detail.audit',
    kind: 'click',
    propose: 'reveal',
  },
  {
    route: '/settings',
    traceId: 'rotate',
    featureId: 'settings.rotate-key',
    target: 'settings.rotate-key',
    kind: 'click',
    propose: 'reveal',
  },
  {
    route: '/settings',
    traceId: 'save-settings',
    featureId: 'settings.form',
    target: 'settings.form',
    kind: 'submit',
    propose: 'update',
  },
  {
    route: '/',
    traceId: 'dashboard-new',
    featureId: 'dashboard.new-client',
    target: 'dashboard.new-client',
    kind: 'click',
    propose: 'navigate',
  },
  {
    route: '/invoices',
    traceId: 'open-invoice',
    featureId: 'invoices.list.open',
    target: 'invoices.list.open',
    kind: 'click',
    propose: 'select',
  },
  {
    route: '/invoices',
    traceId: 'clear-invoice',
    featureId: 'invoices.list.clear',
    target: 'invoices.list.clear',
    kind: 'click',
    propose: 'clear_selection',
  },
];

/** An effect as the integration layer reads it: `KIND|detail`. */
function serialiseEffect(effect: Record<string, unknown>): string {
  const rest = Object.entries(effect)
    .filter(([key]) => key !== 'kind')
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(',');
  return `${String(effect['kind'])}|${rest}`;
}

const hash = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function collect(): Promise<Record<string, unknown>> {
  const records: Record<string, unknown>[] = [];
  const refusals: Record<string, unknown>[] = [];

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
      const { verdict } = ask(trace, step.propose);
      const effects = trace.observedEffects.map((effect) =>
        serialiseEffect(effect as unknown as Record<string, unknown>),
      );

      if (verdict.status !== 'verified') {
        refusals.push({
          traceId: step.traceId,
          featureId: step.featureId,
          proposed: step.propose,
          status: verdict.status,
          reason: verdict.status === 'rejected' ? verdict.reason : 'AMBIGUOUS',
          detail: verdict.detail,
        });
        continue;
      }

      records.push({
        action: step.propose,
        featureId: step.featureId,
        subjectRef: `element:${step.target}`,
        targets: [`element:${step.target}`],
        // What was actually *done*, read off the trace rather than off the
        // capability. Without these two fields a downstream reader knows a
        // `reveal` capability was verified and has no way to learn whether a
        // human clicked, typed or submitted to get it — so the Round 8 review
        // instrument guessed, and told a reviewer that a key was rotated by
        // "typing into" a button. A record that cannot say what was done cannot
        // support a sentence about what was done.
        //
        // No verification rule reads these. They are recording, not evidence.
        actionKind: trace.action.kind,
        actionTarget: `element:${trace.action.targetSemanticId}`,
        effects,
        rule: `runtime/${step.propose}`,
        context: trace.afterSnapshot.context,
        traceId: step.traceId,
        evidenceHash: hash({ before: trace.beforeSnapshot, after: trace.afterSnapshot, effects }),
        // Filled in by the caller, which knows the graph.
        graphHash: '',
      });
    } finally {
      app.destroy();
    }
  }

  return { version: 1, records, refusals };
}

describe('runtime evidence artefact', () => {
  it('matches the committed record, or updates it under --update', async () => {
    const { createProjectIndexer } = await import('@statewavedev/guide-indexer');
    const { graph } = await createProjectIndexer({
      root: path.resolve(process.cwd(), '../indexer/test/fixtures/realistic-app'),
      config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
    }).index();
    const graphHash = hash({ nodes: graph.nodes, relationships: graph.relationships });

    const collected = await collect();
    for (const record of collected['records'] as Record<string, unknown>[]) {
      record['graphHash'] = graphHash;
    }
    const artefact = { ...collected, graphHash };
    const serialised = `${JSON.stringify(artefact, null, 2)}\n`;

    // An environment variable rather than a flag: vitest workers do not receive
    // the runner's argv, so a `--update` flag would look like it worked and
    // silently never write.
    if (process.env['RUNTIME_EVIDENCE_UPDATE'] === '1') {
      writeFileSync(ARTEFACT, serialised);
      return;
    }

    const committed = readFileSync(ARTEFACT, 'utf8');
    // A difference means the fixture, the harness or the rules moved. The claim
    // that rests on this evidence has to be regenerated, not quietly rebased.
    expect(serialised).toBe(committed);
  }, 40000);
});
