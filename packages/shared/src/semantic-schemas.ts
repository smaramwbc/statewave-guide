/**
 * Runtime validation for the Product Model, and for what a model is allowed to
 * return.
 *
 * Two distinct jobs live here and the difference matters.
 *
 * The `product*` schemas validate the *stored* model — the thing written to
 * `product.json` and read back by the runtime.
 *
 * The `*EnrichmentSchema` schemas validate a *model response*. They are
 * deliberately stricter and narrower: a response is untrusted input from a
 * system that will confidently produce well-formed nonsense, so the schema is
 * the first gate and the semantic verifier is the second. Neither is sufficient
 * alone — a schema proves the shape, not that a referenced graph id exists.
 *
 * @packageDocumentation
 */

import { z } from 'zod';
import type { CapabilityAction } from './semantic.js';

/** Caps that keep a single response bounded. */
export const SEMANTIC_LIMITS = {
  maxTitleLength: 80,
  maxDescriptionLength: 400,
  maxPurposeLength: 400,
  maxQuestions: 8,
  maxQuestionLength: 160,
  maxWorkflowSteps: 12,
  maxStepLength: 200,
  maxGraphRefs: 40,
  maxFactualClaims: 12,
  maxLanguageClaims: 10,
} as const;

/** Validates {@link SemanticEvidence}. */
export const semanticEvidenceSchema = z.object({
  ref: z.string().min(1),
  kind: z.enum(['node', 'relationship']),
  file: z.string().optional(),
  line: z.number().int().positive().optional(),
});

/** Validates {@link GeneratorAttribution}. */
export const generatorAttributionSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  version: z.string().optional(),
});

/** Validates {@link ProductClaimType}. */
export const productClaimTypeSchema = z.enum([
  'capability',
  'navigation',
  'workflow_step',
  'permission',
  'constraint',
  'purpose',
  'synonym',
  'user_question',
]);

/** Validates {@link CapabilityAction}. */
export const capabilityActionSchema = z.enum([
  'create',
  'view',
  'update',
  'delete',
  'submit',
  'navigate',
  'search',
  'export',
  'import',
  'send',
]);

/**
 * Fields a model may leave unstated, which the wire format will not let it omit.
 *
 * Strict structured-output modes reject a schema whose `required` list omits a
 * declared key, so every field goes out as required and a model with nothing to
 * say answers `""` or `null` rather than leaving the key out. Read literally
 * that is an assertion: the verifier sees a *present* route, looks for it in the
 * evidence, does not find it, and reports a fabricated route to the user. It is
 * an artefact of the transport, not something the model claimed.
 *
 * Measured, not theorised — the first real provider run rejected 251 claims of
 * 363 for naming an empty route or permission, none of which had been asserted.
 */
const UNSTATED_WHEN_EMPTY = ['subjectLabel', 'action', 'route', 'permission'] as const;

/**
 * How a model says a claim has no action, on a wire that will not let it omit
 * the field.
 *
 * `action` means something only for a `capability` claim; the matrix rules for
 * `navigation`, `permission`, `workflow_step` and `constraint` carry no action
 * at all, and rule lookup matches the pair exactly. But strict structured
 * output makes every declared key required, and {@link CapabilityAction} is a
 * closed enum with no member meaning "none" — so a model describing a route
 * cannot leave `action` out and cannot fill it truthfully. It picks something
 * plausible, `navigate`, and the verifier then correctly reports that no rule
 * exists for `navigation` + `navigate`.
 *
 * Measured: 195 of 354 rejections in the second real provider run were this,
 * none of them a claim the model had got wrong.
 *
 * The sentinel lives only on the wire. {@link CapabilityAction} stays closed,
 * and {@link claimAssertionSchema} never sees the value, because
 * {@link dropUnstatedValues} has already turned it into absence. The stronger
 * fix is a discriminated union that offers `action` only on capability claims —
 * then the state is unrepresentable rather than merely expressible — but that
 * reshapes a contract this milestone is meant to be measuring, not redesigning.
 */
const NO_ACTION_SENTINEL = 'none';

/**
 * Restores absence before validation.
 *
 * This does not loosen verification. A claim that names no route makes no route
 * assertion and still has to satisfy every other dimension of its rule, and any
 * *non-empty* route is checked exactly as it was before. Nothing becomes
 * verifiable that was not verifiable already — a class of false accusations
 * simply stops being manufactured. Past this boundary
 * {@link claimAssertionSchema} refuses an empty value outright.
 */
