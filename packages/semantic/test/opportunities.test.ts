/**
 * The planner, and the one invariant that makes it sound.
 *
 * Everything the planner offers has already been proved by the verifier that
 * will judge the model's answer. That is not a convenience — it is the whole
 * design. If the two could disagree, the disagreement would surface as
 * opportunities the verifier refuses, and a reader would see the model blamed
 * for the pipeline arguing with itself.
 *
 * So the first test here feeds every opportunity straight back through
 * verification and requires all of them to survive. The rest guard the edges
 * where a second rule system could creep in: an unsupported action acquiring a
 * rule by accident, a registered provider proposing something nothing can
 * judge, and a provider answering for a pair it never registered.
 */

import { describe, expect, it } from 'vitest';
import { createProjectIndexer } from '@statewavedev/guide-indexer';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import { discoverFeatureCandidates } from '../src/candidates.js';
import { buildEvidencePack } from '../src/evidence-pack.js';
import { planClaimOpportunities } from '../src/opportunities.js';
import { createClaimOpportunityRegistry } from '../src/opportunity-registry.js';
import { createClaimVerifierRegistry } from '../src/registry.js';
import { computeFeatureScope } from '../src/scope.js';
import { verifyEnrichment } from '../src/verifier.js';

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

async function planFor(featureId: string, extras: Record<string, unknown> = {}) {
  const graph = await realisticGraph();
  const candidates = discoverFeatureCandidates(graph);
  const candidate = candidates.find((entry) => entry.id === featureId);
  if (candidate === undefined) throw new Error(`no candidate ${featureId}`);
  const pack = buildEvidencePack(graph, candidate);
  const scope = computeFeatureScope({
    featureId,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const knownFeatureIds = new Set(candidates.map((entry) => entry.id));
  const plan = planClaimOpportunities({
    candidate,
    knownFeatureIds,
    pack,
    graph,
    scope,
    ...extras,
  });
  return { graph, candidate, pack, scope, knownFeatureIds, plan };
}

describe('every opportunity the planner offers survives verification', () => {
  it('holds for the flagship feature', async () => {
    const { graph, candidate, pack, scope, knownFeatureIds, plan } =
      await planFor('clients.create');
    expect(plan.length).toBeGreaterThan(0);

    const result = verifyEnrichment({
      candidate,
      knownFeatureIds,
      pack,
      graph,
      scope,
      plan,
      enrichment: {
        title: 'Create a client',
        description: 'Adds a client record.',
        factualClaims: [],
        // Accept every offer. If the planner and the verifier can disagree,
        // this is where it shows.
        decisions: plan.map((opportunity) => ({
          opportunityId: opportunity.id,
          decision: 'accept' as const,
          text: 'A sentence a person would recognise.',
        })),
        languageClaims: [],
        confidenceReason: 'Planned.',
      },
      attribution: { provider: 'test', model: 'test' },
      provenance: { graphHash: 'hash', dependencyFingerprint: 'fingerprint' },
    });

    const refused = result.claims.filter((claim) => claim.status === 'rejected');
    expect(refused.map((claim) => `${claim.type}: ${claim.rejection?.reason ?? 'none'}`)).toEqual(
      [],
    );
  });

  it('offers a create capability for the feature that reaches a POST endpoint', async () => {
    const { plan } = await planFor('clients.create');
    expect(plan.some((entry) => entry.type === 'capability' && entry.action === 'create')).toBe(
      true,
    );
  });
});

describe('the planner cannot widen what may be claimed', () => {
  it('offers no capability at all for the feature that started the wrong-feature bug', async () => {
    // `settings.new-key` displays a rotated key. It has no outgoing edges, so
    // there is nothing it can be proved to *do* — and the planner has no way to
    // learn otherwise, because the only thing that tells it an assertion is
    // possible is the verifier accepting one.
    const { plan } = await planFor('settings.new-key');
    expect(plan.filter((entry) => entry.type === 'capability')).toEqual([]);
  });

  it('offers nothing for export or search, whatever the feature is called', async () => {
    for (const featureId of ['clients.export', 'clients.search']) {
      const { plan } = await planFor(featureId);
      const actions = plan.map((entry) => entry.action).filter(Boolean);
      expect(actions).not.toContain('export');
      expect(actions).not.toContain('search');
      expect(actions).not.toContain('import');
      expect(actions).not.toContain('send');
    }
  });

  it('never offers a deliberately unsupported action anywhere in the fixture', async () => {
    const graph = await realisticGraph();
    const candidates = discoverFeatureCandidates(graph);
    const knownFeatureIds = new Set(candidates.map((entry) => entry.id));
    const offered = new Set<string>();
    for (const candidate of candidates) {
      const pack = buildEvidencePack(graph, candidate);
      const scope = computeFeatureScope({
        featureId: candidate.id,
        roots: candidate.rootNodes,
        nodes: pack.nodes,
        relationships: pack.relationships,
      });
      for (const entry of planClaimOpportunities({
        candidate,
        knownFeatureIds,
        pack,
        graph,
        scope,
      })) {
        if (entry.action !== undefined) offered.add(entry.action);
      }
    }
    expect([...offered].sort()).toEqual(['create', 'navigate', 'submit', 'update', 'view']);
  });
});

describe('the opportunity extension point', () => {
  const draftingProvider = {
    type: 'capability' as const,
    action: 'export' as const,
    discover: () => [{ subjectRef: 'element:clients.export', targets: ['element:clients.export'] }],
  };

  it('does nothing without a verifier registered for the same pair', async () => {
    // Both halves or neither. A proposal nothing can judge is worse than no
    // proposal: a model spends an answer on it and the reader sees a refusal.
    const opportunityRegistry = createClaimOpportunityRegistry();
    opportunityRegistry.register(draftingProvider);

    const { plan } = await planFor('clients.export', { opportunityRegistry });
    expect(plan.some((entry) => entry.action === 'export')).toBe(false);
  });

  it('offers the pair once both halves are registered', async () => {
    const opportunityRegistry = createClaimOpportunityRegistry();
    opportunityRegistry.register(draftingProvider);
    const registry = createClaimVerifierRegistry();
    registry.register({
      type: 'capability',
      action: 'export',
      verify: (context) => ({
        satisfied: true,
        evidence: [...context.assertion.targets],
        detail: 'this application knows its own export control',
      }),
    });

    const { plan } = await planFor('clients.export', { opportunityRegistry, registry });
    expect(plan.some((entry) => entry.type === 'capability' && entry.action === 'export')).toBe(
      true,
    );
  });

  it('refuses a draft whose subject the feature does not own', async () => {
    const opportunityRegistry = createClaimOpportunityRegistry();
    opportunityRegistry.register({
      type: 'capability',
      action: 'export',
      // A sibling's element. Registering a provider does not buy a way past
      // scope, or the extension point would reopen the bug it was built beside.
      discover: () => [{ subjectRef: 'element:settings.form', targets: ['element:settings.form'] }],
    });
    const registry = createClaimVerifierRegistry();
    registry.register({
      type: 'capability',
      action: 'export',
      verify: (context) => ({
        satisfied: true,
        evidence: [...context.assertion.targets],
        detail: 'always',
      }),
    });

    const { plan } = await planFor('clients.export', { opportunityRegistry, registry });
    // An export opportunity may legitimately exist here — a verifier that
    // always says yes is registered, so the planner can prove one from the
    // feature's *own* subjects. What must not exist is the sibling the provider
    // asked for.
    expect(plan.map((entry) => entry.subjectRef)).not.toContain('element:settings.form');
  });

  it('replaces a provider registered twice for the same pair, and restores nothing on a stale disposer', async () => {
    const opportunityRegistry = createClaimOpportunityRegistry();
    const disposeFirst = opportunityRegistry.register(draftingProvider);
    opportunityRegistry.register({ ...draftingProvider, discover: () => [] });
    // The first registration is no longer in force, so its disposer must not
    // remove whoever replaced it.
    disposeFirst();
    expect(opportunityRegistry.list()).toHaveLength(1);
  });
});

describe('the plan is deterministic', () => {
  it('produces byte-identical plans across two runs', async () => {
    const first = await planFor('clients.create');
    const second = await planFor('clients.create');
    expect(JSON.stringify(second.plan)).toBe(JSON.stringify(first.plan));
  });

  it('gives every opportunity an id short enough to be quoted back exactly', async () => {
    // A component subject carries its whole file path. Spelled into the id it
    // exceeded the wire schema's length cap, and a whole feature's answer was
    // lost to a schema violation.
    const { plan } = await planFor('clients.create');
    for (const opportunity of plan) expect(opportunity.id.length).toBeLessThanOrEqual(80);
  });
});
