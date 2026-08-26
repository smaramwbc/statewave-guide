/**
 * The extension API.
 *
 * An application can teach the verifier a check the matrix does not have. It
 * cannot teach the verifier to stop checking: the universal guarantees — a real
 * subject, real targets, targets belonging to *this* feature — are settled
 * before a registration is consulted, and a registration that upholds a claim
 * without naming a fact is refused rather than believed.
 *
 * The fixture verifier here is the one deliberately absent from `src`: an
 * `export` verifier, which is application knowledge and does not belong in a
 * matrix that ships to everybody.
 */

import { describe, expect, it } from 'vitest';
import type { FactualClaimEnrichment } from '@statewavedev/guide-shared';
import { ID, factual, onlyClaim, verifyFixture } from './helpers.js';
import { createClaimVerifierRegistry } from '../src/registry.js';
import type {
  ClaimVerifierContext,
  ClaimVerifierRegistration,
  ClaimVerifierResult,
} from '../src/registry.js';

/**
 * The feature that owns the export button, and a claim filed under it.
 *
 * The button, its handler and its permission belong to `clients.export`, which
 * the fixture discovers as a feature in its own right. Filing an export claim
 * under a sibling would make it a claim about somebody else's evidence, and the
 * scope gate refuses that before any registration is consulted — so the
 * registry would never be exercised at all.
 */
const EXPORT_FEATURE = 'clients.export';
function exportClaim(overrides: Partial<FactualClaimEnrichment> = {}): FactualClaimEnrichment {
  return factual({ action: 'export', subjectRef: `feature:${EXPORT_FEATURE}`, ...overrides });
}

/**
 * What an application that genuinely knows its own export path would register.
 *
 * It accepts an export claim when the feature cites an export control that the
 * application gates behind a permission — knowledge no generic rule can have.
 */
const exportVerifier: ClaimVerifierRegistration = {
  type: 'capability',
  action: 'export',
  verify({ assertion, resolveTarget }: ClaimVerifierContext): ClaimVerifierResult {
    const controls = assertion.targets.filter((id) => {
      const node = resolveTarget(id);
      return node?.kind === 'element' && node.elementId.endsWith('.export');
    });
    if (controls.length === 0) {
      return { satisfied: false, evidence: [], detail: 'no export control was cited' };
    }
    return { satisfied: true, evidence: controls, detail: 'an export control is declared here' };
  },
};

describe('built-ins are authoritative by default', () => {
  it('checks a create claim against the matrix when the registry is empty', () => {
    const result = verifyFixture({
      registry: createClaimVerifierRegistry(),
      factualClaims: [factual({ action: 'create', targets: [ID.post] })],
    });
    expect(onlyClaim(result).status).toBe('structurally_verified');
  });

  it('leaves export unsupported when the registry is empty', () => {
    const result = verifyFixture({
      registry: createClaimVerifierRegistry(),
      factualClaims: [factual({ action: 'export', targets: [ID.exportButton] })],
    });
    expect(onlyClaim(result).outcome).toBe('EXPLICITLY_UNSUPPORTED');
  });

  it('keeps the matrix in charge of every pair a registration did not claim', () => {
    const registry = createClaimVerifierRegistry();
    registry.register(exportVerifier);
    // Both claims are filed under the delete button and cite the one endpoint
    // it owns, so nothing here turns on scope: the create rule refuses the
    // DELETE endpoint on its merits, and the delete rule accepts it.
    const result = verifyFixture({
      featureId: 'clients.delete',
      registry,
      factualClaims: [
        factual({ action: 'create', subjectRef: 'feature:clients.delete', targets: [ID.del] }),
        factual({ action: 'delete', subjectRef: ID.remove, targets: [ID.del] }),
      ],
    });
    expect(result.claims[0]?.rejection?.reason).toBe('EVIDENCE_DOES_NOT_SUPPORT_CLAIM');
    expect(result.claims[1]?.status).toBe('structurally_verified');
  });
});

