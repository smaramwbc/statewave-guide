/**
 * Whether a sentence can still say more than anything establishes.
 *
 * Round 5 passed the usefulness gate and left one number untouched across four
 * rounds: **17 of 18 assessable items at correctness 1**. Not one incorrect
 * fact, not one score of 0 — and nothing at 2 either. The reviewer's note was
 * the same each time in different words: *more specific than the supplied facts*.
 *
 * An audit of all 194 user-facing propositions across the twenty-one features
 * found 97 supported. The interesting part is the split by surface:
 *
 *   summary   82% supported   compiled from propositions since Closed Loop #4
 *   question  61% supported   passed through from the model
 *   purpose   38% supported   passed through from the model
 *
 * So the tests below are about one rule. **A language claim chooses; it does not
 * establish.** It may decide whether to speak and which grounded word to use. It
 * may not introduce a role, a plan tier, a navigation guarantee, a motive, a
 * temporal state or an architectural status — and each of those is here because
 * a real sentence in Round 5 introduced one.
 *
 * Every test has a positive control beside it. A suite that only checked the
 * refusals would be satisfied by a compiler that emitted nothing at all, which
 * is the failure mode this loop was warned about in writing.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createProjectIndexer } from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type { ProductModel } from '@statewavedev/guide-shared';
import { discoverFeatureCandidates } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { computeFeatureScope } from '../src/scope.js';
import { compileGuidance } from '../src/guidance/compile.js';
import type { GuidanceDocument } from '../src/guidance/ir.js';
import {
  PRESENTATIONAL_TERMS,
  auditLanguageEvidence,
  buildGroundedTerms,
  isPresentational,
} from '../src/guidance/language.js';

const BENCH = new URL('../../../benchmarks/provider-reality-check/', import.meta.url).pathname;
const FIXTURE = new URL('../../indexer/test/fixtures/realistic-app', import.meta.url).pathname;

let model: ProductModel;
let graph: ApplicationGraph;
const documents = new Map<string, GuidanceDocument>();

beforeAll(async () => {
  model = JSON.parse(readFileSync(`${BENCH}round-2-product-model.json`, 'utf8')).model;
  graph = (
    await createProjectIndexer({
      root: FIXTURE,
      config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
    }).index()
  ).graph;
  const candidates = [...discoverFeatureCandidates(graph)];
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

/** Every word this feature shows a reader, across every surface. */
function copyFor(featureId: string): string {
  const document = docFor(featureId);
  return [
    document.title?.text,
    document.purpose?.text ?? '',
    document.summary?.text ?? '',
    ...document.questions.map((entry) => entry.text),
  ]
    .join(' ')
    .toLowerCase();
}

function allCopy(): string {
  return [...documents.keys()].map(copyFor).join(' ');
}

// ---------------------------------------------------------------------------
// A · a label is not a domain value
// ---------------------------------------------------------------------------

describe('A · a control labelled Upgrade cannot invent a plan tier', () => {
  it('never says "enterprise"', () => {
    // `ClientDetailPage.tsx:114` really is `changePlan('enterprise')`, so the
    // model was not hallucinating — the word is in the source. It is not in the
    // *graph*: no call arguments are recorded anywhere. True-in-source and
    // unprovable-here are different failures with different owners, and only one
    // of them is fixed by refusing to say it.
    expect(allCopy()).not.toContain('enterprise');
  });

  it('does not invent a purpose from the button text either', () => {
    // `client-detail.change-plan` has a permission claim and a workflow step and
    // no capability. Nothing says what pressing Upgrade does.
    expect(docFor('client-detail.change-plan').purpose).toBeUndefined();
  });

  it('still says what it can: the control, the screen and the permission', () => {
    // The positive control. Refusing the plan tier must not cost the feature the
    // things that *are* established.
    const document = docFor('client-detail.change-plan');
    expect(document.steps.map((step) => step.role)).toContain('trigger');
    expect(document.conditions.length).toBeGreaterThan(0);
    expect(document.questions.map((entry) => entry.text)).toContain('Why can\'t I see "Upgrade"?');
  });
});

// ---------------------------------------------------------------------------
// B · a permission is not a job title
// ---------------------------------------------------------------------------

