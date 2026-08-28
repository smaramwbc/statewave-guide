/**
 * What observed behaviour has to survive before it counts as product truth.
 *
 * The runtime verifier has already had its say by the time a record reaches
 * here — but a record is a *committed artefact*, read off disk, and this layer
 * is what stands between a hand-edited JSON file and the Product Model. So it
 * re-checks the effects against its own table rather than trusting the verdict
 * that came with them, and it applies every rule a static claim would face:
 * the subject must exist in the graph, the feature must own it, an integration
 * rule must exist, the effects must satisfy it, and nothing the source proves
 * may be quietly overruled.
 *
 * Each test below removes exactly one of those and expects a named refusal.
 */

import { describe, expect, it } from 'vitest';
import { computeFeatureScope } from '../src/scope.js';
import {
  RUNTIME_VERIFICATION_RULES,
  integrateRuntimeCapability,
  runtimeRuleFor,
} from '../src/runtime-claims.js';
import type { ProductClaim } from '@statewavedev/guide-shared';

const SUBJECT = 'element:clients.search';
const CONTAINER = 'component:ClientsPage';

/** A scope in which the feature owns its search box and nothing else. */
function scope() {
  return computeFeatureScope({
    featureId: 'clients.search',
    roots: [CONTAINER],
    nodes: [
      { id: CONTAINER, kind: 'component' },
      { id: SUBJECT, kind: 'element' },
      { id: 'element:elsewhere', kind: 'element' },
    ] as never,
    relationships: [
      { id: 'r1', type: 'contains', source: CONTAINER, target: SUBJECT, confidence: 1 },
    ] as never,
  });
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    action: 'filter',
    featureId: 'clients.search',
    subjectRef: SUBJECT,
    targets: [SUBJECT],
    effects: [
      'COLLECTION_MEMBERS_CHANGED|after=2,before=5,collectionRole=table,containerSemanticId=clients.table,memberRole=row',
      'VALUE_CHANGED|semanticId=clients.search',
    ],
    rule: 'runtime/filter',
    context: { route: '/clients', fixtureState: 'seeded', permissions: [], featureFlags: {} },
    traceId: 'filter-clients',
    evidenceHash: 'a'.repeat(64),
    graphHash: 'b'.repeat(64),
    ...overrides,
  } as never;
}

const input = (overrides: Record<string, unknown> = {}, claims: ProductClaim[] = []) => ({
  record: record(overrides),
  scope: scope(),
  graphNodeIds: new Set([CONTAINER, SUBJECT, 'element:elsewhere']),
  existingClaims: claims,
  ordinal: 1,
});

describe('integrateRuntimeCapability', () => {
  it('accepts an owned subject whose effects satisfy its rule', () => {
    const outcome = integrateRuntimeCapability(input());
    expect(outcome.status).toBe('accepted');
    if (outcome.status !== 'accepted') return;
    expect(outcome.claim.status).toBe('behaviorally_verified');
    expect(outcome.claim.id).toBe('clients.search#capability:runtime:1');
    expect(outcome.claim.runtimeTraceId).toBe('filter-clients');
    expect(outcome.claim.evidence.every((item) => item.kind === 'runtime')).toBe(true);
  });

  it('refuses a subject the graph does not contain', () => {
    const outcome = integrateRuntimeCapability({
      ...input({ subjectRef: 'element:ghost', targets: ['element:ghost'] }),
      graphNodeIds: new Set([CONTAINER, SUBJECT]),
    });
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('UNMAPPED_SUBJECT');
  });

  it('refuses a subject the feature does not own, however clearly it was observed', () => {
    const outcome = integrateRuntimeCapability(
      input({ subjectRef: 'element:elsewhere', targets: ['element:elsewhere'] }),
    );
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('NOT_OWNED');
  });

  it('refuses an action with no rule rather than inventing one', () => {
    const outcome = integrateRuntimeCapability(input({ action: 'view' }));
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('NO_RUNTIME_RULE');
    expect(runtimeRuleFor('view')).toBeUndefined();
  });

  it('re-checks the effects itself, and refuses a record whose verdict it cannot reproduce', () => {
    // The verdict travelled with the record. That is not a reason to believe it:
    // the record is a file, and a file can be edited.
    const outcome = integrateRuntimeCapability(
      input({ effects: ['NETWORK_REQUEST|method=GET,path=/api/clients,statusCategory=2xx'] }),
    );
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('EFFECTS_DO_NOT_SATISFY_RULE');
  });

  it('refuses a filter whose collection changed because the screen did', () => {
    const outcome = integrateRuntimeCapability(
      input({
        effects: [
          'COLLECTION_MEMBERS_CHANGED|after=2,before=5,collectionRole=table,containerSemanticId=clients.table,memberRole=row',
          'VALUE_CHANGED|semanticId=clients.search',
          'ROUTE_CHANGED|from=/clients,to=/invoices',
        ],
      }),
    );
    expect(outcome.status).toBe('refused');
    if (outcome.status !== 'refused') return;
    expect(outcome.reason).toBe('EFFECTS_DO_NOT_SATISFY_RULE');
  });

  it('reports a disagreement with the source rather than resolving it', () => {
    const staticClaim = {
      id: 'clients.search#capability:1',
      featureId: 'clients.search',
      type: 'capability',
      text: 'deletes',
      assertion: { subjectRef: SUBJECT, action: 'delete', targets: [SUBJECT] },
      provenance: { graphHash: 'b'.repeat(64), dependencyFingerprint: 'c'.repeat(64) },
      evidence: [],
      status: 'structurally_verified',
      outcome: 'SUPPORTED_BY_EVIDENCE',
      generatedBy: { provider: 'static', model: 'none', version: '1' },
    } as unknown as ProductClaim;

    const outcome = integrateRuntimeCapability(
      input({ action: 'navigate', effects: ['ROUTE_CHANGED|from=/clients,to=/invoices'] }, [
        staticClaim,
      ]),
    );
    expect(outcome.status).toBe('contradiction');
    if (outcome.status !== 'contradiction') return;
    expect(outcome.staticClaimId).toBe('clients.search#capability:1');
  });
});

describe('RUNTIME_VERIFICATION_RULES', () => {
  it('names every action exactly once, with no default branch', () => {
    const actions = RUNTIME_VERIFICATION_RULES.map((rule) => rule.action);
    expect(new Set(actions).size).toBe(actions.length);
  });

  it('does not let a route change stand in for a selection', () => {
    // The rule that shipped a false sentence. `select` required only
    // ROUTE_CHANGED, so a control that navigates away read as one that picks a
    // row. Leaving is not selecting, and this is the assertion that says so.
    const select = runtimeRuleFor('select');
    expect(select).toBeDefined();
    expect(select?.requires).not.toContain('ROUTE_CHANGED');
    expect(select?.refusedWhen).toContain('ROUTE_CHANGED');
    // Closed Loop #11: nor may membership stand in for it. A row being added to
    // a list is not a row being picked, and the two were the same fact for one
    // whole loop.
    expect(select?.requires).not.toContain('COLLECTION_MEMBERS_CHANGED');
    expect(select?.requires).toContain('SELECTION_CHANGED');
  });

  it('refuses navigation for every rule that describes a change on the current screen', () => {
    for (const action of ['filter', 'reveal', 'open', 'select'] as const) {
      expect(runtimeRuleFor(action)?.refusedWhen).toContain('ROUTE_CHANGED');
    }
  });
});
