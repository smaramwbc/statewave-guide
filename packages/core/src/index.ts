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
