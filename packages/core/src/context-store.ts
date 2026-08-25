/**
 * The application context, and who is allowed to change it.
 *
 * The host owns the context. It pushes route changes, permissions and the
 * selected entity in; the runtime and the action handlers only ever read it.
 * Nothing an agent sends can modify it, which is what makes the context
 * trustworthy enough to gate guidance on.
 *
 * @packageDocumentation
 */

import type { AppContext, AppContextPatch } from '@statewavedev/guide-shared';
import { appContextSchema } from '@statewavedev/guide-shared';

/** Notified whenever the context changes. */
export type ContextListener = (context: AppContext) => void;

/** A validated, observable {@link AppContext}. */
export interface ContextStore {
  /** The current context. Always a new object; never mutate it. */
  get(): AppContext;
  /**
   * Replaces the context wholesale.
   *
   * @throws if the value does not satisfy `appContextSchema`. Unknown top-level
   * keys are stripped — put host-specific data under `metadata`.
   */
  set(next: AppContext): AppContext;
  /**
   * Merges a partial update.
   *
   * `undefined` leaves a field untouched; `null` clears it. That distinction is
   * what lets a router report only a route change without erasing the
   * permissions the auth layer reported a moment earlier.
   */
  patch(patch: AppContextPatch): AppContext;
  /** Subscribes to changes. Returns an unsubscribe function. */
  subscribe(listener: ContextListener): () => void;
}

/** Creates a {@link ContextStore}. */
export function createContextStore(initial: AppContext = {}): ContextStore {
  let context: AppContext = appContextSchema.parse(initial);
  const listeners = new Set<ContextListener>();

  function commit(next: AppContext): AppContext {
    context = next;
    // Copy first: a listener that unsubscribes during notification must not
    // shift the set out from under the iteration.
    for (const listener of [...listeners]) listener(context);
    return context;
  }

  return {
    get: () => context,

    set(next) {
      return commit(appContextSchema.parse(next));
    },

    patch(patch) {
      const merged: Record<string, unknown> = { ...context };
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      return commit(appContextSchema.parse(merged));
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
