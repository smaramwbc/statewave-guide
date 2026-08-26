/**
 * The prose gap: four attacks on the distance between what an application's
 * words say and what its graph proves.
 *
 * Every fixture here is built so that the *vocabulary* of the attack is present
 * in the application and the *relationship* it asserts is not. That is the only
 * arrangement in which the result means anything. A fixture with no CSV in it
 * would let a verifier pass Attack A by grepping for "csv", and a verifier that
 * passes by grepping is not a verifier.
 *
 * The suite is symmetric on purpose:
 *
 * > **Every attack is paired with a positive control.** A verifier that rejects
 * > everything fails this file just as surely as one that accepts everything.
 *
 * Assertions are on the **reason code**, never on "it failed". Two claims can
 * both be rejected for opposite reasons — one because the evidence is absent and
 * one because it is real but points elsewhere — and a suite that could not tell
 * them apart would keep passing while the verifier's judgement rotted.
 */

import { describe, expect, it } from 'vitest';
import { featureEnrichmentSchema } from '@statewavedev/guide-shared';
import {
  ARCHIVE,
  CSV,
  INVOICE,
  SCOPE,
  archiveGraph,
  csvCollisionGraph,
  invoiceGraph,
  permissionScopeGraph,
  verifyAgainst,
} from './adversarial-fixtures.js';
import { factual, onlyClaim } from './helpers.js';
import { feature } from './model-helpers.js';
import { createClaimVerifierRegistry } from '../src/registry.js';
import type { ClaimVerifierRegistration } from '../src/registry.js';
import { createDeterministicRenderer } from '../src/render.js';
import { enrichApplicationGraph } from '../src/enrich.js';
import { createMockProvider } from '../src/providers/mock.js';

// ---------------------------------------------------------------------------
// Attack A — vocabulary collision
// ---------------------------------------------------------------------------

/**
 * What an application that genuinely knows its own import path would register.
 *
 * It is domain knowledge and nothing else: *this* application imports through a
 * POST endpoint whose path ends in `/import`. No generic rule could know that,
 * which is precisely why the matrix has no rule for `import` and why this lives
 * in a test rather than in `src`.
 */
const importVerifier: ClaimVerifierRegistration = {
  type: 'capability',
  action: 'import',
  verify({ assertion, resolveTarget }) {
    const endpoints = assertion.targets.filter((id) => {
      const node = resolveTarget(id);
      return node?.kind === 'api' && node.method === 'POST' && node.path.endsWith('/import');
    });
    if (endpoints.length === 0) {
      return {
        satisfied: false,
        evidence: [],
        detail: 'No import endpoint was cited. A control labelled Upload is not an import.',
      };
    }
    return {
      satisfied: true,
      evidence: endpoints,
      detail: 'This application imports through a POST endpoint whose path ends in /import.',
    };
  },
};