describe('B · clients:update cannot invent an account-manager role', () => {
  it('never assigns a role to anybody', () => {
    const copy = allCopy();
    for (const role of ['an admin', 'account manager', 'administrator', 'an owner']) {
      expect(copy, role).not.toContain(role);
    }
  });

  it('grep confirms these were inventions rather than graph limits', () => {
    // The distinction that decides which layer gets the work. `enterprise` is in
    // the fixture; `admin` and `account manager` are in no file of it. One is an
    // indexer roadmap item and the other is a model making something up, and
    // reporting them as one number would hide the first behind the second.
    const claim = model.claims.find((entry) => entry.id === 'clients.create#purpose:1');
    expect(claim?.text).toContain('admin');
    expect(claim?.status).toBe('semantically_grounded');
  });

  it('renders the permission as a condition instead, which is what was verified', () => {
    expect(docFor('clients.create').conditions.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// C · you cannot prove a negative
// ---------------------------------------------------------------------------

describe('C · an API call does not prove the user stays on the page', () => {
  it('never says "without leaving"', () => {
    expect(allCopy()).not.toContain('without leaving');
  });

  it('never says the feature is reachable from anywhere', () => {
    expect(allCopy()).not.toContain('anywhere in the app');
  });

  it('emits no location proposition at all, for any feature', () => {
    // Not filtered — unreachable. Every `location` sentence in Round 5 was a
    // guarantee about navigation *not* happening, and a static graph records
    // what exists rather than what does not.
    for (const [featureId, document] of documents) {
      const kinds = document.languagePropositions.map((entry) => entry.type);
      expect(kinds, featureId).not.toContain('location');
    }
  });
});

// ---------------------------------------------------------------------------
// D · motive
// ---------------------------------------------------------------------------

describe('D · a Rotate API key button does not establish why anyone would', () => {
  it('never mentions compromise', () => {
    expect(allCopy()).not.toContain('compromis');
  });

  it('does not tell a reader what they no longer need', () => {
    expect(allCopy()).not.toContain('no longer need');
  });

  it('keeps the control and the step, which are proven', () => {
    const steps = docFor('settings.rotate-key')
      .steps.filter((step) => step.origin !== 'synthetic-entry')
      .map((step) => step.proposition);
    expect(steps.length).toBeGreaterThan(0);
    expect(docFor('settings.rotate-key').title?.text).toBe('Rotate API key');
  });
});

// ---------------------------------------------------------------------------
// E · generated state
// ---------------------------------------------------------------------------

describe('E · a read-only <code> block does not record when its contents were made', () => {
  it('never says freshly or newly generated', () => {
    const copy = allCopy();
    expect(copy).not.toContain('freshly');
    expect(copy).not.toContain('generated');
  });

  it('says nothing at all about settings.new-key beyond where it is', () => {
    // The element is `{rotatedKey !== null ? <code …/> : null}` — it does not
    // exist until the user has rotated a key. The graph has no conditional
    // rendering, so any sentence asserting the element is there is false for
    // every reader who has not, which is every reader asking.
    const document = docFor('settings.new-key');
    expect(document.purpose).toBeUndefined();
    expect(document.summary).toBeUndefined();
    expect(document.questions).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// F · architectural status
// ---------------------------------------------------------------------------

describe('F · an unresolved endpoint prefix does not make an endpoint legacy', () => {
  it('never says legacy, older, or current', () => {
    const copy = allCopy();
    expect(copy).not.toContain('legacy');
    expect(copy).not.toContain('older');
    expect(copy).not.toContain('current client');
  });

  it('does not read architecture history out of a module path', () => {
    // `backend/src/routes/legacy.ts` and `listLegacyClients` do contain the
    // word, and both are identifiers. This project has refused identifier text
    // as user-facing evidence since ADR 0014, and a file path is the weakest
    // form of it.
    expect(copyFor('api.get.partial-clients')).not.toContain('legacy');
  });
});

// ---------------------------------------------------------------------------
// G · a question mark does not reduce authority
// ---------------------------------------------------------------------------

describe('G · questions obey the same rule as statements', () => {
  it('does not smuggle a plan tier into an interrogative', () => {
    // Round 5 shipped "How do I upgrade a client to the enterprise plan?" — the
    // assertion is in the question, and the question was never checked.
    for (const [featureId, document] of documents) {
      for (const question of document.questions) {
        expect(question.text.toLowerCase(), featureId).not.toContain('enterprise');
      }
    }
  });

  it('does not assert conditional visibility without a permission the feature owns', () => {
    // "Why is the Save changes button greyed out? It is disabled unless you have
    // permission to edit settings." — `permission:settings:update` is OUTSIDE
    // `settings.save`'s scope, so that feature may not speak for it.
    expect(docFor('settings.save').questions).toEqual([]);
  });

  it('asks the two questions a verified claim actually licenses', () => {
    // The positive control, and the reason this is not simply deletion. A
    // capability makes "how do I" answerable; a permission makes "why can't I
    // see" answerable.
    const audit = docFor('client-detail.audit').questions.map((entry) => entry.text);
    expect(audit).toContain('How do I view the audit trail for a client?');
    expect(audit).toContain('Why can\'t I see "Audit trail"?');
  });

  it('gives every question a provenance trail', () => {
    for (const [featureId, document] of documents) {
      for (const question of document.questions) {
        const cited = question.provenance.claims.length + question.provenance.facts.length;
        expect(cited, `${featureId}: ${question.text}`).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// H · a supported domain value may be rendered
// ---------------------------------------------------------------------------

describe('H · a noun the application names twice may be said', () => {
  it('renders the audit trail, which the label and the endpoint both name', () => {
    // `element:client-detail.audit` reads "Audit trail" and the feature owns
    // `GET /api/clients/:clientId/audit`. Two independent places in the
    // application name the same thing, which is as close to corroboration as a
    // static graph offers — and it is the difference between this and
    // "enterprise", which appears in neither.
    expect(docFor('client-detail.audit').purpose?.text).toBe(
      'Lets you view the audit trail for a client.',
    );
  });

  it('takes the object noun from an endpoint rather than from the feature id', () => {
    // `client-detail.rename` would otherwise be about "a client-detail", which
    // is a screen name rather than a thing.
    expect(docFor('client-detail.rename').purpose?.text).toBe('Lets you change a client.');
  });

  it('refuses a label the endpoint does not corroborate', () => {
    // "Rotate API key" is a perfectly good label and `settings.rotate-key` owns
    // no endpoint at all, so nothing seconds it.
    expect(docFor('settings.rotate-key').purpose).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// I · presentational language is a closed set
// ---------------------------------------------------------------------------

describe('I · style cannot be used as an escape hatch', () => {
  it('admits only what is on the list', () => {
    expect(isPresentational('quickly')).toBe(true);
    expect(isPresentational('in one place')).toBe(true);
    // The whole point. If a fact could be relabelled as style it would be, and
    // the list is finite so it cannot.
    expect(isPresentational('enterprise')).toBe(false);
    expect(isPresentational('an admin')).toBe(false);
    expect(isPresentational('without leaving the page')).toBe(false);
    expect(isPresentational('legacy')).toBe(false);
  });

  it('keeps the list small enough to read', () => {
    expect(PRESENTATIONAL_TERMS.size).toBeLessThan(30);
  });

  it('gives presentational terms no way into the output', () => {
    // Belt and braces: even a term correctly classified as style has no path to
    // a sentence, because nothing in PurposeIR is ever filled from one. A
    // misclassification costs a diagnostic, never a falsehood.
    for (const [featureId, document] of documents) {
      const kinds = document.languagePropositions.map((entry) => entry.support.kind);
      expect(kinds, featureId).not.toContain('presentational');
    }
  });
});

// ---------------------------------------------------------------------------
// J · every emitted proposition is checkable, and owned
// ---------------------------------------------------------------------------

describe('J · support is total, and scoped', () => {
  it('gives every emitted proposition support', () => {
    for (const [featureId, document] of documents) {
      for (const proposition of document.languagePropositions) {
        expect(proposition.support, `${featureId}: ${proposition.type}`).toBeDefined();
      }
    }
  });

  it('never rests a proposition on a node the feature does not own', () => {
    const candidates = [...discoverFeatureCandidates(graph)];
    for (const [featureId, document] of documents) {
      const candidate = candidates.find((entry) => entry.id === featureId);
      if (candidate === undefined) continue;
      const pack = buildEvidencePack(graph, candidate);
      const scope = computeFeatureScope({
        featureId,
        roots: candidate.rootNodes,
        nodes: pack.nodes,
        relationships: pack.relationships,
      });
      for (const proposition of document.languagePropositions) {
        const support = proposition.support;
        if (support.kind !== 'owned-node') continue;
        expect(scope.classify(support.nodeId), `${featureId}`).toBe('OWNED');
      }
    }
  });

  it('never rests a proposition on a claim that was not verified', () => {
    for (const [featureId, document] of documents) {
      for (const proposition of document.languagePropositions) {
        const support = proposition.support;
        if (support.kind !== 'claim-assertion') continue;
        const claim = model.claims.find((entry) => entry.id === support.claimId);
        if (claim === undefined) continue;
        expect(claim.status, `${featureId}: ${claim.id}`).toBe('structurally_verified');
      }
    }
  });

  it('measures the ownership hole this loop found', () => {
    // 25 of 103 language-claim evidence refs point outside the feature that made
    // the claim — `settings.danger-zone` citing the rotate button,
    // `clients.table` citing the row and the delete control inside a component
    // it does not own. ADR 0010 installed ownership as the gate on factual truth
    // and it was never applied here.
    const candidates = [...discoverFeatureCandidates(graph)];
    let total = 0;
    let unowned = 0;
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
      for (const claim of model.claims) {
        if (claim.featureId !== feature.id || claim.status !== 'semantically_grounded') continue;
        const audit = auditLanguageEvidence(claim, scope);
        total += audit.owned.length + audit.unowned.length;
        unowned += audit.unowned.length;
      }
    }
    expect(total).toBeGreaterThan(90);
    // 25 of 103 when Closed Loop #7 measured it. Closed Loop #8's element-level
    // containment legitimately brought neighbours into scope — a form now owns
    // the fields inside it — so the hole is smaller and still real.
    expect(unowned).toBeGreaterThan(10);
    expect(unowned).toBeLessThan(25);
  });

  it('builds a grounded vocabulary only from what the feature owns', () => {
    const candidates = [...discoverFeatureCandidates(graph)];
    const candidate = candidates.find((entry) => entry.id === 'settings.danger-zone')!;
    const pack = buildEvidencePack(graph, candidate);
    const scope = computeFeatureScope({
      featureId: 'settings.danger-zone',
      roots: candidate.rootNodes,
      nodes: pack.nodes,
      relationships: pack.relationships,
    });
    const terms = buildGroundedTerms({
      featureId: 'settings.danger-zone',
      scope,
      nodes: graph.nodes,
      claims: model.claims.filter((entry) => entry.featureId === 'settings.danger-zone'),
    });
    // Closed Loop #8 changed this, and changed it correctly. The graph now
    // records `settings.danger-zone contains settings.rotate-key`, so the
    // section really does own the button whose face reads "Rotate API key" and
    // may use those words. What it still cannot do is say what rotating one
    // *does* — containment supplies structure and never semantics, and this
    // feature emits no purpose for exactly that reason.
    expect(terms.has('api')).toBe(true);
    expect(terms.has('key')).toBe(true);
    expect(documents.get('settings.danger-zone')?.purpose).toBeUndefined();

    // The negative control moves with it. `settings.new-key` is a sibling under
    // the danger zone rather than its parent, so it contains nothing and may
    // borrow nothing.
    const newKey = candidates.find((entry) => entry.id === 'settings.new-key')!;
    const newKeyPack = buildEvidencePack(graph, newKey);
    const newKeyTerms = buildGroundedTerms({
      featureId: 'settings.new-key',
      scope: computeFeatureScope({
        featureId: 'settings.new-key',
        roots: newKey.rootNodes,
        nodes: newKeyPack.nodes,
        relationships: newKeyPack.relationships,
      }),
      nodes: graph.nodes,
      claims: model.claims.filter((entry) => entry.featureId === 'settings.new-key'),
    });
    expect(newKeyTerms.has('rotate')).toBe(false);

    const rotate = candidates.find((entry) => entry.id === 'settings.rotate-key')!;
    const rotatePack = buildEvidencePack(graph, rotate);
    const rotateTerms = buildGroundedTerms({
      featureId: 'settings.rotate-key',
      scope: computeFeatureScope({
        featureId: 'settings.rotate-key',
        roots: rotate.rootNodes,
        nodes: rotatePack.nodes,
        relationships: rotatePack.relationships,
      }),
      nodes: graph.nodes,
      claims: model.claims.filter((entry) => entry.featureId === 'settings.rotate-key'),
    });
    // The button that carries the words may use them. That is the positive
    // control for the refusal above.
    expect(rotateTerms.has('api')).toBe(true);
    expect(rotateTerms.has('key')).toBe(true);
  });
});
