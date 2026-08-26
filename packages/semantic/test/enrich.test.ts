/**
 * The pipeline, end to end, over the realistic fixture.
 *
 * What is worth pinning here is not "does it produce a model" — it is the four
 * properties that make the model worth reading:
 *
 * - **Determinism.** Two runs over the same graph with the same responses
 *   produce the same bytes, save the one field with a clock in it. A model that
 *   churns cannot be diffed, and a model that cannot be diffed cannot be
 *   reviewed.
 * - **Refusals survive.** A claim the verifier refused is *in* `product.json`,
 *   with its reason, counted in the summary. Dropping it would turn the most
 *   useful signal the pipeline produces into an absence.
 * - **Reuse skips the provider.** An unchanged fingerprint means no call. The
 *   test asserts the call count, not the wall clock.
 * - **The renderer is fenced off.** It receives accepted claims and a
 *   description-free draft, and its output — not the model's paragraph — is what
 *   reaches the feature.
 */

import { describe, expect, it } from 'vitest';
import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import { productModelSchema } from '@statewavedev/guide-shared';
import { SEMANTIC_GENERATOR_VERSION } from '../src/constants.js';
import { enrichApplicationGraph } from '../src/enrich.js';
import type { EnrichmentEvent } from '../src/enrich.js';
import {
  normaliseProductModel,
  productModelHash,
  serializeProductModel,
} from '../src/product-file.js';
import { FEATURE_ENRICHMENT_TASK } from '../src/prompt.js';
import { formatEnrichmentReport } from '../src/reporter.js';
import { createMockProvider } from '../src/providers/mock.js';
import type { ProseRenderRequest, ProseRenderer } from '../src/render.js';
import { ID, clientsGraph } from './helpers.js';

/** Every feature id the fixture yields, in the order discovery mints them. */
const FEATURE_IDS = [
  'clients.create',
  'clients.delete',
  'clients.edit',
  'clients.export',
  'clients.form',
  'clients.list',
  'clients.search',
  'invoices.create',
];

/** A response that mixes one verifiable claim with three unverifiable ones. */
const HOSTILE_RESPONSE = {
  title: 'Create a client',
  description: 'Clients can be imported from a spreadsheet and synced with the CRM.',
  factualClaims: [
    {
      type: 'capability',
      text: 'Clients can be imported from a CSV file.',
      subjectRef: 'feature:clients.create',
      action: 'import',
      targets: [ID.post],
    },
    {
      type: 'capability',
      text: 'A client can be created.',
      subjectRef: 'feature:clients.create',
      action: 'create',
      targets: [ID.post, `${ID.serviceCreate}|calls_api|${ID.post}`],
    },
    {
      type: 'navigation',
      text: 'Clients live at /nowhere.',
      subjectRef: 'feature:clients.create',
      route: '/nowhere',
      targets: [ID.routeList],
    },
    {
      type: 'capability',
      text: 'The reporting module can be viewed.',
      subjectRef: 'feature:reporting.dashboard',
      action: 'view',
      targets: [ID.routeList],
    },
  ],
  languageClaims: [
    {
      type: 'purpose',
      text: 'Someone uses this to add a client.',
      targets: [ID.create],
    },
  ],
  confidenceReason: 'Only the create path is backed by an endpoint.',
};

/** A graph identical to the fixture except for where one invoices node sits. */
function graphWithMovedInvoiceButton(): ApplicationGraph {
  const graph = clientsGraph();
  return {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === ID.invoiceCreate
        ? { ...node, provenance: { ...node.provenance, line: 999 } }
        : node,
    ),
  };
}