describe('attack A — vocabulary collision: CSV, Upload and Clients are all present', () => {
  const importClaim = factual({
    type: 'capability',
    action: 'import',
    text: 'Clients can be imported from a CSV file.',
    subjectRef: 'feature:clients.create',
    subjectLabel: 'the client CSV importer',
    targets: [CSV.upload],
  });

  it('has the attack vocabulary in the evidence, so the refusal is not a lexical one', () => {
    const readable = csvCollisionGraph()
      .nodes.map((node) => {
        if (node.kind === 'element') return node.label ?? node.elementId;
        if (node.kind === 'function') return node.name;
        return '';
      })
      .join(' ');
    expect(readable).toContain('Upload CSV');
    expect(readable).toContain('Clients');
    expect(readable).toContain('handleUpload');
  });

  it('refuses the import claim: the matrix has no rule for import', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [importClaim],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
    expect(claim.rejection?.detail).toContain('deliberately');
  });

  it('counts the refusal as unchecked rather than as disproved', () => {
    const result = verifyAgainst({
      graph: csvCollisionGraph(),
      featureId: 'clients.create',
      factualClaims: [importClaim],
    });
    expect(result.claimSummary.unsupportedActions).toEqual({ import: 1 });
    expect(result.claimSummary.structurallyVerified).toBe(0);
  });

  it('still refuses it once an import verifier is registered, because no import endpoint exists', () => {
    const registry = createClaimVerifierRegistry();
    registry.register(importVerifier);
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [importClaim],
        registry,
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CAPABILITY');
    expect(claim.rejection?.detail).toContain('A control labelled Upload is not an import.');
  });

  it('still refuses it once the import endpoint exists but no verifier is registered', () => {
    // The fact alone does not make the claim checkable, and the endpoint alone
    // does not make the matrix grow a rule. Both halves are required, and
    // saying so is the difference between "unproven" and "unprovable".
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph({ importEndpoint: true }),
        featureId: 'clients.create',
        factualClaims: [{ ...importClaim, targets: [CSV.upload, CSV.importEndpoint] }],
      }),
    );
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
  });

  it('POSITIVE CONTROL: upholds it with a registered verifier and a real import endpoint', () => {
    const registry = createClaimVerifierRegistry();
    registry.register(importVerifier);
    const result = verifyAgainst({
      graph: csvCollisionGraph({ importEndpoint: true }),
      featureId: 'clients.create',
      factualClaims: [{ ...importClaim, targets: [CSV.upload, CSV.importEndpoint] }],
      registry,
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
    expect(claim.evidence.map((entry) => entry.ref)).toContain(CSV.importEndpoint);
    expect(result.claimSummary.unsupportedActions).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Attack B — semantic mutation
// ---------------------------------------------------------------------------

describe('attack B — semantic mutation: a real DELETE, and "Archive" somewhere else', () => {
  it('has both halves of the mutation in the application', () => {
    const graph = archiveGraph();
    expect(graph.nodes.some((node) => node.id === ARCHIVE.del)).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'element' && node.label === 'Archive')).toBe(
      true,
    );
  });

  it('refuses "deleting a client archives it": DELETE evidence is real and performs something else', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: archiveGraph(),
        featureId: 'clients.delete',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'update',
            text: 'Deleting a client archives it rather than removing it.',
            subjectRef: 'feature:clients.delete',
            subjectLabel: 'Archive a client',
            targets: [ARCHIVE.del],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(claim.rejection?.detail).toContain('DELETE');
  });

  it('refuses the archive claim when it reaches for the archive evidence of another feature', () => {
    // `PATCH /api/billing/:invoiceId` genuinely archives. It belongs to the
    // billing feature, and a real fact belonging to something else is not
    // support for this.
    const claim = onlyClaim(
      verifyAgainst({
        graph: archiveGraph(),
        featureId: 'clients.delete',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'update',
            text: 'A client can be archived.',
            subjectRef: 'feature:clients.delete',
            targets: [ARCHIVE.patch],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
    expect(claim.rejection?.detail).toContain("not in this feature's evidence");
  });

  it('refuses it again when the archive control itself is cited across the feature boundary', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: archiveGraph(),
        featureId: 'clients.delete',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'submit',
            text: 'Archiving is available from the client list.',
            subjectRef: 'feature:clients.delete',
            targets: [ARCHIVE.archive],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
  });

  it('POSITIVE CONTROL: a plain delete capability citing the DELETE endpoint verifies', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: archiveGraph(),
        featureId: 'clients.delete',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'delete',
            text: 'A client can be deleted.',
            subjectRef: 'feature:clients.delete',
            targets: [ARCHIVE.del],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
  });

  it('cannot tell delete from archive — and the renderer refuses to repeat the mutation anyway', async () => {
    // The honest limitation, asserted rather than glossed over. A `delete`
    // assertion backed by a DELETE endpoint is structurally sound whatever the
    // model *called* it, because the graph records no business meaning behind a
    // verb. What stops the mutation reaching a reader is the renderer's
    // vocabulary: it composes from the assertion, never from `text` and never
    // from `subjectLabel`.
    const result = verifyAgainst({
      graph: archiveGraph(),
      featureId: 'clients.delete',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'delete',
          text: 'Archiving a client keeps it available in the archive.',
          subjectRef: 'feature:clients.delete',
          subjectLabel: 'Archive a client',
          targets: [ARCHIVE.del],
        }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('structurally_verified');

    const rendered = await createDeterministicRenderer().render({
      feature: feature({ id: 'clients.delete', routes: ['/clients'] }),
      claims: [claim],
    });
    expect(rendered.description).toBe('You can delete a client from the Clients screen.');
    expect(rendered.description.toLowerCase()).not.toContain('archive');
  });
});

// ---------------------------------------------------------------------------
// Attack C — invented side effect
// ---------------------------------------------------------------------------

describe('attack C — invented side effect: invoices here, email and Send over there', () => {
  it('has invoice creation, an email endpoint and a Send button in the application', () => {
    const graph = invoiceGraph();
    expect(graph.nodes.some((node) => node.id === INVOICE.post)).toBe(true);
    expect(graph.nodes.some((node) => node.id === INVOICE.email)).toBe(true);
    expect(graph.nodes.some((node) => node.kind === 'element' && node.label === 'Send email')).toBe(
      true,
    );
  });

  it('refuses "creating an invoice emails it" when it cites the other feature\'s Send button', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: invoiceGraph(),
        featureId: 'invoices.create',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'send',
            text: 'Creating an invoice emails it to the client.',
            subjectRef: 'feature:invoices.create',
            targets: [INVOICE.send],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
  });

  it("refuses it again when it cites only the invoice feature's own endpoint", () => {
    const result = verifyAgainst({
      graph: invoiceGraph(),
      featureId: 'invoices.create',
      factualClaims: [
        factual({
          type: 'capability',
          action: 'send',
          text: 'Creating an invoice emails it to the client.',
          subjectRef: 'feature:invoices.create',
          targets: [INVOICE.post],
        }),
      ],
    });
    const claim = onlyClaim(result);
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
    expect(result.claimSummary.unsupportedActions).toEqual({ send: 1 });
  });

  it('refuses a send claim even in the feature that genuinely sends', () => {
    // The point of failing closed: `send` has no rule, so the pipeline does not
    // get to be right by accident either. An application that can prove it must
    // register a verifier.
    const claim = onlyClaim(
      verifyAgainst({
        graph: invoiceGraph(),
        featureId: 'notifications.send',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'send',
            text: 'An email can be sent.',
            subjectRef: 'feature:notifications.send',
            targets: [INVOICE.email],
          }),
        ],
      }),
    );
    expect(claim.outcome).toBe('EXPLICITLY_UNSUPPORTED');
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_CLAIM_RULE');
  });

  it('POSITIVE CONTROL: a create capability on the invoice feature citing its own POST verifies', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: invoiceGraph(),
        featureId: 'invoices.create',
        factualClaims: [
          factual({
            type: 'capability',
            action: 'create',
            text: 'An invoice can be created.',
            subjectRef: 'feature:invoices.create',
            targets: [INVOICE.post],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
  });
});

// ---------------------------------------------------------------------------
// Attack D — invented permission scope
// ---------------------------------------------------------------------------

describe('attack D — invented permission scope: admin:all exists, just not here', () => {
  const adminEdge = `${SCOPE.settings}|requires_permission|${SCOPE.adminPermission}`;

  it('refuses admin:all when the graph has never seen that permission', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: permissionScopeGraph({ adminPermission: false }),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'permission',
            permission: 'admin:all',
            text: 'Only administrators can create clients.',
            subjectRef: 'feature:clients.create',
            targets: [SCOPE.createPermission],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('UNKNOWN_PERMISSION');
  });

  it('refuses admin:all when it is real but connected to something else on the same screen', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: permissionScopeGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'permission',
            permission: 'admin:all',
            text: 'Only administrators can create clients.',
            subjectRef: 'feature:clients.create',
            targets: [SCOPE.adminPermission],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
  });

  it('refuses it even when the model cites the real requires_permission edge', () => {
    // The strongest form of the attack: every id is genuine and the edge really
    // does prove that `admin:all` is required. It starts at the settings
    // button, so it proves nothing about creating a client — and direction is
    // the whole check.
    const claim = onlyClaim(
      verifyAgainst({
        graph: permissionScopeGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'permission',
            permission: 'admin:all',
            text: 'Only administrators can create clients.',
            subjectRef: 'feature:clients.create',
            targets: [adminEdge, SCOPE.adminPermission],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(claim.rejection?.detail).toContain('requires_permission');
  });

  it('POSITIVE CONTROL: clients:create, which does have an edge to the subject, verifies', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: permissionScopeGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'permission',
            permission: 'clients:create',
            text: 'Creating a client requires the clients:create permission.',
            subjectRef: 'feature:clients.create',
            targets: [SCOPE.createPermission],
          }),
        ],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
    expect(claim.evidence.map((entry) => entry.ref)).toContain(SCOPE.createPermissionEdge);
  });
});

