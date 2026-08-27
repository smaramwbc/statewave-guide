/**
 * Whether a passive subject may borrow the control that does its work.
 *
 * Round 4 measured one variable: whether the guide names something to press.
 * Twelve features that did averaged 2.25 and every one scored 2 or better; nine
 * that said only *"Open Settings."* averaged 1.11. So the question for this loop
 * is narrow — can more already-verified controls be reached — and the danger is
 * obvious. A rule loose enough to find *Save changes* from a form is loose
 * enough to find *Rotate API key* from a section that merely sits above it, and
 * a score that rises because the compiler started guessing is worse than a score
 * that stayed where it was.
 *
 * Every test below is therefore paired. The recovery has to fire where the graph
 * proves the act, and refuse everywhere it would be inferring one from a name, a
 * screen, a source line or a sort order.
 *
 * The pivot is that the rule owns the **action**, not the control. A feature may
 * reach a button only when that button does work the feature's own scope owns —
 * which is why *Save changes* is reachable from `settings.form` (both submit to
 * `saveSettings`) and *Rotate API key* is not (nothing joins them but a page).
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CONFIDENCE,
  NODE_KINDS,
  RELATIONSHIP_TYPES,
  componentId,
  createProjectIndexer,
  createRelationship,
  elementId,
  functionId,
} from '@statewavedev/guide-indexer';
import type {
  ApplicationGraph,
  ApplicationNode,
  ApplicationNodeKind,
  Relationship,
  RelationshipType,
} from '@statewavedev/guide-indexer';
import type { ProductModel } from '@statewavedev/guide-shared';
import { discoverFeatureCandidates } from '../src/candidates.js';
import type { FeatureCandidate } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { computeFeatureScope } from '../src/scope.js';
import { compileGuidance } from '../src/guidance/compile.js';
import type { GuidanceDocument } from '../src/guidance/ir.js';
import { realiseInstruction } from '../src/guidance/realise.js';
import { recoverActionTarget } from '../src/guidance/action-recovery.js';
import { resolveActionTarget } from '../src/guidance/action-target.js';

const BENCH = new URL('../../../benchmarks/provider-reality-check/', import.meta.url).pathname;
const FIXTURE = new URL('../../indexer/test/fixtures/realistic-app', import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Synthetic topologies
// ---------------------------------------------------------------------------

const FILE = 'src/pages/Thing.tsx';
let line = 0;
const where = (): { source: 'source-code'; file: string; line: number; column: number } => {
  line += 1;
  return { source: 'source-code', file: FILE, line, column: 1 };
};

function control(id: string, label: string): ApplicationNode {
  return {
    id: elementId(id),
    kind: 'element',
    provenance: where(),
    elementId: id,
    type: 'button',
    attribute: 'data-guide',
    tagName: 'Button',
    label,
  } as ApplicationNode;
}

function formNode(id: string): ApplicationNode {
  return {
    id: elementId(id),
    kind: 'element',
    provenance: where(),
    elementId: id,
    type: 'form',
    attribute: 'data-guide',
    tagName: 'form',
  } as ApplicationNode;
}

function panel(id: string): ApplicationNode {
  return {
    id: elementId(id),
    kind: 'element',
    provenance: where(),
    elementId: id,
    type: 'other',
    attribute: 'data-guide',
    tagName: 'div',
  } as ApplicationNode;
}

function handler(name: string): ApplicationNode {
  return {
    id: functionId(FILE, name),
    kind: 'function',
    provenance: where(),
    name,
    form: 'arrow',
    exported: false,
    isAsync: true,
    parameterCount: 1,
    side: 'frontend',
  } as ApplicationNode;
}

function page(name: string): ApplicationNode {
  return {
    id: componentId(FILE, name),
    kind: 'component',
    provenance: where(),
    name,
    exported: true,
    isDefaultExport: false,
  } as ApplicationNode;
}

function edge(type: RelationshipType, source: string, target: string): Relationship {
  return createRelationship(type, source, target, CONFIDENCE.DIRECT_SYNTAX, [
    { type: 'source', file: FILE, line: 4, column: 3 },
  ]);
}

function graphOf(
  nodes: readonly ApplicationNode[],
  relationships: readonly Relationship[],
): ApplicationGraph {
  const byKind = {} as Record<ApplicationNodeKind, number>;
  for (const kind of NODE_KINDS) byKind[kind] = nodes.filter((node) => node.kind === kind).length;
  const byRelationship = {} as Record<RelationshipType, number>;
  for (const type of RELATIONSHIP_TYPES) {
    byRelationship[type] = relationships.filter((entry) => entry.type === type).length;
  }
  return {
    version: 2,
    application: 'recovery-fixture',
    nodes: [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1)),
    relationships: [...relationships].sort((a, b) => (a.id < b.id ? -1 : 1)),
    stats: { nodes: nodes.length, relationships: relationships.length, byKind, byRelationship },
    health: {
      resolvedCalls: relationships.length,
      unresolvedCalls: 0,
      resolvedApiPaths: 0,
      unresolvedApiPaths: 0,
      joinedEndpoints: 0,
      frontendOnlyEndpoints: 0,
      backendOnlyEndpoints: 0,
      integrity: 'PASS',
      danglingRelationships: [],
    },
    diagnostics: [],
  };
}

/** A candidate and the scope its roots produce, over a synthetic graph. */
function attempt(graph: ApplicationGraph, id: string, roots: string[], subjectRef: string) {
  const candidate: FeatureCandidate = {
    id,
    idOrigin: 'semantic-id',
    rootNodes: roots,
    discoveredBy: 'guide-element',
  } as FeatureCandidate;
  const scope = computeFeatureScope({
    featureId: id,
    roots,
    nodes: graph.nodes,
    relationships: graph.relationships,
  });
  return recoverActionTarget({ subjectRef, candidate, scope, graph });
}

