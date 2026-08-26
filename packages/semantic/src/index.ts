/**
 * `@statewavedev/guide-semantic`
 *
 * The semantic layer, and the boundary it defends:
 *
 * > **Code determines what exists. AI may explain what verified facts mean.**
 *
 * AI is not product truth. A model may produce *language*; it may not introduce
 * an application *fact*. Everything it says is checked against the
 * ApplicationGraph, and anything unsupported is rejected — recorded as
 * rejected, not silently dropped, so refusals stay visible in the output rather
 * than becoming an absence nobody can audit.
 *
 * This half of the pipeline is everything that happens *before* a model is
 * called, plus the seam it is called through:
 *
 * - {@link discoverFeatureCandidates} decides what features exist. Deterministic
 *   code, never a model.
 * - {@link buildEvidencePack} bounds what a model may see, spine first, with the
 *   graph's own refusals attached.
 * - {@link renderEvidence} and {@link SEMANTIC_SYSTEM_INSTRUCTION} keep trusted
 *   instruction and untrusted repository data structurally apart.
 * - {@link SemanticModelProvider} is the vendor seam; `createMockProvider` is the
 *   only implementation here, and it is deterministic and scriptable.
 * - {@link dependencyFingerprint} decides what is stale, so regeneration is
 *   selective.
 *
 * The system fails closed throughout. When in doubt, reject.
 *
 * @example
 * ```ts
 * import {
 *   buildEvidencePack,
 *   buildFeatureEnrichmentRequest,
 *   createMockProvider,
 *   discoverFeatureCandidates,
 * } from '@statewavedev/guide-semantic';
 *
 * const provider = createMockProvider();
 * for (const candidate of discoverFeatureCandidates(graph, { limit: 50 })) {
 *   const pack = buildEvidencePack(graph, candidate);
 *   const result = await provider.generateStructured(buildFeatureEnrichmentRequest(pack));
 *   // `result.data` is language. It is not yet product truth: it still has to
 *   // survive verification against the graph.
 * }
 * ```
 *
 * @packageDocumentation
 */

// --- Candidate discovery ---------------------------------------------------

/** Proposes every feature the graph can justify. Deterministic; never a model. */
export { discoverFeatureCandidates } from './candidates.js';
export type {
  CandidateDiscoveryReason,
  DiscoverCandidatesOptions,
  FeatureCandidate,
} from './candidates.js';

/** Feature id rules: a semantic id is adopted, anything else is derived. */
export { deriveFeatureId, reserveFeatureId, slugSegment } from './feature-id.js';

// --- Evidence packs --------------------------------------------------------

/** Builds the bounded neighbourhood one feature may be described from. */
export {
  buildEvidencePack,
  describeRefusal,
  DEFAULT_EVIDENCE_PACK_LIMITS,
} from './evidence-pack.js';
export type { EvidencePack, EvidencePackLimits } from './evidence-pack.js';

/** Which relationships carry behaviour, and in what order a pack prefers them. */
export { BEHAVIOUR_SPINE, spineRank } from './spine.js';

// --- Prompting -------------------------------------------------------------

/** The trusted instruction and the untrusted data block that accompanies it. */
export {
  SEMANTIC_SYSTEM_INSTRUCTION,
  FEATURE_ENRICHMENT_INSTRUCTION,
  OPPORTUNITY_INSTRUCTION,
  WORKFLOW_ENRICHMENT_INSTRUCTION,
  FEATURE_ENRICHMENT_TASK,
  WORKFLOW_ENRICHMENT_TASK,
  EVIDENCE_FENCE_OPEN,
  EVIDENCE_FENCE_CLOSE,
  FENCE_NEUTRALISED_TOKEN,
  buildFeatureEnrichmentRequest,
  buildWorkflowEnrichmentRequest,
  neutraliseFence,
  renderEvidence,
  toEvidenceDocument,
} from './prompt.js';
export type {
  EvidenceDocument,
  EvidenceNodeSummary,
  EvidenceRelationshipSummary,
} from './prompt.js';

// --- The vendor seam -------------------------------------------------------

/** The provider interface, its retry decorator, and the error vocabulary. */
export { withRetry, RETRYABLE_ERROR_CODES, NEVER_RETRYABLE_ERROR_CODES } from './provider.js';
export type {
  RetryOptions,
  SemanticGenerationRequest,
  SemanticGenerationResult,
  SemanticModelProvider,
  SemanticProviderErrorCode,
  SemanticUsage,
} from './provider.js';

/** The deterministic, scriptable, recording provider used by tests and by default. */
export {
  createMockProvider,
  MALFORMED_RESPONSE,
  MOCK_DEFAULT_KEY,
  MOCK_PROVIDER_MODEL,
  MOCK_PROVIDER_NAME,
} from './providers/mock.js';
export type { MockScript, RecordedCall } from './providers/mock.js';

// --- Verification ----------------------------------------------------------

/**
 * The gate. Every factual assertion resolves against the verification matrix,
 * and an assertion the matrix has no rule for is refused rather than assumed.
 */
