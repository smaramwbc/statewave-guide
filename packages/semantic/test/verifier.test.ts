/**
 * What the verifier refuses, what it upholds, and what it declines to judge.
 *
 * The negative tests carry the weight. A verifier that accepts good input is
 * easy; the property worth pinning is that every way of being wrong lands on a
 * *specific* reason, and that "we have no rule for this" never quietly becomes
 * "verified".
 */

import { describe, expect, it } from 'vitest';
import {
  ID,
  clientsGraph,
  factual,
  featureFixture,
  language,
  onlyClaim,
  verifyFixture,
} from './helpers.js';
import { featureConfidence } from '../src/verifier.js';
import { verifyEnrichment } from '../src/verifier.js';
import { enrichment, ATTRIBUTION, PROVENANCE } from './helpers.js';

describe('positive controls, one per claim type', () => {
  it('upholds a create capability backed by a POST endpoint the subject reaches', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({ type: 'capability', action: 'create', targets: [ID.post, ID.create] }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
    expect(claim.rejection).toBeUndefined();
    expect(claim.evidence.map((entry) => entry.ref)).toContain(ID.post);
    expect(result.accepted).toBe(true);
  });

  it('upholds a view capability backed by a GET endpoint', () => {
    const result = verifyFixture({
      featureId: 'clients.search',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'view',
          subjectRef: ID.search,
          targets: [ID.get],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds an update capability backed by PATCH', () => {
    const result = verifyFixture({
      featureId: 'clients.edit',
      factualClaims: [
        factual({ type: 'capability', action: 'update', subjectRef: ID.edit, targets: [ID.patch] }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a delete capability backed by DELETE', () => {
    const result = verifyFixture({
      featureId: 'clients.delete',
      factualClaims: [
        factual({ type: 'capability', action: 'delete', subjectRef: ID.remove, targets: [ID.del] }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('refuses a search capability backed only by an input and a GET endpoint', () => {
    // This was a positive control until the matrix dropped its generic search
    // rule. `GET /api/clients` proves clients can be LISTED, and an `input`
    // element is indistinguishable from any other field — every ordinary read
    // screen has both shapes. Verifying search from them would hand a search
    // capability to every list screen in every application.
    //
    // The graph carries no search signal, so there is nothing honest to check
    // against and the claim fails closed. An application with real, deterministic
    // search evidence can register a domain verifier; see registry.test.ts.
    const result = verifyFixture({
      featureId: 'clients.search',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'search',
          subjectRef: ID.search,
          targets: [ID.search, ID.get],
        }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
  });

  it('still upholds a view capability from that same read evidence', () => {
    // Removing search must not weaken read claims: a route, component or GET
    // endpoint genuinely does prove something is viewable.
    const result = verifyFixture({
      featureId: 'clients.search',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'view',
          subjectRef: ID.search,
          targets: [ID.search, ID.get],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a submit capability backed by a submits_to relationship', () => {
    const result = verifyFixture({
      featureId: 'clients.form',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'submit',
          subjectRef: ID.form,
          targets: [ID.form, ID.handleCreate],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a navigate capability backed by navigates_to', () => {
    const result = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'navigate',
          subjectRef: ID.list,
          targets: [ID.routeDetail],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a navigation claim naming a route the pack contains', () => {
    const result = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'navigation',
          subjectRef: ID.list,
          route: '/clients/:clientId',
          targets: [ID.routeDetail],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a permission claim whose requires_permission edge reaches the subject', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          permission: 'clients:create',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a workflow step pointing at an addressable element', () => {
    const result = verifyFixture({
      factualClaims: [factual({ type: 'workflow_step', targets: [ID.create] })],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('upholds a constraint backed by a schema the subject validates with', () => {
    const result = verifyFixture({
      factualClaims: [factual({ type: 'constraint', targets: [ID.schema] })],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('grounds a language claim without ever calling it verified', () => {
    const result = verifyFixture({ languageClaims: [language({ targets: [ID.create] })] });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('semantically_grounded');
    expect(claim.outcome).toBeUndefined();
    expect(claim.assertion).toBeUndefined();
  });
});

describe('one test per rejection reason', () => {
  /** Asserts the single claim was refused for exactly this reason. */
  function expectRefusal(result: ReturnType<typeof verifyFixture>, reason: string): void {
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.reason).toBe(reason);
    expect(result.rejectedClaims).toHaveLength(1);
    expect(result.rejectedClaims[0]?.reason).toBe(reason);
    expect(result.rejectedClaims[0]?.claim).toBe(claim.id);
    expect(claim.rejection?.detail.length).toBeGreaterThan(0);
  }

  it('UNKNOWN_SUBJECT — the subject names nothing the pipeline knows', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({ subjectRef: 'feature:clients.import', action: 'create', targets: [ID.post] }),
      ],
    });
    expectRefusal(result, 'UNKNOWN_SUBJECT');
  });

  it('SUBJECT_OUT_OF_SCOPE — the subject is real, but it is the feature next door', () => {
    // The delete button exists, sits on the same page and is deliberately in
    // this feature's evidence, so the model can see what creating is not.
    // Refusing it as unknown would tell a reader the button is not there; the
    // truth is narrower and more useful — it is there, and it is not this.
    const result = verifyFixture({
      factualClaims: [factual({ subjectRef: ID.remove, action: 'create', targets: [ID.post] })],
    });
    expectRefusal(result, 'SUBJECT_OUT_OF_SCOPE');
  });

  it('UNKNOWN_GRAPH_REFERENCE — a cited id does not exist', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({ action: 'create', targets: [ID.post, 'api:POST:/clients/import'] }),
      ],
    });
    expectRefusal(result, 'UNKNOWN_GRAPH_REFERENCE');
  });

  it('NO_SUPPORTING_EVIDENCE — a real id from a different feature is not support', () => {
    const result = verifyFixture({
      factualClaims: [factual({ action: 'create', targets: [ID.invoiceApi] })],
    });
    expectRefusal(result, 'NO_SUPPORTING_EVIDENCE');
    expect(result.rejectedClaims[0]?.detail).toContain('not in this feature');
  });

  it('NO_SUPPORTING_EVIDENCE — a factual claim citing nothing at all', () => {
    const result = verifyFixture({ factualClaims: [factual({ action: 'create', targets: [] })] });
    expectRefusal(result, 'NO_SUPPORTING_EVIDENCE');
  });

  it('UNSUPPORTED_CAPABILITY — nothing cited is even the right kind of thing', () => {
    const result = verifyFixture({
      factualClaims: [factual({ action: 'create', targets: [ID.schema] })],
    });
    expectRefusal(result, 'UNSUPPORTED_CAPABILITY');
  });

  it('UNKNOWN_ROUTE — the claim names a route the evidence does not contain', () => {
    const result = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'navigation',
          subjectRef: ID.list,
          route: '/admin/clients',
          targets: [ID.routeDetail],
        }),
      ],
    });
    expectRefusal(result, 'UNKNOWN_ROUTE');
  });

  it('UNKNOWN_PERMISSION — the claim names a permission the evidence does not contain', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          permission: 'clients:destroy',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    expectRefusal(result, 'UNKNOWN_PERMISSION');
  });

  it('UNKNOWN_ENDPOINT — the rule needs an endpoint and none was cited', () => {
    const result = verifyFixture({
      featureId: 'clients.form',
      factualClaims: [
        factual({ subjectRef: ID.form, action: 'create', targets: [ID.form, ID.handleCreate] }),
      ],
    });
    expectRefusal(result, 'UNKNOWN_ENDPOINT');
  });

  it('UNKNOWN_ENDPOINT — the only cited endpoint has a path the indexer could not resolve', () => {
    const result = verifyFixture({
      featureId: 'clients.export',
      factualClaims: [
        factual({
          action: 'view',
          subjectRef: ID.exportButton,
          targets: [ID.unresolvedExport],
        }),
      ],
    });
    expectRefusal(result, 'UNKNOWN_ENDPOINT');
  });

  it('EVIDENCE_DOES_NOT_SUPPORT_CLAIM — a create claim citing a GET endpoint', () => {
    const result = verifyFixture({
      featureId: 'clients.search',
      factualClaims: [
        factual({ subjectRef: 'feature:clients.search', action: 'create', targets: [ID.get] }),
      ],
    });
    expectRefusal(result, 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(result.rejectedClaims[0]?.detail).toContain('GET');
  });

  it('TARGET_OUT_OF_SCOPE — a permission that gates something else entirely', () => {
    // `clients:export` is a real permission, in this very pack, required by a
    // real element. It belongs to the export button, and calling that weak
    // evidence would send a reader hunting for better evidence for a claim
    // whose evidence was never this feature's to cite.
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          text: 'Only exporters can create clients.',
          permission: 'clients:export',
          targets: [ID.permissionExport],
        }),
      ],
    });
    expectRefusal(result, 'TARGET_OUT_OF_SCOPE');
  });

  it('UNSUPPORTED_CONSTRAINT — a constraint with no schema or gate behind it', () => {
    const result = verifyFixture({
      factualClaims: [factual({ type: 'constraint', targets: [ID.create] })],
    });
    expectRefusal(result, 'UNSUPPORTED_CONSTRAINT');
  });

  it('UNSUPPORTED_WORKFLOW_STEP — a step pointing at nothing addressable', () => {
    const result = verifyFixture({
      factualClaims: [factual({ type: 'workflow_step', targets: [ID.schema] })],
    });
    expectRefusal(result, 'UNSUPPORTED_WORKFLOW_STEP');
  });

  it('UNSUPPORTED_CLAIM_RULE — the matrix has no rule for this assertion', () => {
    const result = verifyFixture({
      factualClaims: [factual({ action: 'import', targets: [ID.post] })],
    });
    expectRefusal(result, 'UNSUPPORTED_CLAIM_RULE');
  });

  it('refuses a language claim that cites a fact from another feature', () => {
    const result = verifyFixture({
      languageClaims: [language({ type: 'synonym', targets: [ID.invoiceApi] })],
    });
    expectRefusal(result, 'NO_SUPPORTING_EVIDENCE');
    expect(onlyClaim(result).outcome).toBeUndefined();
  });

  it('refuses a language claim that cites an id the graph does not contain', () => {
    const result = verifyFixture({
      languageClaims: [language({ type: 'user_question', targets: ['element:clients.import'] })],
    });
    expectRefusal(result, 'UNKNOWN_GRAPH_REFERENCE');
  });
});

describe('a stated value must be the value the cited facts prove', () => {
  // `route` and `permission` are the two fields where a model writes a value
  // rather than an id. Membership in the pack is not enough on its own: a pack
  // is a *neighbourhood*, so a sibling feature's route and half a dozen
  // permissions are legitimately in it, and any of them would pass a membership
  // test while proving nothing about this claim.

  it('POSITIVE CONTROL: a permission claim naming what its cited edge proves', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          permission: 'clients:create',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('refuses a permission claim naming a real permission its evidence does not reach', () => {
    // `clients:export` is real, is in this pack, and gates the export button.
    // The claim cites the permission node that proves `clients:create`. Without
    // this check the page would print "It requires the clients:export
    // permission" two paragraphs below a table saying `clients:create`.
    const result = verifyFixture({
      factualClaims: [
        factual({
          type: 'permission',
          permission: 'clients:export',
          text: 'It requires the clients:export permission.',
          targets: [ID.permissionCreate],
        }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(claim.rejection?.detail).toContain('clients:export');
    expect(claim.rejection?.detail).toContain('clients:create');
  });

  it('POSITIVE CONTROL: a navigation claim naming the route its edge reaches', () => {
    const result = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'navigation',
          subjectRef: ID.list,
          route: '/clients/:clientId',
          targets: [ID.routeDetail],
        }),
      ],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('refuses a navigation claim naming a real route its evidence does not reach', () => {
    const result = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'navigation',
          subjectRef: ID.list,
          route: '/clients',
          text: 'It is reached at /clients.',
          targets: [ID.routeDetail],
        }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(claim.rejection?.detail).toContain('/clients/:clientId');
  });

  it('still calls a value the graph has never seen unknown, rather than unsupported', () => {
    const invented = verifyFixture({
      factualClaims: [
        factual({ type: 'permission', permission: 'admin:all', targets: [ID.permissionCreate] }),
      ],
    });
    expect(onlyClaim(invented).rejection?.reason).toBe('UNKNOWN_PERMISSION');
  });
});

describe('import, export and send fail closed', () => {
  it.each(['import', 'export', 'send'] as const)(
    'resolves %s to EXPLICITLY_UNSUPPORTED rather than to verified',
    (action) => {
      const result = verifyFixture({
        factualClaims: [factual({ action, targets: [ID.post, ID.create] })],
      });
      const claim = onlyClaim(result);
      expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
      expect(claim.status).toBe('rejected');
      expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
      expect(result.claimSummary.unsupportedActions).toEqual({ [action]: 1 });
      expect(result.claimSummary.structurallyVerified).toBe(0);
    },
  );

  it('says "not checked", never "cannot be done"', () => {
    const result = verifyFixture({
      factualClaims: [factual({ action: 'export', targets: [ID.exportButton] })],
    });
    expect(onlyClaim(result).rejection?.detail).toContain('not checked');
    expect(result.warnings.join(' ')).toContain('not the same as being disproved');
  });

  it('distinguishes a deliberate gap in the matrix from an accidental one', () => {
    const deliberate = verifyFixture({
      featureId: 'clients.export',
      factualClaims: [
        factual({ subjectRef: ID.exportButton, action: 'export', targets: [ID.exportButton] }),
      ],
    });
    expect(onlyClaim(deliberate).rejection?.detail).toContain('deliberately');

    const accidental = verifyFixture({
      featureId: 'clients.list',
      factualClaims: [
        factual({
          type: 'navigation',
          action: 'view',
          subjectRef: ID.list,
          targets: [ID.routeDetail],
        }),
      ],
    });
    expect(onlyClaim(accidental).outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(onlyClaim(accidental).rejection?.detail).not.toContain('deliberately');
  });

  it('counts an unsupported action separately from an ordinary rejection', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({ action: 'export', targets: [ID.exportButton] }),
        factual({ action: 'create', targets: [ID.get] }),
      ],
    });
    expect(result.claimSummary.factualRejected).toBe(2);
    expect(result.claimSummary.unsupportedActions).toEqual({ export: 1 });
  });

  it('has no rule for a capability with no action at all', () => {
    const result = verifyFixture({
      factualClaims: [factual({ targets: [ID.post] })],
    });
    expect(onlyClaim(result).outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(result.claimSummary.unsupportedActions).toEqual({ capability: 1 });
  });
});

describe('claimSummary arithmetic', () => {
  const result = verifyFixture({
    factualClaims: [
      factual({ action: 'create', targets: [ID.post] }),
      factual({ action: 'create', text: 'Clients can be created from a GET.', targets: [ID.get] }),
      factual({ action: 'export', targets: [ID.exportButton] }),
    ],
    languageClaims: [
      language({ targets: [ID.create] }),
      language({ type: 'synonym', text: 'new client', targets: [] }),
      language({ type: 'user_question', text: 'How do I add a client?', targets: [ID.invoiceApi] }),
    ],
  });

  it('counts factual and language claims separately and completely', () => {
    expect(result.claimSummary).toEqual({
      factualClaims: 3,
      structurallyVerified: 1,
      factualRejected: 2,
      languageClaims: 3,
      // The synonym cites nothing and the question cites another feature's
      // endpoint; only the purpose is attached to a fact of this feature's.
      semanticallyGrounded: 1,
      languageRejected: 2,
      unsupportedActions: { export: 1 },
    });
  });

  it('keeps every claim, refusals included', () => {
    expect(result.claims).toHaveLength(6);
    expect(result.rejectedClaims).toHaveLength(4);
    expect(result.claims.filter((claim) => claim.status === 'rejected')).toHaveLength(4);
  });

  it('adds up: factual = verified + rejected, language = grounded + rejected', () => {
    const summary = result.claimSummary;
    expect(summary.structurallyVerified + summary.factualRejected).toBe(summary.factualClaims);
    expect(summary.semanticallyGrounded + summary.languageRejected).toBe(summary.languageClaims);
    const unsupported = Object.values(summary.unsupportedActions).reduce((a, b) => a + b, 0);
    expect(unsupported).toBeLessThanOrEqual(summary.factualRejected);
  });

  it('reports evidence coverage over accepted claims only', () => {
    // Two accepted claims: one verified capability and one grounded purpose.
    // Both carry evidence, because a claim that carries none is no longer
    // accepted at all.
    expect(result.evidenceCoverage).toBe(1);
    for (const claim of result.claims.filter((entry) => entry.status !== 'rejected')) {
      expect(claim.evidence.length).toBeGreaterThan(0);
    }
  });

  it('refuses an interpretation that cites nothing rather than grounding it in nothing', () => {
    const grounded = result.claims.find((claim) => claim.type === 'synonym');
    expect(grounded?.status).toBe('rejected');
    expect(grounded?.rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
    expect(grounded?.rejection?.detail).toContain('grounded in nothing');
  });

  it('gives every factual claim exactly one outcome and language claims none', () => {
    for (const claim of result.claims) {
      if (claim.assertion === undefined) {
        expect(claim.outcome).toBeUndefined();
        continue;
      }
      expect([
        'SUPPORTED_VERIFICATION_RULE',
        'EXPLICITLY_UNSUPPORTED',
        'REJECTED_INVALID',
      ]).toContain(claim.outcome);
    }
  });
});

describe('confidence covers factual claims only', () => {
  it('is not inflated by ten pleasant sentences', () => {
    const languageClaims = Array.from({ length: 10 }, (_, index) =>
      language({
        type: 'user_question',
        text: `How do I do thing ${index}?`,
        targets: [ID.create],
      }),
    );
    const result = verifyFixture({
      factualClaims: [
        factual({ action: 'create', targets: [ID.post] }),
        factual({
          action: 'create',
          text: 'Clients can be created from a GET.',
          targets: [ID.get],
        }),
      ],
      languageClaims,
    });

    expect(result.claimSummary.semanticallyGrounded).toBe(10);
    // Half the facts survived. Twelve of thirteen claims did, and that number
    // is exactly the lie the split exists to prevent.
    expect(featureConfidence(result.claimSummary)).toBe(0.5);
    expect(featureConfidence(result.claimSummary)).not.toBeCloseTo(11 / 12, 2);
  });

  it('scores a feature with one verified fact and ten sentences on the one fact', () => {
    const languageClaims = Array.from({ length: 10 }, (_, index) =>
      language({ text: `A perfectly nice sentence ${index}.`, targets: [ID.create] }),
    );
    const result = verifyFixture({
      factualClaims: [factual({ action: 'create', targets: [ID.post] })],
      languageClaims,
    });
    expect(result.claimSummary.factualClaims).toBe(1);
    expect(result.claimSummary.languageClaims).toBe(10);
    expect(featureConfidence(result.claimSummary)).toBe(1);
  });

  it('scores a feature with no factual claims at zero, however well written', () => {
    const result = verifyFixture({ languageClaims: [language({ targets: [ID.create] })] });
    expect(featureConfidence(result.claimSummary)).toBe(0);
    expect(result.claimSummary.semanticallyGrounded).toBe(1);
  });
});

describe('feature acceptance', () => {
  it('accepts a feature with a title, a description and one surviving claim', () => {
    const result = verifyFixture({
      factualClaims: [factual({ action: 'create', targets: [ID.post] })],
    });
    expect(result.accepted).toBe(true);
  });

  it('refuses a feature whose every claim was refused', () => {
    const result = verifyFixture({
      factualClaims: [factual({ action: 'import', targets: [ID.post] })],
    });
    expect(result.accepted).toBe(false);
  });

  it('reports a description that did not survive redaction, and keeps the feature', () => {
    // The model's own description never reaches a reader — the pipeline replaces
    // it with prose composed from accepted claims — so a description that
    // reduces entirely to a credential costs nothing that is presented. It is
    // still a fact about the response worth surfacing, so it warns.
    //
    // Refusing the feature outright is what broke replay: a reused feature is
    // reconstructed from the *stored* description, and the renderer now says
    // nothing at all about a feature whose facts support no sentence. The gate
    // read that considered silence as redaction damage and dropped the feature
    // on the second run over an unchanged graph.
    const result = verifyFixture({
      factualClaims: [factual({ action: 'create', targets: [ID.post] })],
      enrichmentOverrides: { description: 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    });
    expect(result.accepted).toBe(true);
    expect(result.warnings.join(' ')).toContain('did not survive redaction');
    // The credential itself never survives into anything the feature carries.
    expect(JSON.stringify(result)).not.toContain('sk-ant-api03-AAAA');
  });

  it('still refuses a feature whose title did not survive redaction', () => {
    // The title has no composed replacement: it is what names the page, the
    // workflow and the index row, so a feature that cannot be named cannot be
    // presented.
    const result = verifyFixture({
      factualClaims: [factual({ action: 'create', targets: [ID.post] })],
      enrichmentOverrides: { title: 'sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    });
    expect(result.accepted).toBe(false);
    expect(result.warnings.join(' ')).toContain('did not survive redaction');
  });
});

describe('provenance and identity survive verification', () => {
  it('carries the provenance a supersession decision needs onto every claim', () => {
    const result = verifyFixture({
      factualClaims: [
        factual({ action: 'create', targets: [ID.post] }),
        factual({ action: 'import', targets: [ID.post] }),
      ],
    });
    for (const claim of result.claims) {
      expect(claim.provenance).toEqual(PROVENANCE);
      expect(claim.generatedBy).toEqual(ATTRIBUTION);
      expect(claim.featureId).toBe('clients.create');
    }
  });

  it('is a pure function of its inputs', () => {
    const graph = clientsGraph();
    const { candidate, pack, knownFeatureIds } = featureFixture(graph, 'clients.create');
    const input = {
      candidate,
      knownFeatureIds,
      pack,
      graph,
      enrichment: enrichment([factual({ action: 'create', targets: [ID.post, ID.form] })]),
      attribution: ATTRIBUTION,
      provenance: PROVENANCE,
    };
    expect(JSON.stringify(verifyEnrichment(input))).toBe(JSON.stringify(verifyEnrichment(input)));
  });

  it('warns when the pack it checked against was truncated', () => {
    const graph = clientsGraph();
    const { candidate, knownFeatureIds } = featureFixture(graph, 'clients.create');
    const pack = { ...featureFixture(graph, 'clients.create').pack, truncated: true };
    const result = verifyEnrichment({
      candidate,
      knownFeatureIds,
      pack,
      graph,
      enrichment: enrichment([factual({ action: 'create', targets: [ID.post] })]),
      attribution: ATTRIBUTION,
      provenance: PROVENANCE,
    });
    expect(result.warnings.join(' ')).toContain('truncated');
  });
});
