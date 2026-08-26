/**
 * The single React context every hook in this package reads.
 *
 * It carries the runtime, the live element registry, the highlight controller
 * and the warning sink. The registry on here is the object
 * `createElementRegistry()` returned, and that object has no node access at
 * all — not hidden by a type, absent. Registration and node attachment live in
 * the friend table in `./registry-internals.js`, which `useGuideElement` and
 * the provider reach and a host component cannot. Raw DOM access stops at the
 * highlight engine.
 *
 * @packageDocumentation
 */

import { createContext, useContext } from 'react';
import type { GuideRuntime } from '@statewavedev/guide-core';
import type { GuideElementRegistry } from './element-registry.js';
import type { HighlightController } from './highlight/controller.js';

/** What `<StatewaveGuideProvider>` puts on the context. */
export interface GuideContextValue {
  /** The guide runtime: context, actions, knowledge, memory. */
  runtime: GuideRuntime;
  /** The live registry of mounted guide elements. Read-only, and DOM-free. */
  registry: GuideElementRegistry;
  /** The built-in guidance engine. */
  highlight: HighlightController;
  /** Where development warnings go. Stable across renders. */
  onWarning: (message: string) => void;
  /**
   * Bumped whenever the provider registers or unregisters the built-in
   * guidance actions. The action registry has no change notification of its
   * own, so this is what lets `useGuideActions()` re-read a list that was
   * populated by an effect running *after* the consumer's own effect.
   */
  actionsVersion: number;
}

/** @internal */
export const GuideReactContext = createContext<GuideContextValue | null>(null);
GuideReactContext.displayName = 'StatewaveGuideContext';

/**
 * Reads the context, or explains what the caller forgot.
 *
 * @param label how the caller should be named in the error, e.g. `useGuide()`.
 * @internal
 */
export function useGuideInternals(label: string): GuideContextValue {
  const value = useContext(GuideReactContext);
  if (value === null) {
    throw new Error(
      `${label} must be used inside <StatewaveGuideProvider>. ` +
        `Wrap your application — or at least the subtree that uses Statewave Guide — in ` +
        `<StatewaveGuideProvider> and try again.`,
    );
  }
  return value;
}