describe('a custom verifier can support export', () => {
  const registry = createClaimVerifierRegistry();
  registry.register(exportVerifier);

  it('upholds an export claim the matrix would have refused to judge', () => {
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('structurally_verified');
    expect(claim.outcome).toBe('SUPPORTED_VERIFICATION_RULE');
    expect(result.claimSummary.unsupportedActions).toEqual({});
    expect(claim.evidence.map((entry) => entry.ref)).toContain(ID.exportButton);
  });

  it('records that something other than the matrix decided', () => {
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    expect(result.warnings.join(' ')).toContain('capability/export');
  });

  it('still refuses an export claim its own verifier rejects', () => {
    // The handler is genuinely this feature's, so the claim survives the scope
    // gate and reaches the application's verifier — which then refuses it for
    // the only reason it knows: nothing cited is an export control.
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.handleExport] })],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.detail).toContain('no export control was cited');
  });
});

describe('a custom verifier cannot bypass the evidence requirements', () => {
  /** Records every call, and says yes to everything. */
  function permissive(evidence: string[]): {
    registration: ClaimVerifierRegistration;
    calls: ClaimVerifierContext[];
  } {
    const calls: ClaimVerifierContext[] = [];
    return {
      calls,
      registration: {
        type: 'capability',
        action: 'export',
        verify(context: ClaimVerifierContext): ClaimVerifierResult {
          calls.push(context);
          return { satisfied: true, evidence: [...evidence], detail: 'always yes' };
        },
      },
    };
  }

  it('rejects satisfied-with-no-evidence instead of treating it as a pass', () => {
    const registry = createClaimVerifierRegistry();
    const { registration } = permissive([]);
    registry.register(registration);
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.outcome).toBe('REJECTED_INVALID');
    expect(claim.rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
    expect(claim.rejection?.detail).toContain('without naming a single graph fact');
  });

  it('rejects evidence the verifier invented', () => {
    const registry = createClaimVerifierRegistry();
    const { registration } = permissive(['api:POST:/clients/import']);
    registry.register(registration);
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    expect(onlyClaim(result).rejection?.reason).toBe('UNKNOWN_GRAPH_REFERENCE');
  });

  it('rejects evidence that is real but belongs to another feature', () => {
    const registry = createClaimVerifierRegistry();
    const { registration } = permissive([ID.invoiceApi]);
    registry.register(registration);
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    expect(onlyClaim(result).rejection?.reason).toBe('UNKNOWN_GRAPH_REFERENCE');
  });

  it('is never consulted about a claim whose subject does not exist', () => {
    const registry = createClaimVerifierRegistry();
    const { registration, calls } = permissive([ID.exportButton]);
    registry.register(registration);
    const result = verifyFixture({
      registry,
      factualClaims: [
        factual({
          action: 'export',
          subjectRef: 'feature:clients.beam',
          targets: [ID.exportButton],
        }),
      ],
    });
    expect(onlyClaim(result).rejection?.reason).toBe('UNKNOWN_SUBJECT');
    expect(calls).toHaveLength(0);
  });

  it('is never consulted about a claim citing another feature’s facts', () => {
    const registry = createClaimVerifierRegistry();
    const { registration, calls } = permissive([ID.exportButton]);
    registry.register(registration);
    const result = verifyFixture({
      registry,
      factualClaims: [factual({ action: 'export', targets: [ID.invoiceApi] })],
    });
    expect(onlyClaim(result).rejection?.reason).toBe('NO_SUPPORTING_EVIDENCE');
    expect(calls).toHaveLength(0);
  });

  it('cannot wave through a route the graph has never seen', () => {
    const registry = createClaimVerifierRegistry();
    const { registration, calls } = permissive([ID.exportButton]);
    registry.register(registration);
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ route: '/admin/exports', targets: [ID.exportButton] })],
    });
    expect(onlyClaim(result).rejection?.reason).toBe('UNKNOWN_ROUTE');
    expect(calls).toHaveLength(0);
  });

  it('cannot resolve a target outside the pack, even a real one', () => {
    const registry = createClaimVerifierRegistry();
    const { registration, calls } = permissive([ID.exportButton]);
    registry.register(registration);
    verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    const context = calls[0];
    expect(context).toBeDefined();
    expect(context?.resolveTarget(ID.exportButton)?.id).toBe(ID.exportButton);
    expect(context?.resolveTarget(ID.invoiceApi)).toBeUndefined();
    expect(context?.graph.nodes.some((node) => node.id === ID.invoiceApi)).toBe(true);
  });

  it('refuses the claim when a verifier throws instead of bringing the pipeline down', () => {
    const registry = createClaimVerifierRegistry();
    registry.register({
      type: 'capability',
      action: 'export',
      verify(): ClaimVerifierResult {
        throw new Error('the application’s verifier is broken');
      },
    });
    const result = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    const claim = onlyClaim(result);
    expect(claim.status).toBe('rejected');
    expect(claim.rejection?.detail).toContain('threw');
  });
});

