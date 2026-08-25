/**
 * The action registry: the complete set of things that can be done to the
 * application, and the only path to doing them.
 *
 * Nothing in this file knows about a browser, React, or a language model. It
 * knows names, schemas, risk levels and handlers — which is why the same
 * registry can back a React app, a Node test, and a future Tauri window.
 *
 * @packageDocumentation
 */

import type {
  AppContext,
  GuideActionDefinition,
  GuideActionDescriptor,
  GuideActionError,
  GuideActionExecutionContext,
  GuideActionName,
  GuideActionRequest,
  GuideActionResult,
  GuideActionRisk,
  GuideActionSchema,
  GuideActionSource,
  RegisteredGuideAction,
} from '@statewavedev/guide-shared';
import { ActionRegistrationError, actionError, describeThrown, isAbortError } from './errors.js';
import { defaultActionPolicy, type ActionPolicy } from './policy.js';
import { toGuideActionIssues } from './issues.js';

/**
 * A registered action erased to its most general form.
 *
 * Definitions are heterogeneous — each has its own schema and output type — so
 * the registry stores them behind this shape and re-narrows at the call site.
 */
type StoredAction = RegisteredGuideAction<GuideActionSchema, unknown>;

/** Options accepted by {@link ActionRegistry.register}. */
export interface RegisterOptions {
  /**
   * Replace an existing action of the same name instead of throwing.
   * Off by default, so an accidental duplicate is a loud startup failure.
   */
  replace?: boolean;
}

/** Options accepted by {@link ActionRegistry.list}. */
export interface ListOptions {
  /**
   * Only return actions a caller of this kind is allowed to see.
   *
   * Passing `'agent'` is how a host builds the tool list for a model: it
   * excludes `restricted` actions entirely, so they never appear in a prompt.
   */
  visibleTo?: GuideActionSource;
  /** Only return actions with one of these risk levels. */
  risk?: GuideActionRisk[];
}

/** Configuration for {@link createActionRegistry}. */
export interface ActionRegistryOptions {
  /** Actions to register immediately. Equivalent to calling `register` for each. */
  actions?: GuideActionDefinition[];
  /** Overrides the risk gate. Defaults to {@link defaultActionPolicy}. */
  policy?: ActionPolicy;
  /**
   * Supplies the application context to handlers and to the policy.
   *
   * A function rather than a value, so the registry always reads the *current*
   * context instead of a snapshot taken when it was created.
   */
  getContext?: () => AppContext | undefined;
  /** Generates request ids. Defaults to a per-registry counter. */
  createRequestId?: () => string;
  /** Called after every execution, successful or not. For host logging. */
  onExecuted?: (result: GuideActionResult, request: GuideActionRequest) => void;
}

/**
 * A registry of named, schema-validated application actions.
 *
 * Note the deliberate asymmetry between {@link ActionRegistry.list} and
 * {@link ActionRegistry.get}: `list` returns inert descriptors that are safe to
 * serialise into a prompt, while `get` returns the live definition including its
 * handler and is intended for host code only.
 */
export interface ActionRegistry {
  /**
   * Registers an action.
   *
   * @returns a function that unregisters it again — convenient in a React
   * effect cleanup or a test teardown.
   * @throws {ActionRegistrationError} if the definition is malformed, or if the
   * name is already taken and `replace` was not set.
   */
  register<TSchema extends GuideActionSchema, TOutput>(
    definition: GuideActionDefinition<TSchema, TOutput>,
    options?: RegisterOptions,
  ): () => void;

  /** Removes an action. Returns `false` if there was nothing to remove. */
  unregister(name: GuideActionName): boolean;

  /** Whether an action is registered under this name. */
  has(name: GuideActionName): boolean;

  /**
   * Returns the live action, handler included.
   *
   * Host code only. Never hand the result of this to a model.
   */
  get(name: GuideActionName): RegisteredGuideAction | undefined;

  /**
   * Returns inert descriptions of the registered actions, sorted by name.
   *
   * This is the model-facing view: no handlers, no closures, nothing that can
   * be invoked. Pass `{ visibleTo: 'agent' }` to build a tool list.
   */
  list(options?: ListOptions): GuideActionDescriptor[];

  /**
   * Validates and runs an action.
   *
   * Never throws and never rejects. Every failure — unknown name, bad input, a
   * handler that blew up, a policy refusal — comes back as
   * `{ ok: false, error }`.
   */
  execute<TData = unknown>(request: GuideActionRequest): Promise<GuideActionResult<TData>>;

  /**
   * Replaces the function the registry uses to read the application context.
   *
   * Intended for `@statewavedev/guide-core`, which owns the context once a
   * runtime is created and wires its store in here so handlers and the policy
   * always see the live value. Pass `undefined` to detach.
   */
  setContextSource(getContext: (() => AppContext | undefined) | undefined): void;

  /** Number of registered actions. */
  readonly size: number;

  /** Removes every action. */
  clear(): void;
}

function assertValidDefinition(definition: GuideActionDefinition): void {
  const { name, description, schema, execute } = definition;

  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new ActionRegistrationError('An action needs a non-empty `name`.');
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    throw new ActionRegistrationError(
      `Action "${name}" needs a non-empty \`description\`. It is the only documentation a model gets.`,
    );
  }
  if (schema == null || typeof schema.safeParse !== 'function') {
    throw new ActionRegistrationError(
      `Action "${name}" needs a Zod \`schema\`. Use \`z.object({})\` for an action that takes no input.`,
    );
  }
  if (typeof execute !== 'function') {
    throw new ActionRegistrationError(`Action "${name}" needs an \`execute\` function.`);
  }
}