export { verifyEnrichment, featureConfidence, FEATURE_SUBJECT_PREFIX } from './verifier.js';
export type {
  RejectedClaim,
  SemanticVerificationResult,
  VerifyEnrichmentInput,
} from './verifier.js';

/** The extension API: how an application adds a check the matrix does not have. */
export { createClaimVerifierRegistry } from './registry.js';
export type {
  ClaimVerifierContext,
  ClaimVerifierRegistration,
  ClaimVerifierRegistry,
  ClaimVerifierResult,
} from './registry.js';

// --- Rendering -------------------------------------------------------------

/**
 * Prose composition. The renderer sees accepted claims and nothing else, so it
 * cannot reintroduce a rejected assertion — it never sees one.
 */
export {
  createDeterministicRenderer,
  DETERMINISTIC_RENDERER_NAME,
  featureTitleFromId,
  NO_VERIFIED_DESCRIPTION,
} from './render.js';
export type { ProseRenderer, ProseRenderRequest } from './render.js';

/** A conservative detector for propositions a renderer added. For tests, not proof. */
export { checkRenderedPropositions, PROPOSITION_WATCHLIST } from './proposition.js';
export type {
  PropositionCheckOptions,
  PropositionCheckResult,
  WatchedProposition,
} from './proposition.js';

// --- Orchestration ---------------------------------------------------------

/** The whole pipeline: discover, pack, prompt, verify, render, assemble. */
export { enrichApplicationGraph } from './enrich.js';
export type {
  EnrichmentEvent,
  EnrichmentOptions,
  EnrichmentRejection,
  EnrichmentRun,
} from './enrich.js';

// --- Artefacts -------------------------------------------------------------

/** `product.json`: deterministic bytes, and the hash that ignores the clock. */
export {
  PRODUCT_FILE_NAME,
  applicationGraphPath,
  normaliseProductModel,
  productModelHash,
  productModelPath,
  readApplicationGraph,
  readProductModel,
  serializeProductModel,
  writeProductModel,
} from './product-file.js';
export type { ProductFileOptions, WriteProductResult } from './product-file.js';

/** Markdown, projected from the Product Model and never from a model response. */
export {
  DEFAULT_DOCS_DIR,
  DOC_MARKER,
  docSlug,
  projectDocs,
  renderFeatureDoc,
  renderIndexDoc,
  renderWorkflowDoc,
  writeDocs,
} from './docs.js';
export type { DocFile, WriteDocsOptions, WriteDocsResult } from './docs.js';

// --- Freshness -------------------------------------------------------------

/** Hashes of the facts a feature — or a whole model — was derived from. */
export { dependencyFingerprint, graphHash } from './fingerprint.js';

// --- Safety ----------------------------------------------------------------

/** Default-deny source exclusion and secret redaction. */
export {
  DEFAULT_SENSITIVE_PATTERNS,
  REDACTION_PLACEHOLDER,
  isSensitivePath,
  redactSecrets,
} from './safety.js';

// --- Pipeline metadata -----------------------------------------------------

/** Version of the enrichment pipeline, recorded on everything it generates. */
export { SEMANTIC_GENERATOR_VERSION } from './constants.js';

// --- Real provider adapters -----------------------------------------------
// Vendor-specific code stops here. Nothing below is imported by guide-shared,
// guide-core or guide-indexer, and the benchmark talks only to
// `SemanticModelProvider`.
export { createOpenAiCompatibleProvider } from './providers/openai-compatible.js';
export type {
  OpenAiCompatibleOptions,
  StructuredOutputMode,
} from './providers/openai-compatible.js';
export { createAnthropicProvider } from './providers/anthropic.js';
export type { AnthropicProviderOptions, AnthropicEffort } from './providers/anthropic.js';
export { DEFAULT_PROVIDERS, resolveProvider, resolveProviders } from './providers/registry.js';
export type { ProviderConfig, ProviderKind, ResolvedProvider } from './providers/registry.js';
export { toJsonSchema } from './providers/json-schema.js';
export { extractJsonObject } from './providers/shared.js';

// --- Feature scope and claim opportunities ---------------------------------
// The Round 2 layer: which graph facts belong to a feature, and which factual
// claims that feature could truthfully make. Both are deterministic and both
// are computed before a model is asked anything.
export { computeFeatureScope, describeOwnershipPath } from './scope.js';
export type {
  FeatureScope,
  FeatureScopeInput,
  ScopeClass,
  ScopeBasis,
  ScopeEntry,
  OwnershipStep,
} from './scope.js';
export { planClaimOpportunities, OPPORTUNITY_LIMITS } from './opportunities.js';
export type {
  ClaimOpportunity,
  ClaimDecision,
  DeclinedOpportunity,
  OpportunityPlanInput,
} from './opportunities.js';
export { createClaimOpportunityRegistry } from './opportunity-registry.js';
export type {
  ClaimOpportunityProvider,
  ClaimOpportunityRegistry,
  ClaimOpportunityContext,
  ClaimOpportunityDraft,
} from './opportunity-registry.js';