describe('registration bookkeeping', () => {
  const first: ClaimVerifierRegistration = {
    type: 'capability',
    action: 'export',
    verify: () => ({ satisfied: true, evidence: ['first'], detail: 'first' }),
  };
  const second: ClaimVerifierRegistration = {
    type: 'capability',
    action: 'export',
    verify: () => ({ satisfied: true, evidence: ['second'], detail: 'second' }),
  };

  it('starts empty, which means built-ins only', () => {
    const registry = createClaimVerifierRegistry();
    expect(registry.list()).toEqual([]);
    expect(registry.find('capability', 'export')).toBeUndefined();
  });

  it('matches the pair exactly', () => {
    const registry = createClaimVerifierRegistry();
    registry.register(first);
    expect(registry.find('capability', 'export')).toBeDefined();
    expect(registry.find('capability', 'import')).toBeUndefined();
    expect(registry.find('capability')).toBeUndefined();
    expect(registry.find('constraint')).toBeUndefined();
  });

  it('is last-registration-wins for a duplicate pair', () => {
    const registry = createClaimVerifierRegistry();
    registry.register(first);
    registry.register(second);
    expect(registry.list()).toHaveLength(1);
    expect(
      registry.find('capability', 'export')?.verify({} as unknown as ClaimVerifierContext).detail,
    ).toBe('second');
  });

  it('disposes only its own registration', () => {
    const registry = createClaimVerifierRegistry();
    const disposeFirst = registry.register(first);
    const disposeSecond = registry.register(second);

    disposeFirst();
    expect(
      registry.find('capability', 'export')?.verify({} as unknown as ClaimVerifierContext).detail,
    ).toBe('second');

    disposeSecond();
    expect(registry.find('capability', 'export')).toBeUndefined();
    expect(registry.list()).toEqual([]);
  });

  it('lists registrations in a stable order', () => {
    const registry = createClaimVerifierRegistry();
    registry.register({ type: 'constraint', verify: first.verify });
    registry.register({ type: 'capability', action: 'import', verify: first.verify });
    registry.register({ type: 'capability', action: 'export', verify: first.verify });
    expect(registry.list().map((entry) => `${entry.type}/${entry.action ?? ''}`)).toEqual([
      'capability/export',
      'capability/import',
      'constraint/',
    ]);
  });

  it('ignores a registration object mutated after the fact', () => {
    const registry = createClaimVerifierRegistry();
    const mutable: ClaimVerifierRegistration = {
      type: 'capability',
      action: 'export',
      verify: first.verify,
    };
    registry.register(mutable);
    mutable.action = 'import';
    expect(registry.find('capability', 'export')).toBeDefined();
    expect(registry.find('capability', 'import')).toBeUndefined();
  });

  it('falls back to the matrix once a registration is disposed', () => {
    const registry = createClaimVerifierRegistry();
    const dispose = registry.register(exportVerifier);
    const supported = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    expect(onlyClaim(supported).status).toBe('structurally_verified');

    dispose();
    const unsupported = verifyFixture({
      featureId: EXPORT_FEATURE,
      registry,
      factualClaims: [exportClaim({ targets: [ID.exportButton] })],
    });
    expect(onlyClaim(unsupported).outcome).toBe('EXPLICITLY_UNSUPPORTED');
  });
});