function toDescriptor(action: StoredAction): GuideActionDescriptor {
  const descriptor: GuideActionDescriptor = {
    name: action.name,
    title: action.title,
    description: action.description,
    risk: action.risk,
  };
  if (action.metadata) descriptor.metadata = action.metadata;
  return descriptor;
}

/**
 * Creates an action registry.
 *
 * @example
 * ```ts
 * const actions = createActionRegistry();
 *
 * actions.register({
 *   name: 'navigate',
 *   description: 'Navigate to an application route',
 *   risk: 'safe',
 *   schema: z.object({ route: z.string() }),
 *   execute: async ({ route }) => {
 *     router.push(route);
 *   },
 * });
 *
 * const result = await actions.execute({ action: 'navigate', input: { route: '/clients' } });
 * if (!result.ok) console.error(result.error.code, result.error.message);
 * ```
 */
export function createActionRegistry(options: ActionRegistryOptions = {}): ActionRegistry {
  const actions = new Map<string, StoredAction>();
  const policy = options.policy ?? defaultActionPolicy;

  let getContext = options.getContext;

  let requestCounter = 0;
  const createRequestId = options.createRequestId ?? (() => `req_${++requestCounter}`);

  function register<TSchema extends GuideActionSchema, TOutput>(
    definition: GuideActionDefinition<TSchema, TOutput>,
    registerOptions: RegisterOptions = {},
  ): () => void {
    // The generic definition is checked structurally; widening it for storage
    // is what makes a single Map able to hold differently-typed actions.
    const candidate = definition as unknown as GuideActionDefinition;
    assertValidDefinition(candidate);

    const { name } = candidate;
    if (actions.has(name) && !registerOptions.replace) {
      throw new ActionRegistrationError(
        `An action named "${name}" is already registered. Pass { replace: true } if that is intended.`,
      );
    }

    const stored: StoredAction = {
      ...candidate,
      title: candidate.title ?? name,
      risk: candidate.risk ?? 'safe',
    };
    actions.set(name, stored);

    return () => {
      // Only remove it if it is still the same registration — a later
      // `replace: true` must not be undone by an earlier cleanup.
      if (actions.get(name) === stored) actions.delete(name);
    };
  }

  function fail(
    request: GuideActionRequest,
    requestId: string,
    error: GuideActionError,
  ): GuideActionResult<never> {
    const result: GuideActionResult<never> = {
      ok: false,
      action: request.action,
      requestId,
      error,
    };
    options.onExecuted?.(result, request);
    return result;
  }

  async function execute<TData = unknown>(
    request: GuideActionRequest,
  ): Promise<GuideActionResult<TData>> {
    const requestId = request.requestId ?? createRequestId();
    const source: GuideActionSource = request.source ?? 'user';

    try {
      const action = actions.get(request.action);
      if (!action) {
        const known = [...actions.keys()].sort().join(', ') || 'none';
        return fail(
          request,
          requestId,
          actionError(
            'unknown_action',
            `No action named "${request.action}" is registered. Known actions: ${known}.`,
          ),
        );
      }

      if (request.signal?.aborted) {
        return fail(request, requestId, actionError('cancelled', 'The request was cancelled.'));
      }

      const context = getContext?.();

      const refusal = await policy({
        action,
        source,
        requestId,
        ...(context !== undefined ? { context } : {}),
        ...(request.reason !== undefined ? { reason: request.reason } : {}),
      });
      if (refusal) return fail(request, requestId, refusal);

      const parsed = action.schema.safeParse(request.input);
      if (!parsed.success) {
        return fail(
          request,
          requestId,
          actionError('invalid_input', `Invalid input for "${action.name}".`, {
            issues: toGuideActionIssues(parsed.error.issues),
          }),
        );
      }

      const executionContext: GuideActionExecutionContext = {
        requestId,
        source,
        ...(context !== undefined ? { context } : {}),
        ...(request.signal !== undefined ? { signal: request.signal } : {}),
      };

      const data = (await action.execute(parsed.data, executionContext)) as TData;

      const result: GuideActionResult<TData> = {
        ok: true,
        action: action.name,
        requestId,
        data,
      };
      options.onExecuted?.(result, request);
      return result;
    } catch (thrown) {
      // A handler may throw anything. Nothing escapes this boundary: callers of
      // `execute` are often not in a position to catch.
      if (isAbortError(thrown) || request.signal?.aborted) {
        return fail(
          request,
          requestId,
          actionError('cancelled', 'The action was cancelled.', { cause: thrown }),
        );
      }
      return fail(
        request,
        requestId,
        actionError('execution_failed', describeThrown(thrown), { cause: thrown }),
      );
    }
  }

  const registry: ActionRegistry = {
    register,
    unregister: (name) => actions.delete(name),
    has: (name) => actions.has(name),
    get: (name) => actions.get(name),
    list(listOptions = {}) {
      const visibleTo = listOptions.visibleTo;
      const riskFilter = listOptions.risk;

      return [...actions.values()]
        .filter((action) => {
          // `restricted` actions are invisible to agents by construction. An
          // action a model cannot see is one it cannot be tricked into naming.
          if (visibleTo === 'agent' && action.risk === 'restricted') return false;
          if (riskFilter && !riskFilter.includes(action.risk)) return false;
          return true;
        })
        .map(toDescriptor)
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    },
    execute,
    setContextSource(next) {
      getContext = next;
    },
    get size() {
      return actions.size;
    },
    clear: () => actions.clear(),
  };

  for (const definition of options.actions ?? []) registry.register(definition);

  return registry;
}
