/**
 * `@statewavedev/guide-react`
 *
 * React bindings and the built-in guidance engine.
 *
 * This package is where the whole architecture becomes visible:
 *
 * ```text
 * source code (data-guide="clients.create")
 *   -> Product Model (indexer)
 *   -> guide runtime (semantic id)
 *   -> live DOM (the actual node)
 * ```
 *
 * The guidance engine is ours. There is no tour library underneath it, and no
 * positioning library either — a spotlight, a ring and a popover are a few
 * hundred lines of arithmetic, and owning them keeps the dependency list at
 * zero and the semantics honest.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** The provider every hook in this package needs above it. */
export { StatewaveGuideProvider } from './provider.js';
export type {
  StatewaveGuideProviderProps,
  NavigateHandler,
  OpenHandler,
  StartGuideHandler,
} from './provider.js';

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

/** Declarative registration: wraps one child and marks it with a semantic id. */
export { GuideElement } from './guide-element.js';
export type { GuideElementProps } from './guide-element.js';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** The main hook: elements, the active highlight, and the action surface. */
export { useGuide } from './use-guide.js';
export type { UseGuideResult } from './use-guide.js';

/** Reads and writes the runtime's application context. */
export { useGuideContext } from './use-guide-context.js';
export type { UseGuideContextResult } from './use-guide-context.js';

/** Reads and drives the action registry. */
export { useGuideActions } from './use-guide-actions.js';
export type { UseGuideActionsResult } from './use-guide-actions.js';

/** Registers a single DOM node under a semantic id. */
export { useGuideElement } from './use-guide-element.js';

// ---------------------------------------------------------------------------
// Engine — usable without React, for hosts that want their own wiring
// ---------------------------------------------------------------------------

/**
 * Creates a live element registry.
 *
 * Note what is *not* exported alongside it: `InternalElementRegistry`, the
 * interface that adds `resolveNode(id): HTMLElement | null`. Raw DOM access
 * deliberately stops at this boundary.
 *
 * Concretely: the React context stores the registry as {@link GuideElementRegistry},
 * so no hook and no component can reach a node; every action takes a semantic
 * id validated by `guideElementIdSchema`, so no selector can reach a query; and
 * the highlight engine is the only code in the package that ever holds an
 * `HTMLElement`. The engine needs a registry that can resolve one, which is why
 * this factory still returns one — but that capability is reachable only by
 * host code that already has `document`, never by an agent.
 */
export { createElementRegistry } from './element-registry.js';
export type {
  RegisteredElement,
  RegisterElementInput,
  GuideElementRegistry,
  ElementRegistryOptions,
} from './element-registry.js';

/** Creates the built-in spotlight engine over a registry. */
export { createHighlightController } from './highlight/controller.js';
export type {
  HighlightController,
  HighlightControllerOptions,
  HighlightOptions,
  HighlightFailureReason,
  HighlightResult,
  ScrollResult,
  ScrollToOptions,
} from './highlight/controller.js';

/** Builds the built-in guidance actions over a highlight controller. */
export { createGuidanceActions } from './guidance-actions.js';
export type { GuidanceActionHandlers, GuidanceActionDeps } from './guidance-actions.js';
