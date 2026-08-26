/**
 * The wrong-feature regression, in both directions.
 *
 * Round 1 ran a real model against the pipeline and one claim passed structural
 * verification while describing a different feature. It is worth being exact
 * about what went wrong, because nothing was broken:
 *
 *   feature:   settings.new-key   (a `<code>` element displaying a rotated key)
 *   claim:     "Settings changes are saved by submitting the settings form."
 *   type:      capability, action submit
 *   subject:   element:settings.form
 *   targets:   element:settings.form, …#saveSettings, element:settings.save
 *
 * The settings form really does submit. The relationships were real. Every
 * dimension of the `capability/submit` rule was satisfied. The verifier checked
 * that the subject was a *known* identity and that the evidence was in the
 * feature's pack — and both were true, because a pack is a neighbourhood and
 * the sibling was sitting in it.
 *
 * So this file asserts the negative and the positive together, in one place. A
 * scope narrow enough to refuse the sibling is worthless if it also refuses the
 * feature that genuinely owns the same path, and the two are one edge apart.
 * Splitting them across files would let a future change satisfy one and quietly
 * break the other.
 */

import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import { computeFeatureScope } from '../src/scope.js';
import { discoverFeatureCandidates } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { verifyEnrichment } from '../src/verifier.js';
import type { FactualClaimEnrichment } from '@statewavedev/guide-shared';

const FIXTURE = new URL('../../indexer/test/fixtures/realistic-app', import.meta.url).pathname;

let cached: ApplicationGraph | undefined;
async function realisticGraph(): Promise<ApplicationGraph> {
  cached ??= (
    await createProjectIndexer({
      root: FIXTURE,
      config: { include: ['frontend/src/**/*.{ts,tsx}', 'backend/src/**/*.ts'] },
    }).index()
  ).graph;
  return cached;
}

/** Verifies one factual claim against one real candidate from the fixture. */
async function verifyAgainst(featureId: string, claim: FactualClaimEnrichment) {
  const graph = await realisticGraph();
  const candidates = discoverFeatureCandidates(graph);
  const candidate = candidates.find((entry) => entry.id === featureId);
  if (candidate === undefined) throw new Error(`no candidate ${featureId}`);
  const pack = buildEvidencePack(graph, candidate);
  return verifyEnrichment({
    candidate,
    knownFeatureIds: new Set(candidates.map((entry) => entry.id)),
    pack,
    graph,
    enrichment: {
      title: 'Fixture',
      description: 'Fixture feature under test.',
      factualClaims: [claim],
      decisions: [],
      languageClaims: [],
      confidenceReason: 'Fixture.',
    },
    attribution: { provider: 'test', model: 'test' },
    provenance: { graphHash: 'hash', dependencyFingerprint: 'fingerprint' },
  });
}

/** The exact claim a real model produced, verbatim from the Round 1 run. */
const THE_CLAIM: FactualClaimEnrichment = {
  type: 'capability',
  action: 'submit',
  text: 'Settings changes are saved by submitting the settings form.',
  subjectRef: 'element:settings.form',
  targets: ['element:settings.form', 'function:frontend/src/pages/SettingsPage.tsx#saveSettings'],
};

describe('the wrong-feature regression', () => {
  it('refuses the claim under the feature that does not own the form', async () => {
    const result = await verifyAgainst('settings.new-key', THE_CLAIM);
    const [claim] = result.claims;
    expect(claim?.status).toBe('rejected');
    expect(claim?.rejection?.reason).toBe('SUBJECT_OUT_OF_SCOPE');
    // The refusal must not call a real thing unknown. A reader sent looking for
    // a typo in an id that is perfectly correct learns the wrong lesson.
    expect(claim?.rejection?.detail).not.toMatch(/does not exist|neither a known/i);
    expect(claim?.rejection?.detail).toContain('settings.new-key');
  });

  it('accepts the identical claim under the feature that does own the form', async () => {
    // The half that makes the other half meaningful. Same claim, same evidence,
    // same rule — one edge of difference, and it is the direction of that edge.
    const result = await verifyAgainst('settings.form', THE_CLAIM);
    const [claim] = result.claims;
    expect(claim?.status).toBe('structurally_verified');
    expect(claim?.rejection).toBeUndefined();
  });

  it('refuses a borrowed target even when the subject is the feature itself', async () => {
    // The subject gate alone is not enough. `workflow_step` names no
    // `relationships` and no `httpMethods`, so with an owned subject the only
    // thing standing between a model and a sibling's fact is the target gate.
    const result = await verifyAgainst('settings.new-key', {
      type: 'workflow_step',
      text: 'Press Save to store your settings.',
      subjectRef: 'feature:settings.new-key',
      targets: ['element:settings.form'],
    });
    const [claim] = result.claims;
    expect(claim?.status).toBe('rejected');
    expect(claim?.rejection?.reason).toBe('TARGET_OUT_OF_SCOPE');
  });

  it('refuses a claim proved only by the page the feature sits on', async () => {
    // The misattribution one node up. The settings page is legitimate context
    // for `settings.new-key` — it is where the feature lives, and a reader
    // wants to be told so — but it proves nothing about the key, and
    // `workflow_step` constrains only `nodeKinds`, which any component
    // satisfies. Measured before this gate: 203 of 203 such citations accepted.
    const result = await verifyAgainst('settings.new-key', {
      type: 'workflow_step',
      text: 'Open the settings page.',
      subjectRef: 'feature:settings.new-key',
      targets: ['component:frontend/src/pages/SettingsPage.tsx#SettingsPage'],
    });
    const [claim] = result.claims;
    expect(claim?.status).toBe('rejected');
    expect(claim?.rejection?.reason).toBe('TARGET_OUT_OF_SCOPE');
  });

  it('refuses a claim about a feature filed under another feature', async () => {
    const result = await verifyAgainst('settings.new-key', {
      type: 'capability',
      action: 'update',
      text: 'Settings can be updated.',
      subjectRef: 'feature:settings.form',
      targets: ['element:settings.new-key'],
    });
    const [claim] = result.claims;
    expect(claim?.status).toBe('rejected');
    expect(claim?.rejection?.reason).toBe('SUBJECT_OUT_OF_SCOPE');
  });
});

