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