function dropUnstatedValues(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const copy: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of UNSTATED_WHEN_EMPTY) {
    if (copy[key] === '' || copy[key] === null) delete copy[key];
  }
  if (copy['action'] === NO_ACTION_SENTINEL) delete copy['action'];
  return copy;
}

/**
 * Narrows a model-supplied action to the closed domain enum.
 *
 * {@link dropUnstatedValues} has already removed {@link NO_ACTION_SENTINEL}
 * before validation, so at runtime this only ever sees a real action or
 * nothing. It exists because the *type* cannot see that: the wire enum must
 * advertise the sentinel or a model would never know it may decline to name an
 * action, which leaves `'none'` in the inferred type after it is gone from the
 * value. Rather than assert the difference away, the mapping is written down
 * where a reader can check it.
 */
export function toCapabilityAction(
  action: CapabilityAction | typeof NO_ACTION_SENTINEL | undefined,
): CapabilityAction | undefined {
  return action === undefined || action === NO_ACTION_SENTINEL ? undefined : action;
}

/**
 * Validates {@link ClaimAssertion}.
 *
 * Every optional string carries `.min(1)`. An empty route is not a claim that
 * the route is empty — it is the absence of a route, and the two must never be
 * representable as the same value. The verifier reads a present `route` as a
 * statement about the application and refuses it when the evidence does not
 * name it, so an empty string reaching this type would be reported to a user as
 * a fabricated route.
 */
export const claimAssertionSchema = z.object({
  subjectRef: z.string().min(1),
  subjectLabel: z.string().min(1).optional(),
  action: capabilityActionSchema.optional(),
  route: z.string().min(1).optional(),
  permission: z.string().min(1).optional(),
  targets: z.array(z.string().min(1)),
});

/** Validates {@link ClaimVerificationOutcome}. */
export const claimVerificationOutcomeSchema = z.enum([
  'SUPPORTED_VERIFICATION_RULE',
  'EXPLICITLY_UNSUPPORTED',
  'REJECTED_INVALID',
]);

/** Validates {@link ClaimProvenance}. */
export const claimProvenanceSchema = z.object({
  graphHash: z.string().min(1),
  applicationVersion: z.string().optional(),
  commit: z.string().optional(),
  dependencyFingerprint: z.string().min(1),
});

/** Validates {@link ProductClaimStatus}. */
export const productClaimStatusSchema = z.enum([
  'structurally_verified',
  'semantically_grounded',
  'rejected',
]);

/** Validates {@link SemanticRejectionReason}. */
export const semanticRejectionReasonSchema = z.enum([
  'NO_SUPPORTING_EVIDENCE',
  'UNKNOWN_GRAPH_REFERENCE',
  'UNKNOWN_ROUTE',
  'UNKNOWN_PERMISSION',
  'UNKNOWN_ENDPOINT',
  'UNSUPPORTED_WORKFLOW_STEP',
  'FEATURE_ID_CHANGED',
  'CONTRADICTS_GRAPH',
  'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
  'UNKNOWN_SUBJECT',
  'UNSUPPORTED_CLAIM_RULE',
  'UNSUPPORTED_CAPABILITY',
  'UNSUPPORTED_CONSTRAINT',
  'SCHEMA_VIOLATION',
]);

/** Validates {@link ProductClaim}. */
export const productClaimSchema = z.object({
  id: z.string().min(1),
  featureId: z.string().min(1),
  type: productClaimTypeSchema,
  text: z.string().min(1),
  assertion: claimAssertionSchema.optional(),
  evidence: z.array(semanticEvidenceSchema),
  status: productClaimStatusSchema,
  outcome: claimVerificationOutcomeSchema.optional(),
  provenance: claimProvenanceSchema,
  rejection: z.object({ reason: semanticRejectionReasonSchema, detail: z.string() }).optional(),
  generatedBy: generatorAttributionSchema.optional(),
});

/** Validates {@link ProductWorkflowStep}. */
export const productWorkflowStepSchema = z.object({
  index: z.number().int().positive(),
  text: z.string().min(1),
  targets: z.array(z.string().min(1)),
  evidence: z.array(semanticEvidenceSchema),
});

