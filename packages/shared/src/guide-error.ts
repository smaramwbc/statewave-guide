/**
 * One error vocabulary for the whole system.
 *
 * Every failure a caller can observe — from the action registry, from the
 * guidance engine, and later from the agent layer — is reported with a code from
 * {@link GuideErrorCode}. The codes exist so that a consumer, human or model,
 * can branch on *what went wrong* without parsing a message string. Messages are
 * for people; codes are the contract.
 *
 * @packageDocumentation
 */

/**
 * Why an operation failed.
 *
 * The `target_*` family is deliberately fine-grained. "The element does not
 * exist" and "the element exists but is not on screen right now" call for
 * completely different responses from a guide — the first is a stale Product
 * Model, the second is a navigation problem — and collapsing them into one code
 * would throw that distinction away.
 */
export type GuideErrorCode =
  /** No element is registered under that semantic id. */
  | 'target_not_found'
  /** The element is registered but no DOM node is currently attached. */
  | 'target_not_mounted'
  /** The element is mounted but not currently in the viewport. */
  | 'target_not_visible'
  /** The operation exceeded its time budget. */
  | 'timeout'
  /** The operation was cancelled before or during execution. */
  | 'cancelled'
  /** The input did not satisfy the operation's schema. */
  | 'invalid_input'
  /** No action is registered under that name. */
  | 'action_not_found'
  /** The caller is not allowed to run this action. */
  | 'permission_denied'
  /** The action requires human confirmation that has not been given. */
  | 'confirmation_required'
  /** The handler threw or rejected for a reason the runtime cannot classify. */
  | 'execution_failed';

/** A single schema validation problem. */
export interface GuideErrorIssue {
  /** Property path into the input, e.g. `['route']`. */
  path: (string | number)[];
  /** Human-readable description of the problem. */
  message: string;
}

/**
 * A structured failure. Never an exception once it reaches a caller.
 *
 * `message` is written for a person to read. Nothing should branch on it.
 */
export interface GuideError {
  /** Machine-readable reason. Branch on this. */
  code: GuideErrorCode;
  /** Human-readable explanation. Do not parse. */
  message: string;
  /** Present when `code` is `invalid_input`. */
  issues?: GuideErrorIssue[];
  /**
   * Code-specific structured context, e.g. `{ elementId: 'clients.create' }`.
   * Lets a caller act on the failure without re-deriving it from the message.
   */
  details?: Record<string, unknown>;
  /** The original thrown value, when there was one. */
  cause?: unknown;
}

/**
 * The outcome of an operation.
 *
 * A discriminated union on `success`, so a caller narrows with one check and the
 * compiler stops them reading `data` off a failure.
 */
export type GuideResult<TData = unknown> =
  { success: true; data: TData } | { success: false; error: GuideError };

/** Builds a {@link GuideError}. */
export function guideError(
  code: GuideErrorCode,
  message: string,
  extra?: Pick<GuideError, 'issues' | 'details' | 'cause'>,
): GuideError {
  const error: GuideError = { code, message };
  if (extra?.issues) error.issues = extra.issues;
  if (extra?.details) error.details = extra.details;
  if (extra && 'cause' in extra) error.cause = extra.cause;
  return error;
}

/** Narrows a {@link GuideResult} to its success branch. */
export function isSuccess<TData>(
  result: GuideResult<TData>,
): result is { success: true; data: TData } {
  return result.success;
}
