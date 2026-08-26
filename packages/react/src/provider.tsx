/**
 * `<StatewaveGuideProvider>` — where the runtime, the live DOM and React meet.
 *
 * It owns three long-lived objects: the guide runtime, the element registry and
 * the highlight controller. All three are created once and survive every
 * re-render, and all three tolerate being destroyed and used again, which is
 * what makes React 19 StrictMode's deliberate double-mount a non-event.
 *
 * @packageDocumentation
 */

import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createGuideRuntime, type GuideRuntime } from '@statewavedev/guide-core';
import type { NavigateInput, OpenInput, StartGuideInput } from '@statewavedev/guide-shared';
import { createElementRegistry } from './element-registry.js';
import { internalsOf } from './registry-internals.js';
import { createHighlightController, type HighlightOptions } from './highlight/controller.js';
import { createGuidanceActions, type GuidanceActionHandlers } from './guidance-actions.js';
import { GuideReactContext, type GuideContextValue } from './internal-context.js';

/** Navigates the host application to a route. */
export type NavigateHandler = (input: NavigateInput) => void | Promise<void>;
/** Opens a menu, dialog or section in the host application. */
export type OpenHandler = (input: OpenInput) => void | Promise<void>;
/** Starts a host-defined multi-step guide. */
export type StartGuideHandler = (input: StartGuideInput) => void | Promise<void>;

