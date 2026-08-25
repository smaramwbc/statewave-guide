/**
 * `useGuideContext()` — reads and writes the application context.
 *
 * The host owns the context; this is the React-shaped way to push route
 * changes, permissions and the selected entity into the runtime, and to read
 * back what the runtime currently believes.
 *
 * @packageDocumentation
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { AppContext, AppContextPatch } from '@statewavedev/guide-shared';
import { useGuideInternals } from './internal-context.js';

/** What {@link useGuideContext} returns. */
export interface UseGuideContextResult {
  /** The current application context. Re-renders consumers when it changes. */
  context: AppContext;
  /** Replaces the context wholesale. Throws on a malformed value. */
  setContext(next: AppContext): AppContext;
  /** Merges a partial update. `null` clears a field, `undefined` leaves it alone. */
  patchContext(patch: AppContextPatch): AppContext;
}

/**
 * Subscribes to the runtime's application context.
 *
 * @throws if used outside `<StatewaveGuideProvider>`.
 */
export function useGuideContext(): UseGuideContextResult {
  const { runtime } = useGuideInternals('useGuideContext()');

  const subscribe = useCallback(
    (onStoreChange: () => void) => runtime.subscribeToContext(onStoreChange),
    [runtime],
  );
  // The context store keeps the same object identity until something commits,
  // so this is a safe `useSyncExternalStore` snapshot on both client and server.
  const getSnapshot = useCallback(() => runtime.getContext(), [runtime]);
  const context = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setContext = useCallback((next: AppContext) => runtime.setContext(next), [runtime]);
  const patchContext = useCallback(
    (patch: AppContextPatch) => runtime.patchContext(patch),
    [runtime],
  );

  return { context, setContext, patchContext };
}
