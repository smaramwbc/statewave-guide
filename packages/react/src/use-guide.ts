/**
 * `useGuide()` — the main hook.
 *
 * Everything it returns is either a primitive, a plain descriptor, or a
 * function that takes a semantic id. There is no node, and no way to get one.
 *
 * @packageDocumentation
 */

import { useCallback, useSyncExternalStore } from 'react';
import type {
  GuideActionDescriptor,
  GuideActionRequest,
  GuideActionResult,
} from '@statewavedev/guide-shared';
import type { GuideRuntime } from '@statewavedev/guide-core';
import type { GuideElementState } from './element-registry.js';
import type {
  HighlightOptions,
  HighlightResult,
  ScrollResult,
  ScrollToOptions,
} from './highlight/controller.js';
import { useGuideInternals } from './internal-context.js';
import { useActionDescriptors } from './use-action-descriptors.js';

/** What {@link useGuide} returns. */
export interface UseGuideResult {
  /** The guide runtime. */
  runtime: GuideRuntime;
  /** Every registered guide element, sorted by id. Re-renders on change. */
  elements: readonly GuideElementState[];
  /** The semantic id currently highlighted, or `null`. Re-renders on change. */
  activeHighlightId: string | null;
  /** Highlights an element by semantic id. Never throws. */
  highlightElement(id: string, options?: HighlightOptions): Promise<HighlightResult>;
  /** Removes the current highlight. Safe when nothing is highlighted. */
  clearHighlight(): void;
  /** Scrolls an element into view by semantic id. Never throws. */
  scrollToElement(id: string, options?: ScrollToOptions): Promise<ScrollResult>;
  /** Validates and runs an action. Never throws; failures come back as data. */
  executeAction(request: GuideActionRequest): Promise<GuideActionResult>;
  /** Inert descriptions of the actions registered right now. */
  availableActions: GuideActionDescriptor[];
}

/** The server snapshot: nothing is highlighted before hydration. */
const noActiveHighlight = (): string | null => null;

/**
 * Reads the guide from React.
 *
 * @throws if used outside `<StatewaveGuideProvider>`.
 */
export function useGuide(): UseGuideResult {
  const { runtime, registry, highlight, actionsVersion } = useGuideInternals('useGuide()');

  // `registry.getSnapshot` caches its array, so this is stable between changes.
  // A fresh array on every read would loop `useSyncExternalStore` forever.
  const elements = useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  );

  const subscribeToHighlight = useCallback(
    (onStoreChange: () => void) => highlight.subscribe(onStoreChange),
    [highlight],
  );
  const getActiveHighlightId = useCallback(() => highlight.activeId, [highlight]);
  const activeHighlightId = useSyncExternalStore(
    subscribeToHighlight,
    getActiveHighlightId,
    noActiveHighlight,
  );

  const [availableActions, refreshActions] = useActionDescriptors(runtime, actionsVersion);

  const highlightElement = useCallback(
    (id: string, options?: HighlightOptions) => highlight.highlight(id, options),
    [highlight],
  );
  const clearHighlight = useCallback(() => {
    highlight.clear();
  }, [highlight]);
  const scrollToElement = useCallback(
    (id: string, options?: ScrollToOptions) => highlight.scrollTo(id, options),
    [highlight],
  );
  const executeAction = useCallback(
    async (request: GuideActionRequest): Promise<GuideActionResult> => {
      const result = await runtime.executeAction(request);
      refreshActions();
      return result;
    },
    [runtime, refreshActions],
  );

  return {
    runtime,
    elements,
    activeHighlightId,
    highlightElement,
    clearHighlight,
    scrollToElement,
    executeAction,
    availableActions,
  };
}