/** Validates {@link ProductWorkflow}. */
export const productWorkflowSchema = z.object({
  id: z.string().min(1),
  featureId: z.string().min(1),
  title: z.string().min(1),
  steps: z.array(productWorkflowStepSchema),
  evidence: z.array(semanticEvidenceSchema),
  generatedBy: generatorAttributionSchema.optional(),
});

/** Validates {@link ProductPermission}. */
export const productPermissionSchema = z.object({
  id: z.string().min(1),
  requiredBy: z.array(z.string()),
  evidence: z.array(semanticEvidenceSchema),
});

/** Validates {@link ProductFeature}. */
export const productFeatureSchema = z.object({
  id: z.string().min(1),
  kind: z.literal('feature'),
  title: z.string().min(1),
  description: z.string(),
  purpose: z.string().optional(),
  entryPoints: z.array(z.string()),
  routes: z.array(z.string()),
  elements: z.array(z.string()),
  permissions: z.array(z.string()),
  workflows: z.array(z.string()),
  relatedFeatures: z.array(z.string()),
  questions: z.array(z.string()),
  claims: z.array(z.string()),
  evidence: z.array(semanticEvidenceSchema),
  confidence: z.number().min(0).max(1),
  claimSummary: z.object({
    factualClaims: z.number().int().nonnegative(),
    structurallyVerified: z.number().int().nonnegative(),
    factualRejected: z.number().int().nonnegative(),
    languageClaims: z.number().int().nonnegative(),
    semanticallyGrounded: z.number().int().nonnegative(),
    languageRejected: z.number().int().nonnegative(),
    unsupportedActions: z.record(z.string(), z.number().int().nonnegative()),
  }),
  idOrigin: z.enum(['semantic-id', 'derived']),
  dependencyFingerprint: z.string().min(1),
  dependsOn: z.array(z.string()),
  generatedBy: generatorAttributionSchema.optional(),
});

/** Validates {@link ProductModelSource}. */
export const productModelSourceSchema = z.object({
  commit: z.string().optional(),
  applicationVersion: z.string().optional(),
  graphHash: z.string().min(1),
  generatorVersion: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  generatedAt: z.string().min(1),
});

/** Validates {@link SemanticVerificationSummary}. */
export const semanticVerificationSummarySchema = z.object({
  featureCandidates: z.number().int().nonnegative(),
  featuresEnriched: z.number().int().nonnegative(),
  featuresAccepted: z.number().int().nonnegative(),
  featuresRejected: z.number().int().nonnegative(),
  factualClaimsGenerated: z.number().int().nonnegative(),
  structurallyVerified: z.number().int().nonnegative(),
  semanticallyGrounded: z.number().int().nonnegative(),
  claimsRejected: z.number().int().nonnegative(),
  blocked: z.object({
    unsupportedCapabilities: z.number().int().nonnegative(),
    unsupportedConstraints: z.number().int().nonnegative(),
    unsupportedPermissions: z.number().int().nonnegative(),
    workflowStepsWithoutEvidence: z.number().int().nonnegative(),
    unknownReferences: z.number().int().nonnegative(),
  }),
  evidenceCoverage: z.number().min(0).max(1),
  rejectionsByReason: z.record(z.string(), z.number().int().nonnegative()),
});

/** Validates {@link ProductModel}. */
export const productModelSchema = z.object({
  version: z.literal(2),
  application: z.string().optional(),
  source: productModelSourceSchema,
  features: z.array(productFeatureSchema),
  workflows: z.array(productWorkflowSchema),
  claims: z.array(productClaimSchema),
  permissions: z.array(productPermissionSchema),
  verification: semanticVerificationSummarySchema,
});

// ---------------------------------------------------------------------------
// Model response schemas — untrusted input
// ---------------------------------------------------------------------------

/**
 * What a model may return for one factual claim.
 *
 * The model states *what it is asserting* in fields, and writes the sentence
 * separately. That inversion is the point of the structured layer: a verifier
 * cannot check an English sentence, but it can check
 * `{ subject: 'clients', action: 'import' }` against a graph and find no import
 * path. The sentence is then rejected for what it asserts rather than for which
 * words it happens to contain.
 */