describe('enrichApplicationGraph', () => {
  it('produces a Product Model that satisfies the contract', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    expect(productModelSchema.safeParse(run.model).success).toBe(true);
    expect(run.model.version).toBe(2);
    expect(run.model.features.map((feature) => feature.id)).toEqual(FEATURE_IDS);
    expect(run.model.source.provider).toBe('mock');
    expect(run.model.source.generatorVersion).toBe(SEMANTIC_GENERATOR_VERSION);
  });

  it('lifts permissions from the graph rather than from anything a model said', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    expect(run.model.permissions.map((permission) => permission.id)).toEqual([
      'clients:create',
      'clients:export',
      'invoices:create',
    ]);
    const create = run.model.permissions.find((permission) => permission.id === 'clients:create');
    expect(create?.requiredBy).toEqual([ID.create]);
    expect(create?.evidence.length).toBeGreaterThan(0);
  });

  it('scopes a feature to what it speaks for, not to its whole neighbourhood', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const create = run.model.features.find((feature) => feature.id === 'clients.create');
    // The pack around this button holds every sibling control on the page; the
    // feature owns only the one a user presses to create a client.
    expect(create?.elements).toEqual(['clients.create']);
    expect(create?.permissions).toEqual(['clients:create']);
    expect(create?.routes).toEqual(['/clients']);
    expect(create?.entryPoints).toEqual([ID.create]);
  });

  it('carries provenance a claim can later be superseded by', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
      applicationVersion: '4.5.6',
      commit: 'deadbee',
    });

    const claim = run.model.claims[0];
    expect(claim?.provenance.graphHash).toBe(run.model.source.graphHash);
    expect(claim?.provenance.applicationVersion).toBe('4.5.6');
    expect(claim?.provenance.commit).toBe('deadbee');
    const feature = run.model.features.find((entry) => entry.id === claim?.featureId);
    // A claim's fingerprint is its own feature's, so one claim can go stale
    // without the rest of the model moving.
    expect(claim?.provenance.dependencyFingerprint).toBe(feature?.dependencyFingerprint);
  });

  it('computes confidence from factual claims alone, never from the model', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    const create = run.model.features.find((feature) => feature.id === 'clients.create');
    expect(create?.claimSummary.factualClaims).toBe(4);
    expect(create?.claimSummary.structurallyVerified).toBe(1);
    expect(create?.claimSummary.languageClaims).toBe(1);
    // 1 of 4 facts, not 2 of 5: the pleasant sentence is not part of the score.
    expect(create?.confidence).toBe(0.25);
  });
});

describe('determinism', () => {
  it('produces identical bytes across runs, save the one field with a clock in it', async () => {
    const first = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });
    const second = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    expect(productModelHash(second.model)).toBe(productModelHash(first.model));
    expect(serializeProductModel(second.model)).toBe(
      serializeProductModel({
        ...first.model,
        source: { ...first.model.source, generatedAt: second.model.source.generatedAt },
      }),
    );
  });

  it('is already in canonical form, so writing it changes nothing', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    expect(serializeProductModel(normaliseProductModel(run.model))).toBe(
      serializeProductModel(run.model),
    );
  });

  it('sorts every array by id', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });
    const sorted = (values: readonly string[]): boolean =>
      values.every((value, index) => index === 0 || (values[index - 1] ?? '') <= value);

    expect(sorted(run.model.features.map((feature) => feature.id))).toBe(true);
    expect(sorted(run.model.workflows.map((workflow) => workflow.id))).toBe(true);
    expect(sorted(run.model.claims.map((claim) => claim.id))).toBe(true);
    expect(sorted(run.model.permissions.map((permission) => permission.id))).toBe(true);
    for (const feature of run.model.features) {
      expect(sorted(feature.claims)).toBe(true);
      expect(sorted(feature.dependsOn)).toBe(true);
      expect(sorted(feature.relatedFeatures)).toBe(true);
    }
  });

  it('excludes generatedAt from the hash and includes everything else', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const moved = { ...run.model, source: { ...run.model.source, generatedAt: 'later' } };
    expect(productModelHash(moved)).toBe(productModelHash(run.model));

    const renamed = { ...run.model, source: { ...run.model.source, provider: 'other' } };
    expect(productModelHash(renamed)).not.toBe(productModelHash(run.model));
  });
});

