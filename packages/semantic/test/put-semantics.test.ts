/**
 * PUT is an update verb, not a create verb.
 *
 * `PUT /clients/:id` is replacement far more often than creation. If the generic
 * matrix accepted it as evidence of a create capability, every ordinary update
 * flow in every application would acquire one — a false positive produced at
 * scale, silently, from perfectly normal code.
 *
 * So the built-in rule for `create` is POST-only, and an application that
 * genuinely upserts with PUT has to say so explicitly by registering a domain
 * verifier. These tests pin all three halves of that bargain: the refusal, the
 * update claim the same evidence *does* support, and the escape hatch.
 *
 * The same reasoning removed the generic `search` rule, so the extension case is
 * covered here too — `GET /clients` proves listing, and listing is not searching.
 */

import { describe, expect, it } from 'vitest';
import { CONFIDENCE, apiId, createRelationship } from '@statewavedev/guide-indexer';
import type { ApplicationNode, Relationship } from '@statewavedev/guide-indexer';
import { createClaimVerifierRegistry } from '../src/registry.js';
import { ID, clientsGraph, factual, makeGraph, onlyClaim, verifyFixture } from './helpers.js';

const PAGE = 'src/pages/ClientsPage.tsx';
const PUT_ENDPOINT = apiId('PUT', '/clients/:clientId');

/**
 * The clients fixture plus a PUT endpoint on the edit flow.
 *
 * Built as its own graph rather than by extending the shared fixture, because
 * several evidence-pack tests assert exact node counts on bounded packs.
 */
function graphWithPut() {
  const base = clientsGraph();
  const putNode: ApplicationNode = {
    kind: 'api',
    id: PUT_ENDPOINT,
    method: 'PUT',
    path: '/clients/:clientId',
    observedOn: ['frontend'],
    provenances: [{ source: 'source-code', file: PAGE, line: 40 }],
    provenance: { source: 'source-code', file: PAGE, line: 40 },
  };
  const putEdge: Relationship = createRelationship(
    'calls_api',
    ID.handleEdit,
    PUT_ENDPOINT,
    CONFIDENCE.DIRECT_SYNTAX,
    [{ type: 'source', file: PAGE, line: 40, column: 3 }],
  );
  return makeGraph([...base.nodes, putNode], [...base.relationships, putEdge]);
}

describe('PUT does not prove creation', () => {
  it('refuses a create capability backed only by a PUT update flow', () => {
    // The negative control. `PUT /clients/:clientId` is reached from the edit
    // handler; nothing here creates anything.
    const result = verifyFixture({
      graph: graphWithPut(),
      featureId: 'clients.edit',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'create',
          subjectRef: ID.edit,
          targets: [ID.edit, PUT_ENDPOINT],
        }),
      ],
    });

    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    // Real evidence pointed at the wrong claim — not a missing fact.
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
  });

  it('upholds an update capability from that same PUT evidence', () => {
    // The positive control. Removing PUT from `create` must not weaken `update`:
    // replacement genuinely is an update, and the asymmetry is the whole point.
    const result = verifyFixture({
      graph: graphWithPut(),
      featureId: 'clients.edit',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'update',
          subjectRef: ID.edit,
          targets: [ID.edit, PUT_ENDPOINT],
        }),
      ],
    });

    const claim = onlyClaim(result);
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
    expect(claim.evidence.map((entry) => entry.ref)).toContain(PUT_ENDPOINT);
  });

  it('lets a registered domain verifier support PUT-based creation', () => {
    // The escape hatch. An application that really does upsert with PUT can say
    // so — but it must say so deliberately, and it must still cite evidence the
    // universal checks already accepted.
    const registry = createClaimVerifierRegistry();
    registry.register({
      type: 'capability',
      action: 'create',
      verify(context) {
        const upsert = context.assertion.targets.find((id) => {
          const node = context.resolveTarget(id);
          return node?.kind === 'api' && node.method === 'PUT';
        });
        return upsert === undefined
          ? { satisfied: false, evidence: [], detail: 'no PUT endpoint among the cited facts' }
          : {
              satisfied: true,
              evidence: [upsert],
              detail: 'this application upserts with PUT, declared by a registered verifier',
            };
      },
    });

    const result = verifyFixture({
      graph: graphWithPut(),
      featureId: 'clients.edit',
      registry,
      factualClaims: [
        factual({
          type: 'capability',
          action: 'create',
          subjectRef: ID.edit,
          targets: [ID.edit, PUT_ENDPOINT],
        }),
      ],
    });

    const claim = onlyClaim(result);
    expect(claim.status).toBe('structurally_verified');
    expect(claim.evidence.map((entry) => entry.ref)).toContain(PUT_ENDPOINT);
  });

  it('still refuses PUT-creation when the registered verifier cites nothing', () => {
    // The escape hatch is not a bypass: a custom verifier that claims success
    // without evidence is itself a rejection.
    const registry = createClaimVerifierRegistry();
    registry.register({
      type: 'capability',
      action: 'create',
      verify: () => ({ satisfied: true, evidence: [], detail: 'trust me' }),
    });

    const result = verifyFixture({
      graph: graphWithPut(),
      featureId: 'clients.edit',
      registry,
      factualClaims: [
        factual({
          type: 'capability',
          action: 'create',
          subjectRef: ID.edit,
          targets: [ID.edit, PUT_ENDPOINT],
        }),
      ],
    });

    expect(onlyClaim(result).status).toBe('rejected');
  });
});

describe('search is unsupported until an application proves it', () => {
  it('refuses search from a list endpoint', () => {
    const result = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'search',
          subjectRef: ID.list,
          targets: [ID.list, ID.get],
        }),
      ],
    });

    const claim = onlyClaim(result);
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
  });

  it('lets a registered domain verifier support search on explicit evidence', () => {
    // Proves the registry can carry `capability:search` later, once an
    // application has a real search signal to point at. Filed under the search
    // box, which owns `GET /clients` through its own handler, so the only thing
    // standing between the claim and acceptance is the missing rule.
    const registry = createClaimVerifierRegistry();
    registry.register({
      type: 'capability',
      action: 'search',
      verify(context) {
        const element = context.assertion.targets.find(
          (id) => context.resolveTarget(id)?.kind === 'element',
        );
        return element === undefined
          ? { satisfied: false, evidence: [], detail: 'no search element cited' }
          : { satisfied: true, evidence: [element], detail: 'declared search element' };
      },
    });

    const result = verifyFixture({
      featureId: 'clients.search',
      registry,
      factualClaims: [
        factual({
          type: 'capability',
          action: 'search',
          subjectRef: ID.search,
          targets: [ID.search, ID.get],
        }),
      ],
    });

    expect(onlyClaim(result).status).toBe('structurally_verified');
  });
});