export const factualClaimEnrichmentSchema = z.preprocess(
  dropUnstatedValues,
  z
    .object({
      type: z.enum(['capability', 'navigation', 'workflow_step', 'permission', 'constraint']),
      /** How the assertion should read to a person. Rendered, not verified. */
      text: z.string().min(1).max(SEMANTIC_LIMITS.maxStepLength),
      /**
       * `feature:<id>` or a canonical graph node id. Validated against known
       * identities by the verifier — the model may describe a subject, never
       * invent one.
       */
      subjectRef: z.string().min(1).max(SEMANTIC_LIMITS.maxTitleLength),
      /** How the subject reads. Rendered, never resolved. */
      subjectLabel: z.string().max(SEMANTIC_LIMITS.maxTitleLength).optional(),
      action: z.enum([...capabilityActionSchema.options, NO_ACTION_SENTINEL]).optional(),
      route: z.string().max(SEMANTIC_LIMITS.maxTitleLength).optional(),
      permission: z.string().max(SEMANTIC_LIMITS.maxTitleLength).optional(),
      /** Graph ids that support the assertion. Never empty. */
      targets: z.array(z.string().min(1)).min(1).max(SEMANTIC_LIMITS.maxGraphRefs),
    })
    .strict(),
);

/**
 * What a model may return for one language claim.
 *
 * No assertion, because it asserts nothing about the application. It still cites
 * evidence — a purpose attached to no facts is a guess about a feature nobody
 * showed the model.
 */
export const languageClaimEnrichmentSchema = z
  .object({
    type: z.enum(['purpose', 'synonym', 'user_question']),
    text: z.string().min(1).max(SEMANTIC_LIMITS.maxQuestionLength),
    targets: z.array(z.string().min(1)).max(SEMANTIC_LIMITS.maxGraphRefs).default([]),
  })
  .strict();

/**
 * What a model may return for one feature.
 *
 * Note what is absent: no `id`, and no `confidence`. Identity is decided
 * deterministically before the model is called and may not be altered by it, and
 * confidence is computed by the verifier from how much survived. Leaving both out
 * of the schema means a model that tries to supply them fails the shape check
 * rather than being quietly ignored — a refusal is more informative than a silent
 * drop.
 *
 * `title` and `description` remain plain strings because they name and summarise
 * rather than assert. Everything the feature *claims about the application* goes
 * through `factualClaims`, where it can be checked.
 */
export const featureEnrichmentSchema = z
  .object({
    title: z.string().min(1).max(SEMANTIC_LIMITS.maxTitleLength),
    description: z.string().min(1).max(SEMANTIC_LIMITS.maxDescriptionLength),
    factualClaims: z
      .array(factualClaimEnrichmentSchema)
      .max(SEMANTIC_LIMITS.maxFactualClaims)
      .default([]),
    languageClaims: z
      .array(languageClaimEnrichmentSchema)
      .max(SEMANTIC_LIMITS.maxLanguageClaims)
      .default([]),
    /** Prose for a human reviewer. Never used as a number. */
    confidenceReason: z.string().min(1).max(SEMANTIC_LIMITS.maxDescriptionLength),
  })
  .strict();

/** One step a model may propose. `targets` must not be empty. */
export const workflowStepEnrichmentSchema = z
  .object({
    text: z.string().min(1).max(SEMANTIC_LIMITS.maxStepLength),
    targets: z.array(z.string().min(1)).min(1).max(SEMANTIC_LIMITS.maxGraphRefs),
  })
  .strict();

/** What a model may return for one workflow. */
export const workflowEnrichmentSchema = z
  .object({
    title: z.string().min(1).max(SEMANTIC_LIMITS.maxTitleLength),
    steps: z.array(workflowStepEnrichmentSchema).min(1).max(SEMANTIC_LIMITS.maxWorkflowSteps),
  })
  .strict();

/** Validated feature enrichment. */
export type FeatureEnrichment = z.infer<typeof featureEnrichmentSchema>;
/** Validated factual claim from a model. */
export type FactualClaimEnrichment = z.infer<typeof factualClaimEnrichmentSchema>;
/** Validated language claim from a model. */
export type LanguageClaimEnrichment = z.infer<typeof languageClaimEnrichmentSchema>;
/** Validated workflow enrichment. */
export type WorkflowEnrichment = z.infer<typeof workflowEnrichmentSchema>;
/** Validated workflow step enrichment. */
export type WorkflowStepEnrichment = z.infer<typeof workflowStepEnrichmentSchema>;