describe('refusals are persisted, not dropped', () => {
  it('keeps every refused claim with the reason it was refused for', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    const refused = run.model.claims.filter(
      (claim) => claim.featureId === 'clients.create' && claim.status === 'rejected',
    );
    expect(refused.map((claim) => claim.rejection?.reason).sort()).toEqual([
      'UNKNOWN_ROUTE',
      'UNKNOWN_SUBJECT',
      'UNSUPPORTED_CLAIM_RULE',
    ]);
    // The text the model wrote is kept verbatim, so a reviewer can see what it
    // tried to say rather than only that something was stopped.
    expect(refused.map((claim) => claim.text)).toContain(
      'Clients can be imported from a CSV file.',
    );
  });

  it('separates "we could not check this" from "this is false"', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    const create = run.model.features.find((feature) => feature.id === 'clients.create');
    expect(create?.claimSummary.unsupportedActions).toEqual({ import: 1 });
    const unsupported = run.model.claims.find(
      (claim) => claim.rejection?.reason === 'UNSUPPORTED_CLAIM_RULE',
    );
    expect(unsupported?.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(unsupported?.status).toBe('rejected');
  });

  it('counts what the structured layer stopped, by category', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    // `feature:reporting.dashboard` names nothing, in any feature's pack.
    expect(run.model.verification.rejectionsByReason.UNKNOWN_SUBJECT).toBe(FEATURE_IDS.length);
    expect(run.model.verification.blocked.unknownReferences).toBeGreaterThan(0);
    // The summary is counted from the persisted claims, so the two can never
    // disagree — which is the property worth asserting, not a magic total.
    expect(run.model.verification.claimsRejected).toBe(
      run.model.claims.filter((claim) => claim.status === 'rejected').length,
    );
    expect(run.rejected.filter((entry) => entry.claim !== undefined).length).toBe(
      run.model.verification.claimsRejected,
    );
    expect(run.model.verification.structurallyVerified).toBe(
      run.model.claims.filter((claim) => claim.status === 'structurally_verified').length,
    );
  });

  it('records a schema violation as a feature-level refusal', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ malformed: [`${FEATURE_ENRICHMENT_TASK}:clients.create`] }),
    });

    expect(run.model.features.map((feature) => feature.id)).not.toContain('clients.create');
    expect(run.model.verification.featuresRejected).toBe(1);
    expect(run.model.verification.rejectionsByReason.SCHEMA_VIOLATION).toBe(1);
    const refusal = run.rejected.find((entry) => entry.featureId === 'clients.create');
    expect(refusal?.claim).toBeUndefined();
    expect(refusal?.reason).toBe('SCHEMA_VIOLATION');
  });

  it('survives a provider that simply fails, without inventing a rejection reason', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({
        fail: { [`${FEATURE_ENRICHMENT_TASK}:clients.create`]: 'rate_limited' },
      }),
    });

    const refusal = run.rejected.find((entry) => entry.featureId === 'clients.create');
    expect(refusal?.reason).toBeUndefined();
    expect(refusal?.detail).toContain('rate_limited');
    // A provider failure is not a semantic rejection and does not pollute the
    // vocabulary a reader uses to judge the verifier.
    expect(run.model.verification.rejectionsByReason.SCHEMA_VIOLATION).toBeUndefined();
    expect(run.model.features.length).toBe(FEATURE_IDS.length - 1);
  });
});

