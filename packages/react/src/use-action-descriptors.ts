/**
 * Shared plumbing for reading the action registry from React.
 *
 * The registry has no subscription API — it is a plain map owned by the host —
 * so this is a `useState` refreshed at three honest moments: on mount, when the
 * provider reports that it (un)registered the guidance actions, and after an
 * execution. A host that registers an action from somewhere else entirely will
 * not be observed until one of those happens; that staleness is real and is
 * documented on `useGuideActions`.
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useState } from 'react';
import type { GuideActionDescriptor } from '@statewavedev/guide-shared';
import type { GuideRuntime } from '@statewavedev/guide-core';

function sameDescriptors(
  a: readonly GuideActionDescriptor[],
  b: readonly GuideActionDescriptor[],
): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, index) => {
    const right = b[index];
    return (
      right !== undefined &&
      left.name === right.name &&
      left.title === right.title &&
      left.description === right.description &&
      left.risk === right.risk
    );
  });
}

/** @internal Returns the current descriptors and a way to re-read them. */
export function useActionDescriptors(
  runtime: GuideRuntime,
  version: number,
): readonly [GuideActionDescriptor[], () => void] {
  const [actions, setActions] = useState<GuideActionDescriptor[]>(() =>
    runtime.getAvailableActions(),
  );

  const refresh = useCallback(() => {
    setActions((previous) => {
      const next = runtime.getAvailableActions();
      // Keeping the previous array when nothing changed stops a refresh from
      // re-rendering every consumer for no reason.
      return sameDescriptors(previous, next) ? previous : next;
    });
  }, [runtime]);

  useEffect(() => {
    refresh();
  }, [refresh, version]);

  return [actions, refresh] as const;
}
