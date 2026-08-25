/**
 * The ports of the guide runtime.
 *
 * Core owns orchestration and nothing else. Where knowledge comes from, where
 * memory is stored, and which model does the reasoning are all decisions the
 * host makes by supplying an implementation of one of these interfaces.
 *
 * Every port here is intentionally free of vendor concepts. {@link MemoryProvider}
 * is shaped so Statewave can become its default implementation later — the
 * `subject` field is a namespace, not a Statewave API — but core never imports
 * a Statewave client, has no HTTP dependency, and works completely offline with
 * the in-memory implementations shipped alongside it.
 *
 * @packageDocumentation
 */

import type {
  AppContext,
  GuideActionDescriptor,
  GuideActionRequest,
  ProductElement,
  ProductFeature,
  ProductKnowledgeResult,
} from '@statewavedev/guide-shared';

// ---------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------

/** Optional refinements for a knowledge search. */
export interface KnowledgeSearchOptions {
  /** Maximum number of results to return. */
  limit?: number;
}

/**
 * Answers "what does this application do?".
 *
 * Day 0 ships {@link createStaticKnowledgeProvider}, which searches a Product
 * Model in memory. Later providers may search an index, call a service, or
 * blend deterministic facts with AI-generated explanations — the runtime does
 * not care which, and does not re-rank what a provider returns.
 */
export interface KnowledgeProvider {
  /** Identifier used in diagnostics. */
  readonly name?: string;

  /**
   * Finds features relevant to `query`.
   *
   * `context` lets a provider prefer what is on screen — a query for "create"
   * should surface the Clients feature when the user is on `/clients`.
   */
  search(
    query: string,
    context?: AppContext,
    options?: KnowledgeSearchOptions,
  ): Promise<ProductKnowledgeResult[]>;

  /** Looks a feature up by id, when the provider supports direct lookup. */
  getFeature?(id: string): Promise<ProductFeature | undefined>;

  /** Looks an element up by its semantic id, when the provider supports it. */
  getElement?(id: string): Promise<ProductElement | undefined>;
}

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

/** One remembered fact. */
export interface MemoryRecord {
  /** Provider-assigned identifier. */
  id: string;
  /** The remembered text. */
  text: string;
  /**
   * Namespace the record belongs to — a user, a workspace, a project.
   * Providers that do not namespace may ignore it.
   */
  subject?: string;
  /** Provider-defined category, e.g. `chat.note` or `guide.completed`. */
  kind?: string;
  /** Relevance for this retrieval, in `[0, 1]`. Absent for direct reads. */
  score?: number;
  /** ISO 8601 timestamp of when the record was written. */
  createdAt?: string;
  /** Provider-specific extras. */
  metadata?: Record<string, unknown>;
}

/** A request to recall relevant memories. */
export interface MemoryRetrieveInput {
  /** What to search for. */
  query: string;
  /** Namespace to search within. */
  subject?: string;
  /** Maximum number of records to return. */
  limit?: number;
  /** The current application context, for providers that use it to rank. */
  context?: AppContext;
}

/** A request to remember something. */
export interface MemoryWriteInput {
  /** The text to remember. */
  text: string;
  /** Namespace to write into. */
  subject?: string;
  /** Category of the record, e.g. `guide.completed`. */
  kind?: string;
  /** Provider-specific extras. */
  metadata?: Record<string, unknown>;
}

/**
 * Persistent, retrievable memory across sessions.
 *
 * Two methods, on purpose. Anything richer — summarisation, compaction,
 * consolidation — belongs inside an implementation, not in this contract.
 */
export interface MemoryProvider {
  /** Identifier used in diagnostics. */
  readonly name?: string;
  /** Returns records relevant to the request, most relevant first. */
  retrieve(input: MemoryRetrieveInput): Promise<MemoryRecord[]>;
  /** Stores a new record. */
  remember(input: MemoryWriteInput): Promise<void>;
}

// ---------------------------------------------------------------------------
// Model — the seam for the future agent layer
// ---------------------------------------------------------------------------

/** One turn of a conversation. */
export interface ModelMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** What a model is asked to do. */
export interface ModelGenerateRequest {
  /** System instructions assembled by the runtime. */
  system?: string;
  /** Conversation so far. */
  messages: ModelMessage[];
  /**
   * The action vocabulary the model may draw on, already filtered to what an
   * agent is allowed to see.
   */
  actions?: GuideActionDescriptor[];
  /** Cancellation signal. */
  signal?: AbortSignal;
}

/** What a model produced. */
export interface ModelGenerateResult {
  /** The reply text. */
  text: string;
  /**
   * Actions the model would like to run.
   *
   * These are *requests*, not commands. Every one still goes through the action
   * registry, where it is validated against a schema and gated by risk policy.
   * A model can therefore ask for something it is not allowed to do, and be
   * refused — which is exactly the intended failure mode.
   */
  actionRequests?: GuideActionRequest[];
}

/**
 * A pluggable language model.
 *
 * Deliberately not implemented in Day 0: no vendor SDK, no HTTP client, no
 * prompt templates. The interface exists so the conversational runtime
 * (roadmap Day 6) can be built without core ever depending on a specific
 * provider.
 */
export interface ModelProvider {
  /** Identifier used in diagnostics. */
  readonly name?: string;
  /** Produces a reply, and optionally a set of action requests. */
  generate(request: ModelGenerateRequest): Promise<ModelGenerateResult>;
}
