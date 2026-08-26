/**
 * The action contract: the only vocabulary an agent has for touching the app.
 *
 * Two rules shape everything in this file.
 *
 * 1. Actions are *named capabilities*, not DOM operations. `highlight` takes a
 *    semantic element id; there is no action anywhere in the system that takes
 *    a selector, a DOM node, or a piece of code.
 * 2. Every action declares a {@link GuideActionRisk}. Guidance is safe by
 *    construction; anything consequential must opt in to confirmation, and the
 *    runtime can refuse it long before a UI exists to confirm it.
 *
 * @packageDocumentation
 */

import type { z } from 'zod';
import type { AppContext } from './app-context.js';
import type { GuideError } from './guide-error.js';

/**
 * The built-in action vocabulary shipped by Statewave Guide.
 *
 * All five are pure guidance: they move the user's attention, they never change
 * application data.
 */
export type GuideActionType = 'navigate' | 'highlight' | 'scroll' | 'open' | 'startGuide';

/**
 * Any action name the runtime will accept.
 *
 * Built-in names are suggested by editors, but a host may register its own
 * actions under any name without the runtime needing to change. The
 * `(string & {})` member is what preserves autocomplete while keeping the type
 * open.
 */
export type GuideActionName = GuideActionType | (string & {});

/**
 * How dangerous an action is.
 *
 * - `safe` — pure guidance. Navigating, highlighting, scrolling. Executed
 *   without ceremony.
 * - `confirm` — changes application state and must be confirmed by a human
 *   before it runs. Saving, sending, archiving.
 * - `restricted` — never exposed to an agent. Available only to host code that
 *   calls the registry directly. Deleting, paying, signing.
 *
 * Day 0 records the classification and enforces exposure; it does not yet ship
 * a confirmation UI. See `docs/architecture.md`.
 */
export type GuideActionRisk = 'safe' | 'confirm' | 'restricted';

/** Who asked for an action to run. */
export type GuideActionSource = 'user' | 'agent' | 'system';

/**
 * The schema shape an action uses to validate its input.
 *
 * Any Zod schema qualifies. Actions that take no input use `z.object({})`
 * rather than omitting the schema, so validation is uniform.
 */
export type GuideActionSchema = z.ZodType;

/** Infers the validated input type an action handler receives. */
export type GuideActionInput<TSchema extends GuideActionSchema> = z.infer<TSchema>;

/**
 * Everything a handler learns about the call beyond its own input.
 *
 * Handlers are given the application context rather than reading it from a
 * global, which is what lets the same action definition run in a browser, in a
 * test, and later in a Tauri window.
 */
export interface GuideActionExecutionContext {
  /** Identifier for this execution, echoed back in the result. */
  requestId: string;
  /** Who requested the action. */
  source: GuideActionSource;
  /** The application context at the moment of the call, if the host set one. */
  context?: AppContext;
  /** Cancellation signal, when the caller supplied one. */
  signal?: AbortSignal;
}

/**
 * An action implementation.
 *
 * May be sync or async. Throwing is allowed and expected — the registry
 * converts a thrown error into a failed {@link GuideActionResult} so callers
 * never have to wrap execution in `try`/`catch`.
 */
export type GuideActionHandler<TInput, TOutput> = (
  input: TInput,
  context: GuideActionExecutionContext,
) => TOutput | Promise<TOutput>;

/**
 * A registered action.
 *
 * @typeParam TSchema - the Zod schema validating this action's input.
 * @typeParam TOutput - what the handler resolves to on success.
 *
 * @example
 * ```ts
 * const navigate = {
 *   name: 'navigate',
 *   description: 'Navigate to an application route',
 *   risk: 'safe',
 *   schema: z.object({ route: z.string() }),
 *   execute: async ({ route }) => router.push(route),
 * } satisfies GuideActionDefinition;
 * ```
 */
export interface GuideActionDefinition<
  TSchema extends GuideActionSchema = GuideActionSchema,
  TOutput = unknown,
> {
  /** Unique name within a registry. */
  name: GuideActionName;
  /** Short human-readable title. Defaults to `name` when omitted. */
  title?: string;
  /**
   * What the action does, written for a model to read. This text is the
   * action's entire documentation as far as a future agent is concerned.
   */
  description: string;
  /** Validates and parses the input before the handler sees it. */
  schema: TSchema;
  /** Risk classification. Defaults to `safe`. */
  risk?: GuideActionRisk;
  /** The implementation. Supplied by the host, never by Statewave Guide. */
  execute: GuideActionHandler<GuideActionInput<TSchema>, TOutput>;
  /** Host-specific extras. Never interpreted by the runtime. */
  metadata?: Record<string, unknown>;
}

/**
 * A registered action with its optional fields resolved.
 *
 * This is what {@link GuideActionDefinition} looks like from the inside of a
 * registry, and the shape callers get back from `list()` and `get()`.
 */
export type RegisteredGuideAction<
  TSchema extends GuideActionSchema = GuideActionSchema,
  TOutput = unknown,
> = GuideActionDefinition<TSchema, TOutput> & {
  title: string;
  risk: GuideActionRisk;
};

/**
 * The public, side-effect-free description of an action.
 *
 * This — and only this — is what may be handed to a model. It carries no
 * handler and no closure over host state.
 */
export interface GuideActionDescriptor {
  name: GuideActionName;
  title: string;
  description: string;
  risk: GuideActionRisk;
  metadata?: Record<string, unknown>;
}

/** A request to run one action. */
export interface GuideActionRequest<TInput = unknown> {
  /** Name of the action to run. */
  action: GuideActionName;
  /** Raw, unvalidated input. The registry parses it against the schema. */
  input?: TInput;
  /** Caller-supplied identifier. Generated when omitted. */
  requestId?: string;
  /** Who is asking. Defaults to `user`. */
  source?: GuideActionSource;
  /**
   * Why the action was requested, in the requester's words. Not used for
   * control flow — it exists so a confirmation prompt can eventually show the
   * user the agent's stated reason.
   */
  reason?: string;
  /** Cancellation signal. */
  signal?: AbortSignal;
}

/**
 * The outcome of an execution.
 *
 * A discriminated union on `success`, so callers narrow with a single check and
 * the compiler stops them reading `data` off a failure. Failures carry a
 * {@link GuideErrorCode}, never a message to be parsed.
 */
export type GuideActionResult<TData = unknown> =
  | {
      success: true;
      action: GuideActionName;
      requestId: string;
      data: TData;
    }
  | {
      success: false;
      action: GuideActionName;
      requestId: string;
      error: GuideError;
    };