// ---------------------------------------------------------------------------
// A · the case the loop exists for
// ---------------------------------------------------------------------------

describe('A · a form resolves to the control that submits it', () => {
  // Cancel and Save are both actionable, and only one of them does the form's
  // work. "Unique actionable descendant" would have picked whichever sorted
  // first; the rule asks which control runs the handler the form runs.
  const save = control('thing.save', 'Save changes');
  const cancel = control('thing.cancel', 'Cancel');
  const form = formNode('thing.form');
  const saveSettings = handler('saveSettings');
  const closeDialog = handler('closeDialog');
  const owner = page('ThingPage');
  const graph = graphOf(
    [save, cancel, form, saveSettings, closeDialog, owner],
    [
      edge('contains', owner.id, form.id),
      edge('contains', owner.id, save.id),
      edge('contains', owner.id, cancel.id),
      edge('submits_to', form.id, saveSettings.id),
      edge('submits_to', save.id, saveSettings.id),
      edge('invokes', cancel.id, closeDialog.id),
    ],
  );

  it('picks Save changes, not Cancel', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.target.nodeId).toBe(save.id);
    expect(outcome.target.label?.text).toBe('Save changes');
  });

  it('records the walk that justified it', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    if (outcome.status !== 'resolved') throw new Error('expected a recovery');
    expect(outcome.provenance.rule).toBe('passive-subject-shared-action-surface');
    expect(outcome.provenance.relationship).toBe('submits_to');
    expect(outcome.provenance.actionSurface).toBe(saveSettings.id);
    expect(outcome.provenance.actionSurfaceScope).toBe('OWNED');
    expect(outcome.provenance.traversed).toHaveLength(2);
    expect(outcome.provenance.why.length).toBeGreaterThan(0);
  });

  it('marks the target as recovered rather than claimed', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    if (outcome.status !== 'resolved') throw new Error('expected a recovery');
    expect(outcome.target.source).toBe('recovered-action-surface');
  });

  it('reaches the same control through a feature subject', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], 'feature:thing.form');
    expect(outcome.status).toBe('resolved');
    if (outcome.status === 'resolved') expect(outcome.target.nodeId).toBe(save.id);
  });
});

// ---------------------------------------------------------------------------
// B · two ways to finish
// ---------------------------------------------------------------------------

