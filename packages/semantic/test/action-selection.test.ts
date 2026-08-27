/**
 * Whether verified actions actually reach the guide.
 *
 * Closed Loop #4 solved the language problem and created a selection one. An
 * independent review of the result scored fourteen of twenty-one features at 0
 * or 1, and ten of those were a single defect: a verified `workflow_step` claim
 * naming its subject as `feature:<id>` rather than as a graph node. `roleOf()`
 * looked the id up in the graph, found nothing, fell through to `result`, and
 * dropped the step. What a reader saw was *"Open Settings."* and nothing else.
 *
 * The tests below pin the invariant rather than the wording:
 *
 * > If a verified action claim has a resolvable, feature-owned, user-actionable
 * > target, the guide contains the corresponding action.
 *
 * And, just as importantly, its converse. `settings.new-key` displays a rotated
 * key and `dashboard.new-client` carries no behaviour edge at all; neither may
 * acquire an action because the score would look better with one. A test suite
 * that only checked the first half would be satisfied by a compiler that
 * invented a step for everything.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createProjectIndexer } from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type { ProductModel } from '@statewavedev/guide-shared';
import { discoverFeatureCandidates } from '../src/candidates.js';
import type { FeatureCandidate } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { computeFeatureScope } from '../src/scope.js';
import { compileGuidance } from '../src/guidance/compile.js';
import type { GuidanceDocument } from '../src/guidance/ir.js';
import { realiseInstruction } from '../src/guidance/realise.js';
import { isActionableNode, resolveActionTarget } from '../src/guidance/action-target.js';

const BENCH = new URL('../../../benchmarks/provider-reality-check/', import.meta.url).pathname;
const FIXTURE = new URL('../../indexer/test/fixtures/realistic-app', import.meta.url).pathname;

let model: ProductModel;
let graph: ApplicationGraph;
let candidates: FeatureCandidate[];
const documents = new Map<string, GuidanceDocument>();

beforeAll(async () => {
  model = JSON.parse(readFileSync(`${BENCH}round-2-product-model.json`, 'utf8')).model;
  graph = (
    await createProjectIndexer({
      root: FIXTURE,
      config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
    }).index()
  ).graph;
  candidates = [...discoverFeatureCandidates(graph)];
  for (const feature of model.features) {
    const candidate = candidates.find((entry) => entry.id === feature.id);
    if (candidate === undefined) continue;
    const pack = buildEvidencePack(graph, candidate);
    const scope = computeFeatureScope({
      featureId: feature.id,
      roots: candidate.rootNodes,
      nodes: pack.nodes,
      relationships: pack.relationships,
    });
    documents.set(feature.id, compileGuidance({ model, feature, graph, candidate, scope }));
  }
});

function docFor(featureId: string): GuidanceDocument {
  const found = documents.get(featureId);
  if (found === undefined) throw new Error(`no document for ${featureId}`);
  return found;
}

/** The steps a user is told to perform, excluding the synthesised entry. */
function taskSteps(featureId: string): string[] {
  return docFor(featureId)
    .steps.filter((step) => step.origin !== 'synthetic-entry')
    .map((step) => realiseInstruction(step.proposition) ?? '');
}

function allSteps(featureId: string): string[] {
  return docFor(featureId).steps.map((step) => realiseInstruction(step.proposition) ?? '');
}

// ---------------------------------------------------------------------------
// The ten BAD_GUIDANCE_SELECTION cases
// ---------------------------------------------------------------------------

describe('a resolvable owned control becomes an action', () => {
  // Each of these carries a verified action claim whose subject is the feature
  // itself, and a root that is a labelled control with a behaviour edge. The
  // control is what the user presses; the guide has to say so.
  const expected: [string, string][] = [
    ['clients.export', 'Export CSV'],
    ['settings.rotate-key', 'Rotate API key'],
    ['client-detail.delete', 'Delete'],
    ['client-detail.change-plan', 'Upgrade'],
    ['settings.save', 'Save changes'],
  ];

  for (const [featureId, control] of expected) {
    it(`names the ${control} control`, () => {
      const steps = taskSteps(featureId);
      expect(steps.length, `${featureId} produced no task action`).toBeGreaterThan(0);
      expect(steps.join(' ')).toContain(control);
    });

    it(`accounts for the claim behind ${control} as emitted`, () => {
      const emitted = docFor(featureId).actionAccounting.filter(
        (entry) => entry.outcome === 'emitted',
      );
      expect(emitted.length).toBeGreaterThan(0);
    });
  }
});

