/**
 * The gate between an action's declared risk and its execution.
 *
 * Statewave Guide separates *guidance* from *consequence*. Pointing at a button
 * is safe under every circumstance; pressing it is not. The policy is where
 * that distinction is enforced, and it is a replaceable function rather than
 * hard-coded logic so a host can express its own rules — role checks, per-user
 * permissions, an explicit confirmation token — without forking the runtime.
 *
 * Day 0 ships the default policy and the enforcement point. It does not ship a
 * confirmation UI; `confirm` actions requested by an agent are refused with
 * `confirmation_required` until a host supplies a policy that can obtain that
 * confirmation.
 *
 * @packageDocumentation
 */

import type {
  AppContext,
  GuideActionError,
  GuideActionSource,
  RegisteredGuideAction,
} from '@statewavedev/guide-shared';
import { actionError } from './errors.js';

/** What the policy is asked to rule on. */
export interface ActionPolicyInput {
  /** The action being requested, including its declared risk. */
  action: RegisteredGuideAction;
  /** Who is asking. */
  source: GuideActionSource;
  /** The application context at the time of the request, if the host set one. */
  context?: AppContext;
  /** The requester's stated reason, when one was given. */
  reason?: string;
  /** Identifier of this execution. */
  requestId: string;
}

/**
 * A policy decision.
 *
 * Returning `undefined` allows the action. Returning a {@link GuideActionError}
 * refuses it, and that error is handed back to the caller unchanged.
 */
export type ActionPolicyDecision = GuideActionError | undefined;

/** Decides whether a requested action may run. May be async. */
export type ActionPolicy = (
  input: ActionPolicyInput,
) => ActionPolicyDecision | Promise<ActionPolicyDecision>;

/**
 * The default risk policy.
 *
 * - `safe` — always allowed. This is the entire guidance vocabulary.
 * - `confirm` — allowed for `user` and `system` callers, who are already acting
 *   deliberately. Refused for `agent` with `confirmation_required`, because
 *   nothing has asked the human yet.
 * - `restricted` — refused for `agent` with `not_permitted`. These actions exist
 *   for host code that calls the registry directly and are never part of the
 *   vocabulary a model sees.
 */
export const defaultActionPolicy: ActionPolicy = ({ action, source }) => {
  if (action.risk === 'safe') return undefined;

  if (source !== 'agent') return undefined;

  if (action.risk === 'confirm') {
    return actionError(
      'confirmation_required',
      `"${action.name}" changes application state and needs to be confirmed by a person before an agent can run it.`,
    );
  }

  return actionError(
    'not_permitted',
    `"${action.name}" is restricted and cannot be run by an agent.`,
  );
};
