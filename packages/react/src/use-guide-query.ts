/**
 * Asking the guide a question, from a component.
 *
 * The hook is deliberately thin. It builds a {@link GuideQueryContext} out of
 * what the element registry already knows — the route, what is mounted, what is
 * visible — hands it to the engine, and gives back the response plus a way to
 * run the actions in it.
 *
 * It does not interpret. A component that decided which feature a question was
 * about, or rewrote a sentence to read better, would be a second place where
 * product truth is settled, and the whole point of the contract is that there is
 * exactly one.
 *
 * @packageDocumentation
 */

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import type {
  GuideQueryContext,
  GuideQueryEngine,
  GuideQueryRequest,
  GuideQueryResponse,
  GuideSafeAction,
} from '@statewavedev/guide-core';
import { classifyRuntimeText } from '@statewavedev/guide-core';
import type { GuideElementRegistry } from './element-registry.js';
import { internalsOf } from './registry-internals.js';
import type { HighlightController } from './highlight/controller.js';

/**
 * Resolves a semantic id, waiting a bounded time for it to appear.
 *
 * Polls the registry's own resolution — no selector, no observer over the whole
 * document, and no fixed sleep standing in for a condition. Returns nothing when
 * the time is up, which is a real answer a UI can show.
 */
async function waitForTarget(
  registry: GuideElementRegistry,
  id: string,
  timeoutMs: number,
): Promise<HTMLElement | undefined> {
  const internals = internalsOf(registry);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const node = internals.resolveNode(id);
    if (node !== undefined && node !== null) return node;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Why a safe action did not happen. */
export type SafeActionOutcome =
  | { status: 'done'; action: GuideSafeAction }
  | { status: 'target_not_available'; action: GuideSafeAction; detail: string }
  | { status: 'unsupported'; action: GuideSafeAction; detail: string };

/** What {@link useGuideQuery} needs. */
export interface UseGuideQueryOptions {
  engine: GuideQueryEngine;
  registry: GuideElementRegistry;
  highlight?: HighlightController;
  /** The route the application believes it is on. */
  route?: string;
  /** The build this UI is running, matched against the bundle's. */
  applicationVersion?: string;
  /**
   * Permissions the signed-in user holds, from the host's auth layer.
   *
   * Passing this is a claim that the list is complete — see
   * {@link GuideQueryContext.permissions}. Leaving it out is the safe default
   * and costs only the personalised phrasing of a condition.
   */
  permissions?: readonly string[];
  focusedSemanticId?: string;
  selectedSemanticId?: string;
  /** Where navigation actually happens. Absent means navigation is unavailable. */
  navigate?: (route: string) => void;
  /** How long to wait for a target to mount before giving up. Default 2000ms. */
  targetTimeoutMs?: number;
  /**
   * The instance the user picked, for this interaction only.
   *
   * Held by the UI while the conversation is open. Nothing writes it down.
   */
  selectedInstanceRef?: string;
}

/** What the hook returns. */
export interface UseGuideQueryResult {
  ask(query: string, options?: { developer?: boolean }): GuideQueryResponse;
  context: GuideQueryContext;
  execute(action: GuideSafeAction): Promise<SafeActionOutcome>;
}

/**
 * The query contract, wired to a running React tree.
 */
export function useGuideQuery(options: UseGuideQueryOptions): UseGuideQueryResult {
  const registry = options.registry;
  const elements = useSyncExternalStore(
    useCallback((listener: () => void) => registry.subscribe(listener), [registry]),
    useCallback(() => registry.getSnapshot(), [registry]),
    useCallback(() => registry.getSnapshot(), [registry]),
  );

  // NUL is not a permission identifier, so joining on it cannot make two
  // different lists look the same.
  const permissionKey =
    options.permissions === undefined ? undefined : options.permissions.join('\u0000');

  /**
   * The application as it is *now*.
   *
   * Read at the moment a question is asked, never cached. Memoising it on the
   * registry snapshot looked equivalent and was not: a host that registers
   * nothing has a snapshot that never changes, so the memo computed once during
   * the first render — against an empty document — and every later question was
   * answered as though the screen were blank. That is how an ambiguous question
   * came back unsupported.
   *
   * A context is a description of a moment. Caching one is caching the past.
   */
  const readContext = useCallback((): GuideQueryContext => {
    // Everything the host actually exposes, not only what a component
    // registered. The benchmark application marks its markup with `data-guide`
    // and registers nothing, so the narrower question returned an empty screen
    // and the query contract could not tell an ambiguous question from an
    // unsupported one. `elements` is read so this recomputes when the registry
    // changes; the answer comes from the registry's own resolution.
    const { visible, disabled } = registry.presentIds();
    const instances = registry.presentInstances();
    // Geometry, so an answer can say where a thing is. Purely additive: an
    // engine given no boxes returns the same answer without the location.
    const geometry = registry.presentGeometry();
    const elementBoxes: Record<string, { x: number; y: number; width: number; height: number }> =
      {};
    const elementContainers: Record<string, string[]> = {};
    const elementRoles: Record<string, string> = {};
    const occludedSemanticIds: string[] = [];
    for (const [id, entry] of Object.entries(geometry)) {
      elementBoxes[id] = entry.box;
      elementContainers[id] = entry.containers;
      elementRoles[id] = entry.role;
      if (entry.occludedByGuide) occludedSemanticIds.push(id);
    }

    // Words the interface is showing, scoped to this route and this snapshot.
    // The scoping is not decoration: it is what makes them expire.
    const snapshotId = `snap-${options.route ?? ''}-${elements.length}`;
    const runtimeVisibleLanguage = registry.presentVisibleLanguage().map((entry) => ({
      ...entry,
      route: options.route ?? '',
      snapshotId,
      privacyClass: classifyRuntimeText(entry.text),
    }));
    return {
      runtimeInstances: instances.map((instance) => ({
        ...instance,
        route: options.route ?? '',
      })),
      ...(options.selectedInstanceRef === undefined
        ? {}
        : { selectedInstanceRef: options.selectedInstanceRef }),
      ...(options.route === undefined ? {} : { route: options.route }),
      ...(options.applicationVersion === undefined
        ? {}
        : { applicationVersion: options.applicationVersion }),
      ...(options.focusedSemanticId === undefined
        ? {}
        : { focusedSemanticId: options.focusedSemanticId }),
      ...(options.selectedSemanticId === undefined
        ? {}
        : { selectedSemanticId: options.selectedSemanticId }),
      ...(options.permissions === undefined ? {} : { permissions: options.permissions }),
      visibleSemanticIds: visible,
      disabledSemanticIds: disabled,
      elementBoxes,
      elementContainers,
      elementRoles,
      occludedSemanticIds,
      runtimeVisibleLanguage,
      snapshotId,
    };
  }, [
    registry,
    options.route,
    options.applicationVersion,
    options.focusedSemanticId,
    options.selectedSemanticId,
    options.selectedInstanceRef,
    // A host rebuilds its permission array every render, and an array in this
    // list would make the memo below recompute forever. The contents are what
    // matter, so the contents are what this depends on.
    permissionKey,
  ]);

  // Recomputed for display whenever the registry changes, so a component showing
  // the current context stays live. The value handed to a query is always read
  // fresh by `ask` rather than taken from here.
  const context = useMemo(() => readContext(), [readContext, elements]);

  const ask = useCallback(
    (query: string, askOptions: { developer?: boolean } = {}): GuideQueryResponse => {
      const request: GuideQueryRequest = {
        query,
        context: readContext(),
        ...(askOptions.developer === true ? { developer: true } : {}),
      };
      return options.engine.query(request);
    },
    [readContext, options.engine],
  );

  /**
   * Runs one safe action.
   *
   * A semantic id resolves through the registry or it does not resolve at all.
   * There is no `querySelector` fallback: guessing at a target is how a guide
   * ends up pointing confidently at the wrong thing, and an honest
   * `target_not_available` is something a UI can actually handle.
   */
  const execute = useCallback(
    async (action: GuideSafeAction): Promise<SafeActionOutcome> => {
      if (action.kind === 'navigate') {
        if (options.navigate === undefined) {
          return { status: 'unsupported', action, detail: 'This host provides no navigator.' };
        }
        options.navigate(action.route);
        return { status: 'done', action };
      }
      if (action.kind === 'open_guide_step') return { status: 'done', action };

      const id = action.semanticId;
      // Availability means "can a node be resolved for this id right now", which
      // `resolveNode` answers and `has` does not: `has` knows only elements a
      // component registered explicitly, while a host that marks its markup with
      // `data-guide` — which is how the benchmark application is written, and
      // how most hosts will adopt this — registers nothing. Asking the wrong
      // question made every Show me stop at its first action.
      //
      // The wait exists because a sequence that navigates cannot point at
      // anything until the new screen has mounted. Waiting *for the target*
      // rather than for a fixed delay is the difference between a sequence that
      // works and one that works on a fast machine: the first `Show me` that
      // crossed a route change gave up before React had committed, and reported
      // an honest `target_not_available` about a control that was about to
      // exist.
      const instanceRef = 'instanceRef' in action ? action.instanceRef : undefined;
      const node =
        instanceRef === undefined
          ? await waitForTarget(registry, id, options.targetTimeoutMs ?? 2000)
          : internalsOf(registry).resolveInstanceNode(id, instanceRef);
      if (node === undefined) {
        return {
          status: 'target_not_available',
          action,
          detail: `Nothing is on screen under "${id}" right now.`,
        };
      }
      const pick = instanceRef === undefined ? {} : { instanceRef };
      if (action.kind === 'scroll') {
        await options.highlight?.scrollTo(id, pick);
        return { status: 'done', action };
      }
      if (action.kind === 'highlight') {
        // The callout text comes from the action, never from here. A renderer
        // that invented its own heading would be asserting something about the
        // product, which is the query contract's job and not this hook's.
        await options.highlight?.highlight(id, {
          ...pick,
          ...(action.title === undefined ? {} : { title: action.title }),
          ...(action.message === undefined ? {} : { message: action.message }),
        });
        return { status: 'done', action };
      }
      // Focus needs a node, and the public registry deliberately has no way to
      // hand one out — every field on `GuideElementState` is a primitive so that
      // nothing holding a registry can reach into the page. The node comes
      // through the same package-private friend table the highlight controller
      // uses, which is the one sanctioned route and is still a *resolution* of a
      // known semantic id rather than a search for something.
      node.focus();
      return { status: 'done', action };
    },
    [registry, options.highlight, options.navigate],
  );

  return { ask, context, execute };
}