describe('fingerprint reuse', () => {
  it('reuses every unchanged feature without calling the provider once', async () => {
    const graph = clientsGraph();
    const first = await enrichApplicationGraph({ graph, provider: createMockProvider() });

    const provider = createMockProvider();
    const second = await enrichApplicationGraph({ graph, provider, previous: first.model });

    expect(provider.calls).toEqual([]);
    expect(second.reused).toEqual(FEATURE_IDS);
    expect(second.usage).toEqual({ latencyMs: 0 });
    expect(productModelHash(second.model)).toBe(productModelHash(first.model));
  });

  it('re-enriches only the feature whose facts moved', async () => {
    const first = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const provider = createMockProvider();
    const second = await enrichApplicationGraph({
      graph: graphWithMovedInvoiceButton(),
      provider,
      previous: first.model,
    });

    expect(provider.calls.map((call) => call.featureId)).toEqual(['invoices.create']);
    expect(second.reused).toEqual(FEATURE_IDS.filter((id) => id !== 'invoices.create'));
  });

  it('keeps a reused claim pointing at the graph it was actually checked against', async () => {
    const first = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });
    const second = await enrichApplicationGraph({
      graph: graphWithMovedInvoiceButton(),
      provider: createMockProvider(),
      previous: first.model,
    });

    const reusedClaim = second.model.claims.find((claim) => claim.featureId === 'clients.create');
    const freshClaim = second.model.claims.find((claim) => claim.featureId === 'invoices.create');
    expect(second.model.source.graphHash).not.toBe(first.model.source.graphHash);
    // The reused claim was derived from the old graph and says so; rewriting the
    // hash would erase the only record of when it was last checked.
    expect(reusedClaim?.provenance.graphHash).toBe(first.model.source.graphHash);
    expect(freshClaim?.provenance.graphHash).toBe(second.model.source.graphHash);
  });

  it('ignores a previous model that has nothing to say about a candidate', async () => {
    const first = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
      candidateLimit: 1,
    });

    const provider = createMockProvider();
    const second = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider,
      previous: first.model,
    });

    expect(second.reused).toEqual(['clients.create']);
    expect(provider.calls.length).toBe(FEATURE_IDS.length - 1);
  });
});

describe('reuse is a replay, not a copy', () => {
  it('re-verifies a stored claim instead of trusting the file it came from', async () => {
    // The attack this closes: `product.json` is a committed artefact. Edit a
    // claim in it, leave the graph alone, and a copy-forward reuse would
    // re-project the edit into documentation under "structurally verified" for
    // ever, because nothing would ever look at it again.
    const graph = clientsGraph();
    const first = await enrichApplicationGraph({ graph, provider: createMockProvider() });

    const tampered = structuredClone(first.model);
    const target = tampered.claims.find(
      (claim) => claim.featureId === 'clients.create' && claim.status === 'structurally_verified',
    );
    expect(target).toBeDefined();
    if (target?.assertion !== undefined) {
      target.assertion.targets = ['api:POST:/salesforce/contacts'];
      target.text = 'Creating a client also creates the matching Salesforce contact.';
    }

    const provider = createMockProvider();
    const second = await enrichApplicationGraph({ graph, provider, previous: tampered });

    expect(provider.calls).toEqual([]);
    expect(second.reused).toContain('clients.create');
    const replayed = second.model.claims.find((claim) => claim.id === target?.id);
    expect(replayed?.status).toBe('rejected');
    expect(replayed?.rejection?.reason).toBe('UNKNOWN_GRAPH_REFERENCE');
  });

  it('re-runs the wording gate over a stored feature title', async () => {
    const graph = clientsGraph();
    const first = await enrichApplicationGraph({ graph, provider: createMockProvider() });

    const tampered = structuredClone(first.model);
    const feature = tampered.features.find((entry) => entry.id === 'clients.create');
    if (feature !== undefined) feature.title = 'Bulk export clients to Excel';

    const second = await enrichApplicationGraph({
      graph,
      provider: createMockProvider(),
      previous: tampered,
    });
    const republished = second.model.features.find((entry) => entry.id === 'clients.create');
    expect(republished?.title).not.toContain('Excel');
  });

  it('refuses to reuse anything a different generator version produced', async () => {
    const graph = clientsGraph();
    const first = await enrichApplicationGraph({ graph, provider: createMockProvider() });
    const older = structuredClone(first.model);
    older.source.generatorVersion = '1.0.0';

    const provider = createMockProvider();
    const second = await enrichApplicationGraph({ graph, provider, previous: older });

    expect(second.reused).toEqual([]);
    expect(provider.calls.length).toBe(FEATURE_IDS.length);
    expect(second.warnings.join(' ')).toContain('older verification matrix');
  });

  it('keeps the attribution of whoever actually wrote the words', async () => {
    const graph = clientsGraph();
    const first = await enrichApplicationGraph({ graph, provider: createMockProvider() });
    const second = await enrichApplicationGraph({
      graph,
      provider: { ...createMockProvider(), name: 'someone-else', model: 'other-model-1' },
      previous: first.model,
    });

    const reused = second.model.features.find((entry) => entry.id === 'clients.create');
    expect(reused?.generatedBy?.provider).toBe('mock');
    expect(second.model.source.provider).toBe('someone-else');
  });
});

