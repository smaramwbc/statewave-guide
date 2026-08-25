/**
 * `useGuideActions()` — the action vocabulary, from React.
 *
 * @packageDocumentation
 */

import { useCallback } from 'react';
import type {
  GuideActionDefinition,
  GuideActionDescriptor,
  GuideActionName,
  GuideActionRequest,
  GuideActionResult,
  GuideActionSchema,
} from '@statewavedev/guide-shared';
import type { RegisterOptions } from '@statewavedev/guide-actions';
import { useGuideInternals } from './internal-context.js';
import { useActionDescriptors } from './use-action-descriptors.js';

/** What {@link useGuideActions} returns. */
export interface UseGuideActionsResult {
  /**
   * Inert descriptions of the registered actions, sorted by name.
   *
   * Re-read on mount, whenever the provider (un)registers the built-in
   * guidance actions, and after every `execute` / `register` call. The action
   * registry publishes no change events of its own, so an action registered by
   * host code elsewhere is not observed until one of those moments — a known
   * Day-0 limitation, not an accident.
   */
  actions: GuideActionDescriptor[];
  /** Validates and runs an action. Never throws; failures come back as data. */
  execute(request: GuideActionRequest): Promise<GuideActionResult>;
  /** Registers a host action. Returns a disposer. */
  register<TSchema extends GuideActionSchema, TOutput>(
    definition: GuideActionDefinition<TSchema, TOutput>,
    options?: RegisterOptions,
  ): () => void;
  /** Whether an action is registered under this name. */
  has(name: GuideActionName): boolean;
}

/**
 * Reads and drives the action registry.
 *
 * @throws if used outside `<StatewaveGuideProvider>`.
 */
export function useGuideActions(): UseGuideActionsResult {
  const { runtime, actionsVersion } = useGuideInternals('useGuideActions()');
  const [actions, refresh] = useActionDescriptors(runtime, actionsVersion);

  const execute = useCallback(
    async (request: GuideActionRequest): Promise<GuideActionResult> => {
      const result = await runtime.executeAction(request);
      refresh();
      return result;
    },
    [runtime, refresh],
  );

  const register = useCallback(
    <TSchema extends GuideActionSchema, TOutput>(
      definition: GuideActionDefinition<TSchema, TOutput>,
      options?: RegisterOptions,
    ): (() => void) => {
      const dispose = runtime.actions.register(definition, options);
      refresh();
      return () => {
        dispose();
        refresh();
      };
    },
    [runtime, refresh],
  );

  const has = useCallback((name: GuideActionName) => runtime.actions.has(name), [runtime]);

  return { actions, execute, register, has };
}
