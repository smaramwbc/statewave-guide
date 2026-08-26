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
 * What comes back is read-only state: `has`, `get`, `list`, `visibleIds`,
 * `subscribe`, `getSnapshot`. There is no way to reach a DOM node through it,
 * and no mutator either — not merely absent from this module's types, absent
 * from the object. Registration, node attachment and DOM resolution live in a
 * module-private `WeakMap` keyed by the registry, in a file this package does
 * not export, so the capability cannot be reached by a host, by a hook, or by
 * an agent — only by code inside `@statewavedev/guide-react`, and only from
 * inside a closure: nothing in this package memoises the lookup into React
 * state, because a fiber is reachable from the DOM node it rendered.
 *
 * That is what makes the rest of the design hold: every action takes a semantic
 * id validated by `guideElementIdSchema`, so no selector reaches a query; and
 * the highlight engine is the only code in the package that ever holds an
 * `HTMLElement`.
 */
export { createElementRegistry } from './element-registry.js';
export type {
  GuideElementState,
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
  HighlightResult,
  ScrollResult,
  TargetResult,
  ScrollToOptions,
} from './highlight/controller.js';

/** Builds the built-in guidance actions over a highlight controller. */
export { createGuidanceActions } from './guidance-actions.js';
export type { GuidanceActionHandlers, GuidanceActionDeps } from './guidance-actions.js';
