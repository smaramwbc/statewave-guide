/**
 * Failure construction for the action runtime.
 *
 * Two kinds of failure exist here and they are deliberately different.
 *
 * *Registration* failures are programming errors — a misspelled name, a missing
 * schema — and they throw, loudly, at application startup where a developer
 * will see them.
 *
 * *Execution* failures are data — bad input from a model, a handler that
 * rejected, a permission denial — and they are never thrown. They are returned
 * as {@link GuideActionError} inside a result, because the caller of an action
 * is often not a human and must be able to read the failure rather than catch
 * it.
 *
 * @packageDocumentation
 */

import type {
  GuideActionError,
  GuideActionErrorCode,
  GuideActionIssue,
} from '@statewavedev/guide-shared';

/**
 * Thrown when a registry is configured incorrectly.
 *
 * This is the only error type this package throws, and it only ever surfaces
 * from `register()` / `unregister()` — never from `execute()`.
 */
export class ActionRegistrationError extends Error {
  override readonly name = 'ActionRegistrationError';

  constructor(message: string) {
    super(message);
  }
}

/** Builds a structured execution failure. */
export function actionError(
  code: GuideActionErrorCode,
  message: string,
  extra?: { issues?: GuideActionIssue[]; cause?: unknown },
): GuideActionError {
  const error: GuideActionError = { code, message };
  if (extra?.issues) error.issues = extra.issues;
  if (extra && 'cause' in extra) error.cause = extra.cause;
  return error;
}

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
