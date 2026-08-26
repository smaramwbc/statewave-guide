/**
 * `@statewavedev/guide-shared`
 *
 * Framework-independent types and schemas shared by every Statewave Guide
 * package. No runtime behaviour beyond validation lives here, and nothing in
 * this package imports a browser, a bundler, or a UI framework — which is what
 * lets the indexer (Node) and the React bindings (browser) agree on exactly the
 * same contracts.
 *
 * @packageDocumentation
 */

export type {
  ProvenanceReference,
  ProductElement,
  ProductElementType,
  ProductKnowledgeResult,
} from './product-model.js';

// --- The semantic Product Model -------------------------------------------
export type {
  SemanticEvidence,
  GeneratorAttribution,
  ProductClaimType,
  ProductClaimStatus,
  CapabilityAction,
  ClaimAssertion,
  ClaimProvenance,
  ClaimVerificationOutcome,
  FeatureClaimSummary,
  SemanticRejectionReason,
  ProductClaim,
  ProductWorkflowStep,
  ProductWorkflow,
  WorkflowOrderBasis,
  ProductFeatureIdOrigin,
  ProductPermission,
  ProductFeature,
  ProductModelSource,
  SemanticVerificationSummary,
  ProductModel,
} from './semantic.js';

export { FACTUAL_CLAIM_TYPES, LANGUAGE_CLAIM_TYPES, isFactualClaimType } from './semantic.js';

export {
  SEMANTIC_LIMITS,
  semanticEvidenceSchema,
  generatorAttributionSchema,
  productClaimTypeSchema,
  productClaimStatusSchema,
  capabilityActionSchema,
  claimAssertionSchema,
  claimProvenanceSchema,
  claimVerificationOutcomeSchema,
  semanticRejectionReasonSchema,
  productClaimSchema,
  productWorkflowStepSchema,
  productWorkflowSchema,
  productPermissionSchema,
  productFeatureSchema,
  productModelSourceSchema,
  semanticVerificationSummarySchema,
  productModelSchema,
  featureEnrichmentSchema,
  factualClaimEnrichmentSchema,
  languageClaimEnrichmentSchema,
  workflowEnrichmentSchema,
  workflowStepEnrichmentSchema,
  toCapabilityAction,
  claimDecisionSchema,
} from './semantic-schemas.js';

export type {
  FeatureEnrichment,
  FactualClaimEnrichment,
  LanguageClaimEnrichment,
  WorkflowEnrichment,
  WorkflowStepEnrichment,
} from './semantic-schemas.js';

export type { AppContext, AppContextEntity, AppContextPatch } from './app-context.js';

export type {
  GuideActionType,
  GuideActionName,
  GuideActionRisk,
  GuideActionSource,
  GuideActionSchema,
  GuideActionInput,
  GuideActionExecutionContext,
  GuideActionHandler,
  GuideActionDefinition,
  RegisteredGuideAction,
  GuideActionDescriptor,
  GuideActionRequest,
  GuideActionResult,
} from './guide-action.js';

export type { GuideErrorCode, GuideErrorIssue, GuideError, GuideResult } from './guide-error.js';
export { guideError, isSuccess } from './guide-error.js';

export {
  GUIDE_ATTRIBUTE,
  LEGACY_GUIDE_ATTRIBUTE,
  GUIDE_ATTRIBUTES,
  GUIDE_ELEMENT_ID_PATTERN,
  GUIDE_ELEMENT_ID_MAX_SEGMENTS,
  GUIDE_ELEMENT_ID_MAX_LENGTH,
  isValidGuideElementId,
  guideElementIdSegments,
  guideElementNamespace,
} from './semantic-id.js';
export type { GuideAttribute } from './semantic-id.js';

export {
  metadataSchema,
  guideElementIdSchema,
  provenanceReferenceSchema,
  productElementTypeSchema,
  productElementSchema,
  appContextEntitySchema,
  appContextSchema,
  guideErrorCodeSchema,
  guideErrorSchema,
  guideActionRiskSchema,
  guideActionSourceSchema,
  guideActionRequestSchema,
  guideActionDescriptorSchema,
  highlightPlacementSchema,
  navigateInputSchema,
  highlightInputSchema,
  scrollInputSchema,
  openInputSchema,
  startGuideInputSchema,
  builtinActionSchemas,
} from './schemas.js';

export type {
  NavigateInput,
  HighlightInput,
  ScrollInput,
  OpenInput,
  StartGuideInput,
  HighlightPlacement,
} from './schemas.js';

// --- The claim verification matrix ----------------------------------------
export type { ClaimVerificationRule } from './verification-matrix.js';
export {
  BUILT_IN_VERIFICATION_RULES,
  UNSUPPORTED_CAPABILITY_ACTIONS,
  findBuiltInRule,
} from './verification-matrix.js';
