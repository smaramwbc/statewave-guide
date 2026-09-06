/**
 * `@statewavedev/guide-core`
 *
 * The runtime and orchestration layer. It holds the application context, owns
 * the action registry, and defines the ports through which knowledge, memory
 * and — later — a language model are plugged in.
 *
 * Core is deliberately environment-free: no DOM, no React, no HTTP, no vendor
 * SDK. Everything it needs from the outside world arrives as an interface
 * implementation.
 *
 * @packageDocumentation
 */

export { createGuideRuntime } from './runtime.js';
export type {
  GuideRuntime,
  GuideRuntimeOptions,
  GuideRuntimeProviders,
  SearchKnowledgeOptions,
} from './runtime.js';

export { createContextStore } from './context-store.js';
export type { ContextListener, ContextStore } from './context-store.js';

export type {
  KnowledgeProvider,
  KnowledgeSearchOptions,
  MemoryProvider,
  MemoryRecord,
  MemoryRetrieveInput,
  MemoryWriteInput,
  ModelGenerateRequest,
  ModelGenerateResult,
  ModelMessage,
  ModelProvider,
} from './providers.js';

export { createStaticKnowledgeProvider } from './static-knowledge-provider.js';
export type { StaticKnowledgeProviderOptions } from './static-knowledge-provider.js';

export { createInMemoryMemoryProvider } from './in-memory-memory-provider.js';
export type {
  InMemoryMemoryProvider,
  InMemoryMemoryProviderOptions,
} from './in-memory-memory-provider.js';

export { byScoreThenId, scoreFields, tokenize } from './lexical-score.js';
export type { ScoredField } from './lexical-score.js';

// --- The UI-facing query contract (Closed Loop #12) -----------------------
export { createGuideQueryEngine } from './query/engine.js';
export type { GuideQueryEngine, GuideQueryEngineOptions } from './query/engine.js';
export {
  GUIDE_QUERY_CONTRACT_VERSION,
  GUIDE_QUERY_INTENTS,
  GUIDE_SAFE_ACTION_KINDS,
} from './query/contract.js';
export {
  conceptNounsOnRoute,
  isDisplayableInstanceName,
  redactContextForDiagnostics,
  resolveRuntimeChoices,
  selectedInstance,
  supportedConceptNouns,
} from './query/instances.js';
export type { InstanceRefusal, InstanceResolution } from './query/instances.js';
export type {
  GuideAnswer,
  GuideAnswerStep,
  GuidePrunedStep,
  GuideQueryAmbiguity,
  GuideQueryContext,
  GuideQueryDiagnostics,
  GuideQueryIntent,
  GuideQueryPlan,
  GuideQueryRequest,
  GuideQueryResponse,
  GuideQueryStatus,
  GuideRuntimeChoice,
  GuideSafeAction,
  GuideVisualContext,
  RuntimeInstanceRef,
} from './query/contract.js';
export { classifyIntent } from './query/intent.js';
export { describeVisualContext, spatialRelationOf } from './query/visual-context.js';

// --- Closed Loop #19: memory remembers experience, not truth ---------------
export {
  acceptMemoryEvents,
  validateMemoryEvent,
  ASSISTANCE_MODE_VALUES,
  GUIDANCE_DETAIL_VALUES,
  GUIDE_MEMORY_AUTHORITIES,
  GUIDE_MEMORY_EVENT_KINDS,
} from './memory/events.js';
export type {
  AssistanceModePreference,
  GuidanceDetailPreference,
  GuideMemoryAuthority,
  GuideMemoryEvent,
  GuideMemoryEventKind,
  GuideMemoryEventMetadata,
  MemoryRejection,
} from './memory/events.js';
export {
  GUIDE_PREFERENCE_CLAIM_KEYS,
  GUIDE_STATE_NAMESPACE,
  canonicalPreferenceValue,
  guideStateKey,
  ingestKeyFor,
  preferenceForClaimKey,
  preferenceValueFromCanonical,
} from './memory/keys.js';
export type { GuideStateKey, GuideStateKind } from './memory/keys.js';
export {
  DURABLE_REMOTE_EVENT_KINDS,
  GUIDE_MEMORY_DURABILITY,
  isDurableRemoteEvent,
  remoteMemoryWriteDecision,
} from './memory/retention.js';
export type { GuideMemoryDurability, RemoteMemoryWriteDecision } from './memory/retention.js';
export { hasCompletedGuide, projectMemoryProfile } from './memory/profile.js';
export type {
  GuideExplicitPreferences,
  GuideFeatureHistory,
  GuideInteractionPatterns,
  GuideMemoryProfile,
} from './memory/profile.js';
export {
  classifyAdaptations,
  GUIDE_META_COPY,
  hasVisibleAdaptation,
  neutralPresentationPlan,
  planPresentation,
  resolvePresentation,
  RETIRED_META_COPY,
} from './memory/planner.js';
export type {
  AdaptedGuideResponse,
  GuideAdaptationDimension,
  GuideAdaptationOutcome,
  GuideAdaptationReason,
  GuideAdaptationRecord,
  ResolvedGuidePresentation,
  GuideAdaptationRefusal,
  GuideMetaCopyId,
  GuidePresentationPlan,
} from './memory/planner.js';
export {
  createFailingGuideMemoryStore,
  createInMemoryGuideMemoryStore,
  scopeKey,
  statewaveAdapterStatus,
} from './memory/store.js';
export type {
  GuideMemoryScope,
  GuideMemoryStore,
  GuideMemoryStoreDiagnostics,
} from './memory/store.js';
export { renderContextualSentence, verifyContextualStatement } from './query/contextual.js';
export type {
  ContextualReceipt,
  ContextualRelation,
  ContextualSentenceForm,
  ContextualStatement,
  ContextualVerification,
} from './query/contextual.js';
export {
  classifyRuntimeText,
  describableRuntimeText,
  freshRuntimeLanguage,
  isRepeatableRuntimeText,
  DESCRIPTOR_AUTHORITY,
  RUNTIME_LANGUAGE_SOURCES,
} from './query/runtime-language.js';
export type {
  RuntimeLanguagePrivacy,
  RuntimeLanguageSource,
  RuntimeLanguageTrust,
  RuntimeVisibleLanguage,
} from './query/runtime-language.js';
export { authorisedScreenName, isSpeakableScreenName } from './query/screen-name.js';
export type { AuthorisedScreenName } from './query/screen-name.js';
export {
  controlIndex,
  featureEntry,
  featureOwning,
  routeMatches,
  screenFor,
  screenMatching,
} from './query/bundle.js';
export type {
  GuideControl,
  GuideFeatureEntry,
  GuideKnowledgeBundle,
  GuideScreen,
  ScreenNameOrigin,
} from './query/bundle.js';
export type { GuideQueryProvider } from './query/provider.js';
