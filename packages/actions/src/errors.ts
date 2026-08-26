/**
 * Failure construction for the action runtime.
 *
 * Three kinds of failure exist here and they are deliberately different.
 *
 * *Registration* failures are programming errors — a misspelled name, a missing
 * schema — and they throw, loudly, at application startup where a developer will
 * see them.
 *
 * *Execution* failures are data — bad input from a model, a handler that
 * rejected, a permission denial — and they are never thrown out of `execute()`.
 * They are returned as a {@link GuideError} inside a result, because the caller
 * of an action is often not a human and must be able to read the failure rather
 * than catch it.
 *
 * *Handler* failures sit between the two: a handler signals a specific,
 * classified failure by throwing {@link ActionFailure}, which the registry
 * unwraps into that exact {@link GuideErrorCode}. Without it every handler
 * problem would collapse into `execution_failed`, which tells a caller nothing
 * it can act on.
 *
 * @packageDocumentation
 */

import type { GuideError, GuideErrorCode, GuideErrorIssue } from '@statewavedev/guide-shared';
import { guideError } from '@statewavedev/guide-shared';

/**
 * Thrown when a registry is configured incorrectly.
 *
 * This only ever surfaces from `register()` — never from `execute()`.
 */
export class ActionRegistrationError extends Error {
  override readonly name = 'ActionRegistrationError';

  constructor(message: string) {
    super(message);
  }
}

/**
 * Thrown by an action handler to report a *classified* failure.
 *
 * The registry catches it and returns `{ success: false, error }` carrying the
 * code verbatim, so a caller sees `target_not_mounted` rather than a generic
 * `execution_failed` with the reason buried in a string.
 *
 * @example
 * ```ts
 * execute: async ({ elementId }) => {
 *   const result = await highlight.highlight(elementId);
 *   if (!result.success) throw ActionFailure.from(result.error);
 * };
 * ```
 */
export class ActionFailure extends Error {
  override readonly name = 'ActionFailure';

  /** The classified reason. */
  readonly code: GuideErrorCode;
  /** Structured context for the failure. */
  readonly details?: Record<string, unknown>;
  /** Validation problems, when the code is `invalid_input`. */
  readonly issues?: GuideErrorIssue[];

  constructor(
    code: GuideErrorCode,
    message: string,
    extra?: { details?: Record<string, unknown>; issues?: GuideErrorIssue[]; cause?: unknown },
  ) {
    super(message, extra && 'cause' in extra ? { cause: extra.cause } : undefined);
    this.code = code;
    if (extra?.details) this.details = extra.details;
    if (extra?.issues) this.issues = extra.issues;
  }

  /** Wraps an existing {@link GuideError} so a handler can rethrow it unchanged. */
  static from(error: GuideError): ActionFailure {
    return new ActionFailure(error.code, error.message, {
      ...(error.details ? { details: error.details } : {}),
      ...(error.issues ? { issues: error.issues } : {}),
      ...('cause' in error ? { cause: error.cause } : {}),
    });
  }

  /** Converts back to the structured error the registry returns. */
  toGuideError(): GuideError {
    return guideError(this.code, this.message, {
      ...(this.details ? { details: this.details } : {}),
      ...(this.issues ? { issues: this.issues } : {}),
      cause: this.cause,
    });
  }
}

/** Builds a structured execution failure. */
export const actionError = guideError;

/**
 * Extracts a readable message from an unknown thrown value.
 *
 * Handlers are host code and may throw anything at all, including strings and
 * plain objects, so this never assumes an `Error`.
 */
export function describeThrown(thrown: unknown): string {
  if (thrown instanceof Error) return thrown.message || thrown.name;
  if (typeof thrown === 'string' && thrown.length > 0) return thrown;
  return 'The action handler failed without a message.';
}

/** Recognises the `AbortError` that `AbortSignal` conventionally produces. */
export function isAbortError(thrown: unknown): boolean {
  return thrown instanceof Error && thrown.name === 'AbortError';
}

/** Recognises the `TimeoutError` that `AbortSignal.timeout()` produces. */
export function isTimeoutError(thrown: unknown): boolean {
  return thrown instanceof Error && thrown.name === 'TimeoutError';
}