describe('an unresolvable target produces silence, and a reason', () => {
  // The converse, and the half that stops this from being a score-improvement
  // exercise. Neither feature may acquire an action.
  const silent: [string, string][] = [
    // A `<code>` element that displays a rotated key. Nothing to press.
    ['settings.new-key', 'read-only display'],
    // A toolbar button whose only edge is `requires_permission` — the graph
    // proves who may see it and nothing about what it does.
    ['dashboard.new-client', 'no behaviour edge'],
  ];

  for (const [featureId, why] of silent) {
    it(`invents nothing for ${featureId} (${why})`, () => {
      expect(taskSteps(featureId)).toEqual([]);
    });

    it(`records why ${featureId} has no action`, () => {
      const dropped = docFor(featureId).actionAccounting.filter(
        (entry) => entry.outcome === 'dropped',
      );
      expect(dropped.length).toBeGreaterThan(0);
      expect(dropped.every((entry) => entry.reason !== undefined)).toBe(true);
    });
  }

  it('leaves a feature with no verified claim alone', () => {
    // `clients.error` has nothing verified at all. Sparse and correct beats
    // full and invented; this is the control that keeps that true.
    expect(taskSteps('clients.error')).toEqual([]);
    expect(docFor('clients.error').summary).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Resolution rules
// ---------------------------------------------------------------------------

describe('feature subjects resolve through ownership, never through spelling', () => {
  it('refuses a feature reference whose look-alike node is not the feature root', () => {
    // The trap. A node named like the feature is not the feature's control, and
    // a matching suffix is a coincidence in a namespace rather than a fact.
    const candidate: FeatureCandidate = {
      id: 'settings.save',
      idOrigin: 'semantic-id',
      // Deliberately rooted somewhere else: the ids line up and the ownership
      // does not.
      rootNodes: ['element:settings.new-key'],
      discoveredBy: 'guide-element',
    };
    const scope = computeFeatureScope({
      featureId: 'settings.save',
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    const outcome = resolveActionTarget({
      subjectRef: 'feature:settings.save',
      candidate,
      scope,
      graph,
    });
    // `element:settings.save` exists and is actionable. It is still not this
    // candidate's, so it must not be reached.
    expect(outcome.status).not.toBe('resolved');
    if (outcome.status === 'resolved') {
      expect(outcome.target.nodeId).not.toBe('element:settings.save');
    }
  });

  it('refuses when several owned controls could be meant', () => {
    const candidate: FeatureCandidate = {
      id: 'clients',
      idOrigin: 'semantic-id',
      rootNodes: ['element:clients.create', 'element:clients.export'],
      discoveredBy: 'guide-element',
    };
    const scope = computeFeatureScope({
      featureId: 'clients',
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    const outcome = resolveActionTarget({ subjectRef: 'feature:clients', candidate, scope, graph });
    expect(outcome.status).toBe('ambiguous');
    if (outcome.status === 'ambiguous') expect(outcome.candidates).toHaveLength(2);
  });

  it('refuses another feature entirely', () => {
    const candidate = candidates.find((entry) => entry.id === 'clients.export')!;
    const scope = computeFeatureScope({
      featureId: 'clients.export',
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    const outcome = resolveActionTarget({
      subjectRef: 'feature:clients.create',
      candidate,
      scope,
      graph,
    });
    expect(outcome.status).not.toBe('resolved');
  });
});

describe('what counts as something a user can act on', () => {
  const node = (id: string) => graph.nodes.find((entry) => entry.id === id);

  it('accepts a labelled control with a behaviour edge', () => {
    expect(isActionableNode(node('element:clients.export'), graph)).toBe(true);
    expect(isActionableNode(node('element:nav.clients'), graph)).toBe(true);
  });

  it('accepts a text input, which leaves no edge when a user types in it', () => {
    expect(isActionableNode(node('element:clients.search'), graph)).toBe(true);
  });

  it('rejects a read-only display', () => {
    expect(isActionableNode(node('element:settings.new-key'), graph)).toBe(false);
    expect(isActionableNode(node('element:clients.error'), graph)).toBe(false);
  });

  it('rejects a container even when it carries the behaviour edge', () => {
    // A `<form>` has `submits_to`, and nobody presses a form. They press the
    // control inside it, which carries the same edge and has a name.
    expect(isActionableNode(node('element:settings.form'), graph)).toBe(false);
  });

  it('rejects anything that is not an element', () => {
    expect(isActionableNode(node('api:POST:/api/clients'), graph)).toBe(false);
    expect(
      isActionableNode(node('component:frontend/src/components/ClientForm.tsx#ClientForm'), graph),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Submit, duplication, entry route, field nouns
// ---------------------------------------------------------------------------

describe('submit is spoken through its control', () => {
  it('emits the action when a visible control carries it', () => {
    expect(taskSteps('settings.save').join(' ')).toContain('Save changes');
  });

  it('never names the internal verb', () => {
    for (const featureId of documents.keys()) {
      const copy = allSteps(featureId).join(' ').toLowerCase();
      expect(copy, featureId).not.toContain('submit the form');
      expect(copy, featureId).not.toMatch(/to submit a\b/);
    }
  });

  it('says nothing when a submit claim has no visible control', () => {
    // The original defect this rule was written for: without a control there is
    // no sentence that is not about the mechanism.
    const withoutControl = [...documents.values()].flatMap((document) =>
      document.actionAccounting.filter((entry) => entry.reason === 'UNSUPPORTED_PRESENTATION'),
    );
    expect(withoutControl.every((entry) => entry.detail !== undefined)).toBe(true);
  });
});

describe('one action per control', () => {
  it('does not tell a user to press the same button twice', () => {
    for (const featureId of documents.keys()) {
      const steps = allSteps(featureId);
      expect(new Set(steps).size, featureId).toBe(steps.length);
    }
  });

  it('records a de-duplicated claim rather than losing it', () => {
    const duplicates = [...documents.values()].flatMap((document) =>
      document.actionAccounting.filter((entry) => entry.reason === 'DUPLICATE_ACTION'),
    );
    expect(duplicates.length).toBeGreaterThan(0);
    expect(duplicates.every((entry) => entry.targetNodeId !== undefined)).toBe(true);
  });
});

describe('the entry screen is never chosen by sort order', () => {
  // R02 and R15. `InvoiceList` is rendered by the invoices page and by the
  // client detail page, and taking the first match told users to open the
  // client detail page to clear an invoice selection.
  for (const featureId of ['invoices.list.open', 'invoices.list.clear']) {
    it(`does not send ${featureId} to another feature's screen`, () => {
      expect(allSteps(featureId).join(' ')).not.toContain('Client Detail');
    });

    it(`records the ambiguity for ${featureId} instead of guessing`, () => {
      const codes = docFor(featureId).diagnostics.map((entry) => entry.code);
      expect(codes).toContain('ENTRY_ROUTE_AMBIGUOUS');
    });
  }

  it('still names a screen when only one route hosts the feature', () => {
    expect(allSteps('clients.export')[0]).toBe('Open Clients.');
  });
});

describe('field names come from labels, not from feature identifiers', () => {
  it('R10: never turns a lone unlabelled input into a possessive noun', () => {
    for (const featureId of documents.keys()) {
      expect(allSteps(featureId).join(' '), featureId).not.toContain("client's search");
    }
  });

  it('still lists the fields of a form that has several', () => {
    // The half that must not regress: `name`, `email` and `plan` are genuinely
    // what goes in those boxes.
    const steps = taskSteps('clients.create').join(' ');
    expect(steps).toContain('email');
    expect(steps).toContain('plan');
  });

  it('introduces no search capability while fixing the wording', () => {
    // The realisation fix must not become a factual claim. `capability:search`
    // stays unsupported, and a text input proves nothing about searching.
    const claims = model.claims.filter(
      (claim) => claim.featureId === 'clients.search' && claim.status === 'structurally_verified',
    );
    expect(claims.some((claim) => claim.assertion?.action === 'search')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The metric defect
// ---------------------------------------------------------------------------

describe('completeness no longer counts a synthetic entry as a user action', () => {
  it('classifies an entry-only guide as ENTRY_ONLY', () => {
    // The Round 3 metric defect, reproduced. `settings.new-key` offers a user
    // exactly one line — "Open Settings." — and was classified ACTIONABLE.
    const document = docFor('settings.new-key');
    expect(document.steps.every((step) => step.origin === 'synthetic-entry')).toBe(true);
    expect(document.completeness).toBe('ENTRY_ONLY');
    expect(document.taskCompletion).toBe('ENTRY_ONLY');
  });

  it('reserves ACTIONABLE for a real task action', () => {
    for (const document of documents.values()) {
      if (document.completeness !== 'ACTIONABLE' && document.completeness !== 'COMPLETE') continue;
      const task = document.steps.filter((step) => step.origin !== 'synthetic-entry');
      expect(task.length, document.featureId).toBeGreaterThan(0);
    }
  });

  it('marks a full path only where the task reaches its finishing action', () => {
    expect(docFor('clients.create').taskCompletion).toBe('COMPLETE_PATH');
  });
});

describe('every action claim is accounted for', () => {
  it('records an outcome for each, and a reason for each drop', () => {
    for (const document of documents.values()) {
      for (const entry of document.actionAccounting) {
        expect(entry.claimId.length, document.featureId).toBeGreaterThan(0);
        if (entry.outcome === 'dropped') {
          expect(entry.reason, `${document.featureId} ${entry.claimId}`).toBeDefined();
        }
      }
    }
  });

  it('emits every resolvable, non-duplicate, sayable claim', () => {
    // The retention invariant, and the denominator matters. A claim that
    // resolved to a control, is not a duplicate of another, and can be phrased
    // must appear in the guide.
    //
    // `UNSUPPORTED_PRESENTATION` is excluded because those three conditions are
    // not the same one. `clients.search` resolves its only workflow step to the
    // search box — a real control, owned, actionable — and the box carries no
    // text a reader could look for. Naming it means naming it from the
    // identifier, which produced "Enter the client's search". Resolvable is not
    // sayable, and pretending otherwise is how that sentence shipped.
    //
    // The exclusion is bounded by the test below rather than left open.
    for (const document of documents.values()) {
      const lost = document.actionAccounting.filter(
        (entry) =>
          entry.outcome === 'dropped' &&
          entry.targetNodeId !== undefined &&
          entry.reason !== 'DUPLICATE_ACTION' &&
          entry.reason !== 'UNSUPPORTED_PRESENTATION',
      );
      expect(
        lost.map((entry) => entry.claimId),
        document.featureId,
      ).toEqual([]);
    }
  });

  it('keeps the unsayable set to the cases that are genuinely unsayable', () => {
    // The bound on the exclusion above. If a future change starts dropping
    // resolvable claims as "unsayable", this fails and names them.
    const unsayable = [...documents.values()]
      .flatMap((document) =>
        document.actionAccounting
          .filter(
            (entry) =>
              entry.reason === 'UNSUPPORTED_PRESENTATION' && entry.targetNodeId !== undefined,
          )
          .map((entry) => entry.claimId),
      )
      .sort();
    // Two, and the second is Closed Loop #8's doing. `invoices.list.open`
    // resolves to a real owned button whose visible text is `{invoice.number}` —
    // a name that exists and changes per row. Round 6 called it `Open` from the
    // identifier and sent a reviewer looking for a control that is not there.
    // Resolvable is not sayable, and a dynamic name is the clearest case of it.
    expect(unsayable).toEqual([
      'clients.search#workflow_step:1',
      'invoices.list.open#workflow_step:1',
    ]);
  });

  it('never drops a resolvable claim without saying so', () => {
    // The defect this loop found in the previous one's fix. `clients.search`
    // resolved, reached the input branch, produced no nameable field and left
    // no accounting entry at all — a silent drop inside the change written to
    // end silent drops. Every claim that resolves now has an outcome.
    const search = docFor('clients.search').actionAccounting;
    expect(search.map((entry) => entry.claimId)).toContain('clients.search#workflow_step:1');
    expect(search.every((entry) => entry.outcome === 'emitted' || entry.detail !== undefined)).toBe(
      true,
    );
  });
});