/** Props for {@link StatewaveGuideProvider}. */
export interface StatewaveGuideProviderProps {
  children: ReactNode;
  /** An existing runtime. One is created if omitted. */
  runtime?: GuideRuntime;
  /** Host routing implementation. Registers the built-in `navigate` action when provided. */
  navigate?: NavigateHandler;
  /** Host "open this thing" implementation. Registers the built-in `open` action when provided. */
  open?: OpenHandler;
  /** Host walkthrough implementation. Registers the built-in `startGuide` action when provided. */
  startGuide?: StartGuideHandler;
  /** Register the built-in `highlight` and `scroll` actions. Default true. */
  registerGuidanceActions?: boolean;
  /** Defaults applied to every highlight. Read once, when the provider mounts. */
  highlightOptions?: Partial<HighlightOptions>;
  /** Keep `context.visibleElements` in sync with the registry. Default true. */
  trackVisibleElements?: boolean;
  /**
   * Where development warnings go.
   *
   * Defaults to a no-op: this package never writes to the console itself, so
   * nothing a host did not ask for ends up in its logs. Pass `console.warn`
   * during development to see them.
   */
  onWarning?: (message: string) => void;
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Provides the guide runtime, the element registry and the guidance engine to
 * everything beneath it.
 *
 * @example
 * ```tsx
 * <StatewaveGuideProvider navigate={({ route }) => router.push(route)}>
 *   <App />
 * </StatewaveGuideProvider>
 * ```
 */
export function StatewaveGuideProvider(props: StatewaveGuideProviderProps): ReactElement {
  const {
    children,
    runtime: providedRuntime,
    navigate,
    open,
    startGuide,
    registerGuidanceActions = true,
    highlightOptions,
    trackVisibleElements = true,
    onWarning,
  } = props;

  // Latest-value refs. Handlers and the warning sink change identity on most
  // renders; reading them through a ref is what stops the registry, the
  // controller and the registered actions from being torn down and rebuilt.
  const onWarningRef = useRef(onWarning);
  onWarningRef.current = onWarning;

  const handlersRef = useRef<GuidanceActionHandlers>({});
  handlersRef.current = { navigate, open, startGuide };

  const initialHighlightOptions = useRef(highlightOptions);

  // `useState` with a lazy initialiser, not `useMemo`: React is allowed to
  // throw a memo away and recompute it, and these objects own listeners,
  // observers and DOM. They must be created exactly once.
  const [engine] = useState(() => {
    const warn = (message: string): void => {
      onWarningRef.current?.(message);
    };
    const registry = createElementRegistry({ onWarning: warn });
    const highlight = createHighlightController({
      registry,
      onWarning: warn,
      defaults: initialHighlightOptions.current ?? {},
    });
    return { registry, highlight, warn };
  });

  const [ownRuntime] = useState<GuideRuntime>(() => providedRuntime ?? createGuideRuntime());
  const runtime = providedRuntime ?? ownRuntime;

  const [actionsVersion, setActionsVersion] = useState(0);

  // Only the *presence* of a handler is a dependency. Its identity is not, so
  // an inline arrow in the host's JSX does not re-register anything.
  const hasNavigate = navigate !== undefined;
  const hasOpen = open !== undefined;
  const hasStartGuide = startGuide !== undefined;

  useEffect(() => {
    const handlers: GuidanceActionHandlers = {};
    if (hasNavigate) handlers.navigate = (input) => handlersRef.current.navigate?.(input);
    if (hasOpen) handlers.open = (input) => handlersRef.current.open?.(input);
    if (hasStartGuide) handlers.startGuide = (input) => handlersRef.current.startGuide?.(input);

    const definitions = createGuidanceActions({ highlight: engine.highlight, handlers }).filter(
      (definition) =>
        registerGuidanceActions ||
        (definition.name !== 'highlight' && definition.name !== 'scroll'),
    );
    if (definitions.length === 0) return undefined;

    // `replace: true` because a StrictMode remount registers the same names
    // again, and because a provider remounting under a long-lived runtime is a
    // normal thing for a host to do.
    const disposers = definitions.map((definition) =>
      runtime.actions.register(definition, { replace: true }),
    );
    setActionsVersion((version) => version + 1);

    return () => {
      for (const dispose of disposers) dispose();
      setActionsVersion((version) => version + 1);
    };
  }, [runtime, engine, registerGuidanceActions, hasNavigate, hasOpen, hasStartGuide]);

  useEffect(() => {
    if (!trackVisibleElements) return undefined;

    const sync = (): void => {
      const next = engine.registry.visibleIds();
      // Compared against what the runtime actually holds, not against a cached
      // copy of what we last wrote: a host that replaces the context wholesale
      // drops `visibleElements`, and a cache would never notice — the prop
      // promises to keep the two in sync, so it has to read the live value.
      // Comparing before writing still matters, because `patchContext` notifies
      // subscribers and a write that fired on every notification would loop.
      if (sameIds(runtime.getContext().visibleElements ?? [], next)) return;
      runtime.patchContext({ visibleElements: next });
    };

    sync();
    // Two sources, one direction: the registry says what is on screen, and the
    // context is re-checked whenever the host changes it. The write is
    // idempotent, so the second subscription re-syncs at most once per change.
    const unsubscribeFromRegistry = engine.registry.subscribe(sync);
    const unsubscribeFromContext = runtime.subscribeToContext(sync);
    return () => {
      unsubscribeFromRegistry();
      unsubscribeFromContext();
    };
  }, [runtime, engine, trackVisibleElements]);

  useEffect(() => {
    return () => {
      // Both are re-usable after being destroyed, so a StrictMode remount — or
      // a host that moves the provider — recovers rather than breaking.
      engine.highlight.destroy();
      // Looked up here rather than parked in the `engine` object above, and the
      // rule is not stylistic. React keeps every hook's state on the fiber, and
      // links that fiber from the DOM node it rendered — so anything held in
      // `useState`/`useMemo`/`useRef` is reachable from the page through
      // `node.__reactFiber$…`. The friend table is not: a WeakMap lookup made
      // inside a closure leaves nothing behind for a walk of the fiber tree to
      // find, which is what keeps `resolveNode` unreachable from a host in fact
      // and not only in the types.
      internalsOf(engine.registry).destroy();
    };
  }, [engine]);

  const value = useMemo<GuideContextValue>(
    () => ({
      runtime,
      registry: engine.registry,
      highlight: engine.highlight,
      onWarning: engine.warn,
      actionsVersion,
    }),
    [runtime, engine, actionsVersion],
  );

  return <GuideReactContext.Provider value={value}>{children}</GuideReactContext.Provider>;
}