describe('B · two submit controls refuse rather than rank', () => {
  const save = control('thing.save', 'Save');
  const saveAndClose = control('thing.save-close', 'Save and close');
  const form = formNode('thing.form');
  const submit = handler('submitThing');
  const graph = graphOf(
    [save, saveAndClose, form, submit],
    [
      edge('submits_to', form.id, submit.id),
      edge('submits_to', save.id, submit.id),
      edge('submits_to', saveAndClose.id, submit.id),
    ],
  );

  it('is ambiguous', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    expect(outcome.status).toBe('ambiguous');
    if (outcome.status === 'ambiguous') expect(outcome.candidates).toHaveLength(2);
  });

  it('does not prefer the shorter or the first-sorted label', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    if (outcome.status !== 'ambiguous') throw new Error('expected ambiguity');
    expect(outcome.detail).toContain('sort order');
  });
});

// ---------------------------------------------------------------------------
// C · nearby is not ownership
// ---------------------------------------------------------------------------

describe('C · a button that happens to sit alongside is not the form action', () => {
  const form = formNode('thing.form');
  const submit = handler('submitThing');
  const elsewhere = control('thing.print', 'Print');
  const printer = handler('print');
  const owner = page('ThingPage');
  const graph = graphOf(
    [form, submit, elsewhere, printer, owner],
    [
      edge('contains', owner.id, form.id),
      edge('contains', owner.id, elsewhere.id),
      edge('submits_to', form.id, submit.id),
      edge('invokes', elsewhere.id, printer.id),
    ],
  );

  it('recovers nothing', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    expect(outcome.status).toBe('none');
  });

  it('says the surface had no separate control', () => {
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    if (outcome.status !== 'none') throw new Error('expected a refusal');
    expect(outcome.detail).toContain('no separate control');
  });
});

// ---------------------------------------------------------------------------
// D · ownership of the work is the requirement
// ---------------------------------------------------------------------------

describe('D · a control acting on a surface this feature does not own is refused', () => {
  const form = formNode('other.form');
  const save = control('other.save', 'Save');
  const submit = handler('submitOther');
  const mine = control('mine.button', 'Mine');
  const graph = graphOf(
    [form, save, submit, mine],
    [edge('submits_to', form.id, submit.id), edge('submits_to', save.id, submit.id)],
  );

  it('refuses when the scope is rooted elsewhere', () => {
    // The topology is identical to case A. The only difference is that this
    // feature's roots do not reach the handler, so the work is not its work —
    // and a control performing somebody else's work is a borrowed control.
    const outcome = attempt(graph, 'mine', [mine.id], form.id);
    expect(outcome.status).not.toBe('resolved');
  });

  it('resolves the same shape when the scope does own the handler', () => {
    // The positive control for the negative one above: identical graph, roots
    // moved, outcome flips. Without this the test above passes for any reason.
    const outcome = attempt(graph, 'other.form', [form.id], form.id);
    expect(outcome.status).toBe('resolved');
  });
});

// ---------------------------------------------------------------------------
// E · names are never evidence
// ---------------------------------------------------------------------------