describe('an unanswered provider is not a refusal', () => {
  it('counts a transport failure as neither enriched nor refused, and says why', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ fail: { [FEATURE_ENRICHMENT_TASK]: 'rate_limited' } }),
    });

    // Nothing was verified, so nothing may be reported as having failed
    // verification. The candidates are simply unaccounted for, and the gap
    // between `featureCandidates` and `featuresEnriched` is where a reader sees
    // it.
    expect(run.model.verification.featuresEnriched).toBe(0);
    expect(run.model.verification.featuresRejected).toBe(0);
    expect(run.model.verification.featureCandidates).toBe(FEATURE_IDS.length);
    expect(run.warnings.join(' ')).toContain('the provider did not answer');
    expect(run.model.verification.rejectionsByReason).toEqual({});
  });

  it('still counts a schema violation as a refusal, because the model did answer', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ malformed: [FEATURE_ENRICHMENT_TASK] }),
    });
    expect(run.model.verification.featuresEnriched).toBe(FEATURE_IDS.length);
    expect(run.model.verification.featuresRejected).toBe(FEATURE_IDS.length);
  });
});

describe('the renderer is fenced off from everything it must not see', () => {
  it('receives accepted claims only, and a draft with no description in it', async () => {
    const seen: ProseRenderRequest[] = [];
    const renderer: ProseRenderer = {
      name: 'spy',
      render(request) {
        seen.push(request);
        return Promise.resolve({ description: 'Rendered from claims.' });
      },
    };

    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
      renderer,
    });

    expect(seen.length).toBeGreaterThan(0);
    for (const request of seen) {
      expect(request.claims.every((claim) => claim.status !== 'rejected')).toBe(true);
      expect(request.feature.description).toBe('');
      expect(request.feature.purpose).toBeUndefined();
    }
    // The model wrote a paragraph about spreadsheets and CRM sync. None of it
    // reached the feature, because the renderer was never shown it.
    for (const feature of run.model.features) {
      expect(feature.description).toBe('Rendered from claims.');
    }
  });

  it('uses the deterministic renderer when none is supplied', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    const create = run.model.features.find((feature) => feature.id === 'clients.create');
    expect(create?.description).toBe('You can create a new client from the Clients screen.');
    expect(create?.description).not.toMatch(/spreadsheet|sync|CRM/i);
  });

  it('takes a feature’s purpose from an accepted language claim', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    const create = run.model.features.find((feature) => feature.id === 'clients.create');
    expect(create?.purpose).toBe('Someone uses this to add a client.');
  });
});

describe('workflows', () => {
  it('builds every step out of a verified workflow_step claim', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const workflow = run.model.workflows.find((entry) => entry.featureId === 'clients.list');
    expect(workflow?.id).toBe('clients.list#workflow');
    expect(workflow?.steps.map((step) => step.index)).toEqual([1, 2]);
    for (const step of workflow?.steps ?? []) {
      const backing = run.model.claims.find(
        (claim) => claim.type === 'workflow_step' && claim.text === step.text,
      );
      expect(backing?.status).toBe('structurally_verified');
      expect(step.targets.length).toBeGreaterThan(0);
    }
    expect(run.model.features.find((feature) => feature.id === 'clients.list')?.workflows).toEqual([
      'clients.list#workflow',
    ]);
  });

  it('gives a feature no workflow when nothing addressable survived', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider({ responses: { [FEATURE_ENRICHMENT_TASK]: HOSTILE_RESPONSE } }),
    });

    expect(run.model.workflows).toEqual([]);
    for (const feature of run.model.features) expect(feature.workflows).toEqual([]);
  });
});