// ---------------------------------------------------------------------------
// Structural attacks
// ---------------------------------------------------------------------------

describe('structural attacks on identity and reference', () => {
  it('refuses a fabricated graph id', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'feature:clients.create',
            targets: ['api:POST:/api/clients/bulk'],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('UNKNOWN_GRAPH_REFERENCE');
  });

  it('refuses a target that exists but belongs to another feature', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: invoiceGraph(),
        featureId: 'invoices.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'feature:invoices.create',
            targets: [INVOICE.email],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
  });

  it('refuses a route the feature does not have', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'navigation',
            route: '/clients/import',
            subjectRef: 'feature:clients.create',
            targets: [CSV.route],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('UNKNOWN_ROUTE');
  });

  it('refuses a create capability that cites no endpoint at all', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'feature:clients.create',
            targets: [CSV.create],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('UNKNOWN_ENDPOINT');
  });

  it('refuses a workflow step pointing at something a user cannot be shown', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'workflow_step',
            text: 'The handler runs.',
            subjectRef: 'feature:clients.create',
            targets: [CSV.handleCreate],
          }),
        ],
      }),
    );
    expect(claim.rejection?.reason).toBe('UNSUPPORTED_WORKFLOW_STEP');
  });

  it.each([
    ['an invented feature', 'feature:clients.import'],
    ['an invented node', 'element:clients.csv-importer'],
    ['a case variant of a real feature', 'Feature:clients.create'],
    ['a padded copy of a real node id', ' element:clients.create'],
  ])('refuses %s as a subject', (_name, subjectRef) => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [factual({ action: 'create', subjectRef, targets: [CSV.post] })],
      }),
    );
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('UNKNOWN_SUBJECT');
  });

  it('POSITIVE CONTROL: the un-padded, correctly-cased identity resolves', () => {
    const claim = onlyClaim(
      verifyAgainst({
        graph: csvCollisionGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({ action: 'create', subjectRef: 'element:clients.create', targets: [CSV.post] }),
        ],
      }),
    );
    expect(claim.status).toBe('structurally_verified');
  });
});

