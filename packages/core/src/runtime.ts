/**
 * The guide runtime: the object a host application holds on to.
 *
 * It does four things and delegates everything else:
 *
 * - owns the current {@link AppContext} and lets the host update it
 * - owns the {@link ActionRegistry} and gates every execution through it
 * - forwards knowledge questions to a {@link KnowledgeProvider}
 * - forwards memory to a {@link MemoryProvider}
 *
 * It has no DOM code, no React, no HTTP client and no model. Those are all
 * either the host's job or a provider's.
 *
 * @packageDocumentation
 */

import type {
  AppContext,
  AppContextPatch,
  GuideActionDescriptor,
  GuideActionRequest,
  GuideActionResult,
  ProductKnowledgeResult,
} from '@statewavedev/guide-shared';
import {
  createActionRegistry,
  type ActionRegistry,
  type ListOptions,
} from '@statewavedev/guide-actions';
import { createContextStore, type ContextListener, type ContextStore } from './context-store.js';
import type {
  KnowledgeProvider,
  MemoryProvider,
  MemoryRecord,
  MemoryRetrieveInput,
  MemoryWriteInput,
  ModelProvider,
} from './providers.js';

/** Configuration for {@link createGuideRuntime}. */
export interface GuideRuntimeOptions {
  /**
   * The action registry to use. One is created if omitted.
   *
   * The runtime takes over the registry's context source, so handlers and the
   * risk policy always see the runtime's context rather than a stale snapshot.
   */
  actions?: ActionRegistry;
  /** Answers questions about the product. Absent means knowledge search returns nothing. */
  knowledgeProvider?: KnowledgeProvider;
  /** Persists and recalls facts. Absent means memory calls are no-ops. */
  memoryProvider?: MemoryProvider;
  /**
   * Reserved for the conversational runtime (roadmap Day 6).
   *
   * Stored and exposed, but not used by anything in Day 0.
   */
  modelProvider?: ModelProvider;
  /** Initial application context. */
  initialContext?: AppContext;
  /**
   * Default `subject` for memory reads and writes that do not specify one.
   * A namespace such as `user:42` or `workspace:acme`.
   */
  memorySubject?: string;
}

/** Options for {@link GuideRuntime.searchKnowledge}. */
export interface SearchKnowledgeOptions {
  /** Overrides the runtime's current context for this search. */
  context?: AppContext;
  /** Maximum number of results. */
  limit?: number;
}

/** The providers a runtime was configured with. Read-only; useful for diagnostics. */
export interface GuideRuntimeProviders {
  knowledge?: KnowledgeProvider;
  memory?: MemoryProvider;
  model?: ModelProvider;
}

/** The orchestration surface of Statewave Guide. */
export interface GuideRuntime {
  /** The action registry. Register host actions on it directly. */
  readonly actions: ActionRegistry;
  /** The providers this runtime was given. */
  readonly providers: GuideRuntimeProviders;

  /** Returns the current application context. */
  getContext(): AppContext;
  /** Replaces the application context. Validated; throws on a malformed value. */
  setContext(next: AppContext): AppContext;
  /** Merges a partial update. `null` clears a field, `undefined` leaves it alone. */
  patchContext(patch: AppContextPatch): AppContext;
  /** Subscribes to context changes. Returns an unsubscribe function. */
  subscribeToContext(listener: ContextListener): () => void;

  /**
   * Searches product knowledge.
   *
   * Returns an empty array when no {@link KnowledgeProvider} is configured.
   * Errors thrown by a provider propagate — a broken provider is the host's
   * bug, and swallowing it would hide the misconfiguration.
   */
  searchKnowledge(
    query: string,
    options?: SearchKnowledgeOptions,
  ): Promise<ProductKnowledgeResult[]>;

  /**
   * Validates and runs an action.
   *
   * Never throws. Delegates to the registry, which owns schema validation and
   * the risk policy.
   */
  executeAction<TData = unknown>(request: GuideActionRequest): Promise<GuideActionResult<TData>>;

  /**
   * Lists the actions available right now, as inert descriptors.
   *
   * Pass `{ visibleTo: 'agent' }` to get the subset a model may be told about.
   */
  getAvailableActions(options?: ListOptions): GuideActionDescriptor[];

  /** Recalls relevant memories. Returns `[]` when no memory provider is configured. */
  recall(input: MemoryRetrieveInput): Promise<MemoryRecord[]>;

  /** Stores a memory. A no-op when no memory provider is configured. */
  remember(input: MemoryWriteInput): Promise<void>;
}

/**
 * Creates a guide runtime.
 *
 * @example
 * ```ts
 * const guide = createGuideRuntime({
 *   actions,
 *   knowledgeProvider: createStaticKnowledgeProvider(productModel),
 *   memoryProvider: createInMemoryMemoryProvider(),
 * });
 *
 * guide.setContext({ route: '/clients' });
 * await guide.executeAction({ action: 'highlight', input: { elementId: 'clients.create' } });
 * ```
 */
export function createGuideRuntime(options: GuideRuntimeOptions = {}): GuideRuntime {
  const store: ContextStore = createContextStore(options.initialContext ?? {});
  const actions = options.actions ?? createActionRegistry();

  // The runtime is the single owner of context from here on. Handlers and the
  // risk policy read through this, so they can never see a stale snapshot.
  actions.setContextSource(() => store.get());

  const providers: GuideRuntimeProviders = {};
  if (options.knowledgeProvider) providers.knowledge = options.knowledgeProvider;
  if (options.memoryProvider) providers.memory = options.memoryProvider;
  if (options.modelProvider) providers.model = options.modelProvider;

  function withSubject<T extends { subject?: string }>(input: T): T {
    if (input.subject !== undefined || options.memorySubject === undefined) return input;
    return { ...input, subject: options.memorySubject };
  }

  return {
    actions,
    providers,

    getContext: () => store.get(),
    setContext: (next) => store.set(next),
    patchContext: (patch) => store.patch(patch),
    subscribeToContext: (listener) => store.subscribe(listener),

    async searchKnowledge(query, searchOptions = {}) {
      const provider = providers.knowledge;
      if (!provider) return [];

      const context = searchOptions.context ?? store.get();
      const forwarded =
        searchOptions.limit === undefined ? undefined : { limit: searchOptions.limit };
      return provider.search(query, context, forwarded);
    },

    executeAction: (request) => actions.execute(request),

    getAvailableActions: (listOptions) => actions.list(listOptions),

    async recall(input) {
      const provider = providers.memory;
      if (!provider) return [];
      const context = input.context ?? store.get();
      return provider.retrieve(withSubject({ ...input, context }));
    },

    async remember(input) {
      await providers.memory?.remember(withSubject(input));
    },
  };
}