describe('run mechanics', () => {
  it('accumulates usage across every call it made', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    expect(run.usage.inputTokens ?? 0).toBeGreaterThan(0);
    expect(run.usage.outputTokens ?? 0).toBeGreaterThan(0);
    expect(run.usage.costUsd).toBe(0);
  });

  it('caps candidates before any provider call is made', async () => {
    const provider = createMockProvider();
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider,
      candidateLimit: 2,
    });

    expect(provider.calls.length).toBe(2);
    expect(run.model.verification.featureCandidates).toBe(2);
    expect(run.model.features.map((feature) => feature.id)).toEqual([
      'clients.create',
      'clients.delete',
    ]);
  });

  it('reports progress in candidate order', async () => {
    const events: EnrichmentEvent[] = [];
    await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
      candidateLimit: 2,
      onProgress: (event) => events.push(event),
    });

    expect(events).toEqual([
      { kind: 'candidate', featureId: 'clients.create', index: 1, total: 2 },
      { kind: 'accepted', featureId: 'clients.create', confidence: 1 },
      { kind: 'candidate', featureId: 'clients.delete', index: 2, total: 2 },
      { kind: 'accepted', featureId: 'clients.delete', confidence: 1 },
    ]);
  });

  it('stops on an abort signal and describes only what completed', async () => {
    const controller = new AbortController();
    const events: EnrichmentEvent[] = [];
    const provider = createMockProvider();

    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider,
      signal: controller.signal,
      onProgress: (event) => {
        events.push(event);
        if (event.kind === 'accepted') controller.abort();
      },
    });

    expect(provider.calls.length).toBe(1);
    expect(run.model.features.map((feature) => feature.id)).toEqual(['clients.create']);
    expect(events.at(-1)).toEqual({ kind: 'cancelled', completed: 1, total: 8 });
    expect(run.warnings.some((warning) => warning.includes('cancelled'))).toBe(true);
    // A cancelled run is not a run that refused seven features.
    expect(run.model.verification.featuresRejected).toBe(0);
    expect(run.model.verification.featuresEnriched).toBe(1);
  });

  it('relates features that share graph facts, and only those', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });

    const create = run.model.features.find((feature) => feature.id === 'clients.create');
    expect(create?.relatedFeatures).not.toContain('clients.create');
    expect(create?.relatedFeatures).toContain('clients.delete');
    // The invoices feature shares nothing with the clients cluster.
    expect(create?.relatedFeatures).not.toContain('invoices.create');
  });
});

describe('the caveats a run produces reach a reader', () => {
  it('reports a truncated pack, rather than leaving it in an object nobody prints', async () => {
    // `packages/semantic/README.md` promises "a truncated pack is verified
    // against a partial neighbourhood — a warning says so". `ProductModel` has
    // no field for a warning, so the terminal report is the only place that
    // promise can be kept, and this is the test that keeps it honest.
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
      limits: { maxNodes: 3, maxRelationships: 2 },
    });

    expect(run.warnings.join(' ')).toContain('truncated');
    expect(formatEnrichmentReport(run).join('\n')).toContain('truncated');
  });

  it('prints nothing under Caveats when a run had none', async () => {
    const run = await enrichApplicationGraph({
      graph: clientsGraph(),
      provider: createMockProvider(),
    });
    const report = formatEnrichmentReport(run).join('\n');
    if (run.warnings.length === 0) expect(report).not.toContain('Caveats');
  });
});