describe('a model that tries to rename the feature never reaches the verifier', () => {
  it('fails the response schema, because the schema has no id field to change', () => {
    const parsed = featureEnrichmentSchema.safeParse({
      id: 'clients.import',
      title: 'Import clients',
      description: 'Imports clients from CSV.',
      factualClaims: [],
      languageClaims: [],
      confidenceReason: 'Read from the evidence.',
    });
    expect(parsed.success).toBe(false);
  });

  it('is recorded as SCHEMA_VIOLATION by the pipeline, and produces no feature', async () => {
    const run = await enrichApplicationGraph({
      graph: csvCollisionGraph(),
      provider: createMockProvider({ malformed: ['feature-enrichment'] }),
    });
    expect(run.model.features).toHaveLength(0);
    expect(run.rejected.map((entry) => entry.reason)).toContain('SCHEMA_VIOLATION');
    expect(run.rejected[0]?.detail).toContain('enrichment schema');
  });

  it('POSITIVE CONTROL: the same pipeline over the same graph accepts an honest response', async () => {
    const run = await enrichApplicationGraph({
      graph: csvCollisionGraph(),
      provider: createMockProvider(),
    });
    expect(run.model.features.length).toBeGreaterThan(0);
    expect(run.model.verification.structurallyVerified).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// The suite's own guard
// ---------------------------------------------------------------------------

describe('the suite cannot be passed by refusing everything', () => {
  it('every positive control produces a structurally verified claim', () => {
    const controls = [
      verifyAgainst({
        graph: archiveGraph(),
        featureId: 'clients.delete',
        factualClaims: [
          factual({
            action: 'delete',
            subjectRef: 'feature:clients.delete',
            targets: [ARCHIVE.del],
          }),
        ],
      }),
      verifyAgainst({
        graph: invoiceGraph(),
        featureId: 'invoices.create',
        factualClaims: [
          factual({
            action: 'create',
            subjectRef: 'feature:invoices.create',
            targets: [INVOICE.post],
          }),
        ],
      }),
      verifyAgainst({
        graph: permissionScopeGraph(),
        featureId: 'clients.create',
        factualClaims: [
          factual({
            type: 'permission',
            permission: 'clients:create',
            subjectRef: 'feature:clients.create',
            targets: [SCOPE.createPermission],
          }),
        ],
      }),
    ];
    expect(controls.map((result) => result.claimSummary.structurallyVerified)).toEqual([1, 1, 1]);
  });
});