describe('scope keeps what the feature genuinely owns', () => {
  it('lets a submit control speak for the form it submits', async () => {
    // Before the indexer learned this edge, `settings.save` could only support
    // a submit claim by citing the *form's* `submits_to` — structurally the
    // same borrowing as the bug. Now it has its own edge and needs no one's.
    const result = await verifyAgainst('settings.save', {
      type: 'capability',
      action: 'submit',
      text: 'Save changes submits the settings form.',
      subjectRef: 'element:settings.save',
      targets: [
        'element:settings.save',
        'function:frontend/src/pages/SettingsPage.tsx#saveSettings',
      ],
    });
    const [claim] = result.claims;
    expect(claim?.status).toBe('structurally_verified');
  });

  it('keeps the endpoint a feature reaches through its own behaviour', async () => {
    const graph = await realisticGraph();
    const candidate = discoverFeatureCandidates(graph).find((c) => c.id === 'clients.create')!;
    const scope = computeFeatureScope({
      featureId: candidate.id,
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    expect(scope.classify('api:POST:/api/clients')).toBe('OWNED');
    expect(scope.canWitness('api:POST:/api/clients')).toBe(true);
  });
});

describe('ownership stops where the product stops', () => {
  it('owns the endpoint identity but not what implements it', async () => {
    const graph = await realisticGraph();
    const candidate = discoverFeatureCandidates(graph).find((c) => c.id === 'clients.create')!;
    const scope = computeFeatureScope({
      featureId: candidate.id,
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    // What the feature does.
    expect(scope.classify('api:POST:/api/clients')).toBe('OWNED');
    // How it happens to be built. Real, reachable, and nobody's feature.
    expect(scope.classify('function:backend/src/lib/db.ts#query')).toBe('REACHABLE');
  });

  it('refuses to own shared infrastructure a transitive chain reaches', async () => {
    const graph = await realisticGraph();
    const candidate = discoverFeatureCandidates(graph).find((c) => c.id === 'clients.create')!;
    const scope = computeFeatureScope({
      featureId: candidate.id,
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    // A request wrapper with thirteen callers, a design-system button with
    // eight, an auth helper with five. None of them is a feature.
    expect(scope.classify('function:frontend/src/lib/http.ts#unwrap')).toBe('REACHABLE');
    expect(scope.classify('component:frontend/src/components/primitives/Button.tsx#Button')).toBe(
      'REACHABLE',
    );
    // The requirement is that no transitive chain makes these the feature's.
    // `hasPermission` lands further out still — nothing this feature owns calls
    // it — and OUTSIDE is strictly stronger than REACHABLE here.
    expect(
      scope.classify('function:frontend/src/permissions/permissions.ts#hasPermission'),
    ).not.toBe('OWNED');
  });

  it('does not let a shared primitive bridge one feature into another page', async () => {
    // `primitives/Button` is rendered by eight components. Walking ancestry out
    // of every owned node — rather than out of the roots — reached every page
    // in the application through it, and made them all "where this feature
    // lives". Measured then: four unrelated pages. Now: none.
    const graph = await realisticGraph();
    const candidate = discoverFeatureCandidates(graph).find((c) => c.id === 'clients.create')!;
    const scope = computeFeatureScope({
      featureId: candidate.id,
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    expect(scope.classify('component:frontend/src/pages/SettingsPage.tsx#SettingsPage')).toBe(
      'OUTSIDE',
    );
    expect(scope.classify('component:frontend/src/pages/InvoicesPage.tsx#InvoicesPage')).toBe(
      'OUTSIDE',
    );
  });

  it('records a retraceable path for everything it owns', async () => {
    const graph = await realisticGraph();
    const candidate = discoverFeatureCandidates(graph).find((c) => c.id === 'clients.create')!;
    const scope = computeFeatureScope({
      featureId: candidate.id,
      roots: candidate.rootNodes,
      nodes: graph.nodes,
      relationships: graph.relationships,
    });
    const path = scope.ownershipPath('api:POST:/api/clients') ?? [];
    expect(path.map((step) => step.relationship)).toEqual([
      'invokes',
      'opens',
      'renders',
      'submits_to',
      'calls',
      'calls_api',
    ]);
    // Every hop joins up: an ownership claim nobody can retrace is an assertion.
    for (const [index, step] of path.entries()) {
      if (index === 0) expect(candidate.rootNodes).toContain(step.source);
      else expect(step.source).toBe(path[index - 1]?.target);
    }
  });
});
