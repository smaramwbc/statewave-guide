/**
 * Running a "Show me" sequence.
 *
 * The sequence is whatever the query contract returned, in the order it
 * returned it, executed through the safe-action executor. This hook decides
 * nothing about *what* to point at — it decides when to stop.
 *
 * It stops on the first target that is not mounted. Navigating and then
 * highlighting nothing would leave a user on a different screen with no
 * explanation, so an unavailable target ends the sequence and says so.
 *
 * @packageDocumentation
 */

import { useCallback, useRef, useState } from 'react';
import type { GuideSafeAction } from '@statewavedev/guide-core';
import type { SafeActionOutcome } from '../use-guide-query.js';

/** Where a sequence got to. */
export interface ShowMeState {
  running: boolean;
  /** Index of the action being run, or -1. */
  index: number;
  outcomes: readonly SafeActionOutcome[];
  /** Set when the sequence stopped early. */
  stoppedBecause?: 'TARGET_NOT_AVAILABLE' | 'UNSUPPORTED';
}

const idle: ShowMeState = { running: false, index: -1, outcomes: [] };

/** What {@link useShowMe} needs. */
export interface UseShowMeOptions {
  execute(action: GuideSafeAction): Promise<SafeActionOutcome>;
  /**
   * How long to wait after a navigation before looking for the next target.
   *
   * A navigation unmounts one screen and mounts another, and the element the
   * next action wants does not exist until React has committed. Waiting on the
   * registry rather than a fixed delay is the better answer and needs a
   * subscription this hook does not own; the delay is bounded and the failure
   * mode is a clean `TARGET_NOT_AVAILABLE` rather than a wrong target.
   */
  settleMs?: number;
}

/** Runs a returned action sequence, and stops honestly when it cannot continue. */
export function useShowMe(options: UseShowMeOptions): {
  state: ShowMeState;
  run(actions: readonly GuideSafeAction[]): Promise<ShowMeState>;
  reset(): void;
} {
  const [state, setState] = useState<ShowMeState>(idle);
  const running = useRef(false);

  const run = useCallback(
    async (actions: readonly GuideSafeAction[]): Promise<ShowMeState> => {
      if (running.current) return state;
      running.current = true;
      const outcomes: SafeActionOutcome[] = [];
      let stopped: ShowMeState['stoppedBecause'];

      for (const [index, action] of actions.entries()) {
        setState({ running: true, index, outcomes: [...outcomes] });
        const outcome = await options.execute(action);
        outcomes.push(outcome);
        if (outcome.status === 'target_not_available') {
          stopped = 'TARGET_NOT_AVAILABLE';
          break;
        }
        if (outcome.status === 'unsupported') {
          stopped = 'UNSUPPORTED';
          break;
        }
        if (action.kind === 'navigate') {
          await new Promise((resolve) => setTimeout(resolve, options.settleMs ?? 0));
        }
      }

      const final: ShowMeState = {
        running: false,
        index: -1,
        outcomes,
        ...(stopped === undefined ? {} : { stoppedBecause: stopped }),
      };
      running.current = false;
      setState(final);
      return final;
    },
    [options, state],
  );

  const reset = useCallback(() => setState(idle), []);
  return { state, run, reset };
}
