/**
 * Builders for Product Model values.
 *
 * `./helpers.ts` builds the *graph* side of the world; this builds the
 * *semantic* side, so a test about rendering or projection can state the two or
 * three fields it cares about and let the rest default to something valid.
 *
 * Everything here goes through the real contract types, and
 * {@link productModel} is checked against `productModelSchema` on the way out —
 * a fixture that drifts from the schema would make a passing test mean nothing.
 */

import { productModelSchema } from '@statewavedev/guide-shared';
import type {
  ClaimProvenance,
  FeatureClaimSummary,
  GeneratorAttribution,
  ProductClaim,
  ProductFeature,
  ProductModel,
  ProductModelSource,
  ProductPermission,
  ProductWorkflow,
  SemanticVerificationSummary,
} from '@statewavedev/guide-shared';

export const ATTRIBUTION: GeneratorAttribution = {
  provider: 'mock',
  model: 'fixture',
  version: '2.0.0',
};

export const PROVENANCE: ClaimProvenance = {
  graphHash: 'graph-hash',
  applicationVersion: '1.2.3',
  commit: 'abc1234',
  dependencyFingerprint: 'feature-hash',
};

export const SOURCE: ProductModelSource = {
  commit: 'abc1234',
  applicationVersion: '1.2.3',
  graphHash: 'graph-hash',
  generatorVersion: '2.0.0',
  provider: 'mock',
  model: 'fixture',
  generatedAt: '2026-01-01T00:00:00.000Z',
};

/** One claim, with everything a test does not name filled in. */
export function claim(overrides: Partial<ProductClaim> = {}): ProductClaim {
  return {
    id: 'clients.create#capability:1',
    featureId: 'clients.create',
    type: 'capability',
    text: 'A client can be created.',
    evidence: [{ ref: 'api:POST:/clients', kind: 'node', file: 'src/api.ts', line: 4 }],
    status: 'structurally_verified',
    outcome: 'SUPPORTED_VERIFICATION_RULE',
    provenance: PROVENANCE,
    generatedBy: ATTRIBUTION,
    ...overrides,
  };
}

/** A claim summary that adds up, derived from the claims it describes. */
export function summaryOf(claims: readonly ProductClaim[]): FeatureClaimSummary {
  const factual = claims.filter((entry) => entry.assertion !== undefined);
  const language = claims.filter((entry) => entry.assertion === undefined);
  const verified = factual.filter((entry) => entry.status === 'structurally_verified').length;
  const grounded = language.filter((entry) => entry.status === 'semantically_grounded').length;
  return {
    factualClaims: factual.length,
    structurallyVerified: verified,
    factualRejected: factual.length - verified,
    languageClaims: language.length,
    semanticallyGrounded: grounded,
    languageRejected: language.length - grounded,
    unsupportedActions: {},
  };
}

/** One feature. */
export function feature(overrides: Partial<ProductFeature> = {}): ProductFeature {
  const base: ProductFeature = {
    id: 'clients.create',
    kind: 'feature',
    title: 'Create a client',
    description: '',
    entryPoints: ['element:clients.create'],
    routes: ['/clients'],
    elements: ['clients.create'],
    permissions: ['clients:create'],
    workflows: [],
    relatedFeatures: [],
    questions: [],
    claims: [],
    evidence: [{ ref: 'element:clients.create', kind: 'node' }],
    confidence: 1,
    claimSummary: summaryOf([]),
    idOrigin: 'semantic-id',
    dependencyFingerprint: 'feature-hash',
    dependsOn: ['element:clients.create'],
    generatedBy: ATTRIBUTION,
  };
  return { ...base, ...overrides };
}

/** One workflow. */
export function workflow(overrides: Partial<ProductWorkflow> = {}): ProductWorkflow {
  return {
    id: 'clients.create#workflow',
    featureId: 'clients.create',
    title: 'How to create a client',
    steps: [
      {
        index: 1,
        text: 'Open Clients.',
        targets: ['element:clients.create'],
        evidence: [
          { ref: 'element:clients.create', kind: 'node', file: 'src/Clients.tsx', line: 3 },
        ],
      },
    ],
    evidence: [{ ref: 'element:clients.create', kind: 'node' }],
    generatedBy: ATTRIBUTION,
    ...overrides,
  };
}

/** A verification summary that is consistent with the claims it counts. */
export function verificationOf(claims: readonly ProductClaim[]): SemanticVerificationSummary {
  const summary = summaryOf(claims);
  const accepted = claims.filter((entry) => entry.status !== 'rejected');
  const reasons: Record<string, number> = {};
  for (const entry of claims) {
    const reason = entry.rejection?.reason;
    if (reason !== undefined) reasons[reason] = (reasons[reason] ?? 0) + 1;
  }
  return {
    featureCandidates: 1,
    featuresEnriched: 1,
    featuresAccepted: 1,
    featuresRejected: 0,
    factualClaimsGenerated: summary.factualClaims,
    structurallyVerified: summary.structurallyVerified,
    semanticallyGrounded: summary.semanticallyGrounded,
    claimsRejected: summary.factualRejected + summary.languageRejected,
    blocked: {
      unsupportedCapabilities: 0,
      unsupportedConstraints: 0,
      unsupportedPermissions: 0,
      workflowStepsWithoutEvidence: 0,
      unknownReferences: 0,
    },
    evidenceCoverage:
      accepted.length === 0
        ? 0
        : accepted.filter((entry) => entry.evidence.length > 0).length / accepted.length,
    rejectionsByReason: reasons,
  };
}

/** A whole model, validated against the contract before a test may use it. */
export function productModel(overrides: Partial<ProductModel> = {}): ProductModel {
  const claims = overrides.claims ?? [];
  const model: ProductModel = {
    version: 2,
    application: 'fixture',
    source: SOURCE,
    features: [],
    workflows: [],
    claims: [],
    permissions: [] as ProductPermission[],
    verification: verificationOf(claims),
    ...overrides,
  };
  const parsed = productModelSchema.safeParse(model);
  if (!parsed.success) {
    throw new Error(`The fixture is not a valid Product Model: ${parsed.error.message}`);
  }
  return model;
}