describe('E · a matching identifier without a shared surface is refused', () => {
  const form = formNode('thing.form');
  const lookalike = control('thing.form.submit', 'Submit');
  const mine = handler('submitThing');
  const theirs = handler('doSomethingElse');
  const graph = graphOf(
    [form, lookalike, mine, theirs],
    [edge('submits_to', form.id, mine.id), edge('submits_to', lookalike.id, theirs.id)],
  );

  it('does not take a control because its id extends the subject id', () => {
    // `thing.form.submit` reads like the submit button of `thing.form`, and the
    // graph says it submits somewhere else entirely. A namespace is a filing
    // convention; the edges are the application.
    const outcome = attempt(graph, 'thing.form', [form.id], form.id);
    expect(outcome.status).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// F · language may not manufacture behaviour
// ---------------------------------------------------------------------------

describe('F · a purpose sentence cannot create a capability', () => {
  let documents: Map<string, GuidanceDocument>;

  beforeAll(async () => {
    documents = await compileFixture();
  });

  it('does not turn "find a specific client" plus a text box into a search action', () => {
    // `clients.search` carries a grounded purpose saying the feature helps you
    // find a client, and one unlabelled `<input>` with no outgoing edge at all.
    // Between them there is no verified search behaviour, and no amount of
    // well-grounded prose supplies one.
    const document = documents.get('clients.search')!;
    const steps = document.steps
      .filter((step) => step.origin !== 'synthetic-entry')
      .map((step) => realiseInstruction(step.proposition) ?? '');
    expect(steps).toEqual([]);
    expect(document.summary).toBeUndefined();
  });

  it('never writes a search instruction anywhere in the set', () => {
    for (const [featureId, document] of documents) {
      const copy = document.steps
        .map((step) => realiseInstruction(step.proposition) ?? '')
        .join(' ')
        .toLowerCase();
      expect(copy, featureId).not.toContain('search');
      expect(copy, featureId).not.toContain('search term');
    }
  });

  it('records what became of the claim rather than losing it', () => {
    const entries = documents.get('clients.search')!.actionAccounting;
    expect(entries.map((entry) => entry.claimId)).toContain('clients.search#workflow_step:1');
    expect(entries[0]?.reason).toBe('UNSUPPORTED_PRESENTATION');
  });
});

// ---------------------------------------------------------------------------
// G · precedence
// ---------------------------------------------------------------------------

describe('G · a direct target always wins', () => {
  const form = formNode('thing.form');
  const save = control('thing.save', 'Save changes');
  const submit = handler('submitThing');
  const graph = graphOf(
    [form, save, submit],
    [edge('submits_to', form.id, submit.id), edge('submits_to', save.id, submit.id)],
  );

  it('resolves an actionable subject directly and does not enter recovery', () => {
    const candidate: FeatureCandidate = {
      id: 'thing.save',
      idOrigin: 'semantic-id',
      rootNodes: [save.id],
      discoveredBy: 'guide-element',
    } as FeatureCandidate;
    const scope = computeFeatureScope({
      featureId: 'thing.save',
      roots: [save.id],
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    const direct = resolveActionTarget({ subjectRef: save.id, candidate, scope, graph });
    expect(direct.status).toBe('resolved');
    if (direct.status === 'resolved')
      expect(direct.target.source).not.toBe('recovered-action-surface');
  });

  it('offers nothing to recover from when the subject is already a control', () => {
    // Recovery is for passive subjects. Handed an actionable one it declines
    // outright rather than searching for an alternative — which is what stops a
    // recovered sibling from ever displacing a claimed control.
    const outcome = attempt(graph, 'thing.save', [save.id], save.id);
    expect(outcome.status).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// H · one act, one step
// ---------------------------------------------------------------------------

describe('H · a navigation action absorbs the synthesised entry step', () => {
  let documents: Map<string, GuidanceDocument>;

  beforeAll(async () => {
    documents = await compileFixture();
  });

  it('does not say "Open Clients." and then \'Choose "Clients".\'', () => {
    const steps = documents
      .get('nav.clients')!
      .steps.map((step) => realiseInstruction(step.proposition) ?? '');
    expect(steps).toEqual(['Choose "Clients".']);
  });

  it('keeps the verified action rather than the synthesised one', () => {
    const document = documents.get('nav.clients')!;
    expect(document.steps.every((step) => step.origin !== 'synthetic-entry')).toBe(true);
    expect(document.diagnostics.map((entry) => entry.code)).toContain('REDUNDANT_ENTRY_STEP');
  });

  it('leaves the entry step alone where the action goes somewhere else', () => {
    // `clients.export` acts on the Clients page rather than navigating to it, so
    // the reader still has to be told where to start.
    const steps = documents
      .get('clients.export')!
      .steps.map((step) => realiseInstruction(step.proposition) ?? '');
    expect(steps[0]).toBe('Open Clients.');
  });
});

// ---------------------------------------------------------------------------
// I · passive things stay passive
// ---------------------------------------------------------------------------

describe('I · a display does not borrow the button beside it', () => {
  const display = panel('thing.output');
  const copy = control('other.copy', 'Copy');
  const copier = handler('copyToClipboard');
  const owner = page('ThingPage');
  const graph = graphOf(
    [display, copy, copier, owner],
    [
      edge('contains', owner.id, display.id),
      edge('contains', owner.id, copy.id),
      edge('invokes', copy.id, copier.id),
    ],
  );

  it('refuses a subject with no outgoing relationship at all', () => {
    const outcome = attempt(graph, 'thing.output', [display.id], display.id);
    expect(outcome.status).toBe('passive');
  });

  it('says the graph proves it is shown rather than pressed', () => {
    const outcome = attempt(graph, 'thing.output', [display.id], display.id);
    if (outcome.status !== 'passive') throw new Error('expected a passive refusal');
    expect(outcome.detail).toContain('not something that acts');
  });

  describe('and the three real ones stay silent', () => {
    let documents: Map<string, GuidanceDocument>;
    beforeAll(async () => {
      documents = await compileFixture();
    });

    // The anti-overfitting controls. Each sits on a page with an actionable
    // sibling, and none of them may acquire it.
    const silent: [string, string][] = [
      // A `<code>` holding a rotated key, beside the button that rotates it.
      ['settings.new-key', 'read-only output'],
      // A `<section>` wrapping Rotate API key. Wrapping is not doing.
      ['settings.danger-zone', 'a section, not an action'],
      // A `<table>`. Rows have actions; the table is not one of them.
      ['clients.table', 'a container of rows'],
      // A toolbar button whose only edge says who may see it.
      ['dashboard.new-client', 'only a permission edge'],
    ];

    for (const [featureId, why] of silent) {
      it(`${featureId} gains no action (${why})`, () => {
        const task = documents
          .get(featureId)!
          .steps.filter((step) => step.origin !== 'synthetic-entry');
        expect(task).toEqual([]);
      });

      it(`${featureId} records why`, () => {
        const dropped = documents
          .get(featureId)!
          .actionAccounting.filter((entry) => entry.outcome === 'dropped');
        expect(dropped.length).toBeGreaterThan(0);
        expect(dropped.every((entry) => entry.reason !== undefined)).toBe(true);
        expect(dropped.every((entry) => entry.recovery !== 'ambiguous')).toBe(true);
      });
    }

    it('clients.error is left exactly as it was', () => {
      const document = documents.get('clients.error')!;
      expect(document.steps.filter((step) => step.origin !== 'synthetic-entry')).toEqual([]);
      expect(document.summary).toBeUndefined();
      expect(document.taskCompletion).toBe('ENTRY_ONLY');
    });
  });
});

// ---------------------------------------------------------------------------
// J · the record does not move
// ---------------------------------------------------------------------------

describe('J · Round 4 stays what Round 4 was', () => {
  it('still records the output that was actually reviewed', () => {
    // The point of the check: the compiler now produces two steps for
    // `settings.form`, and the artefact a reviewer scored says one. If building
    // Round 5 ever rewrites Round 4 in place, this is what notices.
    const round4 = JSON.parse(readFileSync(`${BENCH}human-review-round-4.json`, 'utf8')) as {
      items: { featureId: string; productOutput: { steps: string[] } }[];
    };
    const form = round4.items.find((item) => item.featureId === 'settings.form');
    expect(form?.productOutput.steps).toEqual(['Open Settings.']);
    const nav = round4.items.find((item) => item.featureId === 'nav.clients');
    expect(nav?.productOutput.steps).toEqual(['Open Clients.', 'Choose "Clients".']);
  });

  it('and the scores that came back against it', () => {
    const scored = JSON.parse(readFileSync(`${BENCH}human-review-round-4.scored.json`, 'utf8')) as {
      items: { usefulness: number }[];
    };
    expect(scored.items).toHaveLength(21);
    expect(scored.items.filter((item) => item.usefulness >= 2)).toHaveLength(14);
  });
});

// ---------------------------------------------------------------------------

/** Compiles all twenty-one benchmark features against the real fixture. */
async function compileFixture(): Promise<Map<string, GuidanceDocument>> {
  const model = JSON.parse(readFileSync(`${BENCH}round-2-product-model.json`, 'utf8'))
    .model as ProductModel;
  const { graph } = await createProjectIndexer({
    root: FIXTURE,
    config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
  }).index();
  const candidates = [...discoverFeatureCandidates(graph)];
  const documents = new Map<string, GuidanceDocument>();
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
  return documents;
}
