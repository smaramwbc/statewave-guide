/**
 * The vendor seam.
 *
 * One interface, one direction of dependency: the pipeline knows how to ask a
 * question and validate an answer, and knows nothing about who answers it. No
 * vendor name appears in this file, and none may — a provider is chosen at the
 * edge of the process and passed in.
 *
 * The shape of {@link SemanticGenerationRequest} is the important part, and it
 * is not merely a convenience:
 *
 * - `system` is a **trusted** instruction we authored.
 * - `evidence` is **untrusted** repository data.
 * - They are separate fields, and an adapter must keep them separate all the
 *   way to the wire. Concatenating them is the bug that makes prompt injection
 *   possible, and a type that offers one `prompt` string invites it.
 * - `schema` travels with the request, because an answer that has not been
 *   validated is not an answer.
 *
 * @packageDocumentation
 */

import type { z } from 'zod';

/** Why a generation failed. */
export type SemanticProviderErrorCode =
  /** The response did not satisfy the request's schema. */
  | 'schema_violation'
  /** The provider itself failed. */
  | 'provider_error'
  /** The provider asked us to slow down. */
  | 'rate_limited'
  /** The request exceeded its time budget. */
  | 'timeout'
  /** The caller aborted. */
  | 'cancelled'
  /** No credentials, or no provider configured at all. */
  | 'not_configured';

/** One structured-generation request. */
export interface SemanticGenerationRequest<T> {
  /** Trusted instruction, authored by us. */
  system: string;
  /** UNTRUSTED repository data. Never concatenated into `system`. */
  evidence: string;
  /** Zod schema the response must satisfy. */
  schema: z.ZodType<T>;
  /** Name of the task, for logging and mock routing. */
  task: string;
  signal?: AbortSignal;
}

/** What one generation cost. */
export interface SemanticUsage {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
}

/**
 * The outcome of one generation.
 *
 * A discriminated union rather than an exception, because a refused generation
 * is an ordinary, expected outcome in this pipeline — it becomes a recorded
 * rejection, not a crash — and `try`/`catch` makes it far too easy to lose the
 * usage figures for the attempt that failed.
 */
export type SemanticGenerationResult<T> =
  | { success: true; data: T; usage: SemanticUsage; raw?: string }
  | {
      success: false;
      error: { code: SemanticProviderErrorCode; message: string };
      usage: SemanticUsage;
    };

/** A source of generated language. Never a source of facts. */
export interface SemanticModelProvider {
  /** Adapter name, e.g. `mock`. Recorded on everything it generates. */
  readonly name: string;
  /** Model identifier the adapter is configured for. */
  readonly model: string;
  /** Asks for one schema-shaped answer. */
  generateStructured<T>(
    request: SemanticGenerationRequest<T>,
  ): Promise<SemanticGenerationResult<T>>;
}

/**
 * Error codes a retry may help with.
 *
 * Transient, every one of them: the same request sent again may well succeed.
 */
export const RETRYABLE_ERROR_CODES: readonly SemanticProviderErrorCode[] = [
  'rate_limited',
  'timeout',
  'provider_error',
];

/**
 * Error codes no retry may ever be attempted for, whatever a caller's predicate
 * says.
 *
 * `schema_violation` is the interesting one. A malformed response will not
 * become well-formed because it was asked for again in exactly the same way,
 * and retrying it burns tokens to produce the same rejection twice. The
 * alternative — a single *repair* attempt that shows the model its own output
 * and the validation error — is a legitimate design, and is deliberately **not**
 * implemented here: a repair prompt has to quote the failed response, the failed
 * response is untrusted text, and quoting it into a second instruction is
 * exactly the injection path `./prompt.ts` exists to close. If it is ever added
 * it belongs behind its own explicit decorator with its own fenced data block,
 * not inside a retry loop.
 *
 * `cancelled` and `not_configured` are terminal for the obvious reasons.
 */
export const NEVER_RETRYABLE_ERROR_CODES: readonly SemanticProviderErrorCode[] = [
  'schema_violation',
  'cancelled',
  'not_configured',
];

/** Options for {@link withRetry}. */
export interface RetryOptions {
  /** Total attempts, including the first. Default 3. */
  attempts?: number;
  /**
   * Narrows which errors are retried.
   *
   * May only ever *narrow*: a predicate that returns `true` for a code in
   * {@link NEVER_RETRYABLE_ERROR_CODES} is ignored for that code.
   */
  isRetryable?: (code: SemanticProviderErrorCode) => boolean;
  /**
   * Delay between attempts, in milliseconds. Default 0.
   *
   * Zero by default so tests need neither fake timers nor patience; a real
   * adapter should pass a backoff.
   */
  delayMs?: number | ((attempt: number) => number);
}

function totalUsage(accumulated: SemanticUsage, attempt: SemanticUsage): SemanticUsage {
  const inputTokens = (accumulated.inputTokens ?? 0) + (attempt.inputTokens ?? 0);
  const outputTokens = (accumulated.outputTokens ?? 0) + (attempt.outputTokens ?? 0);
  const costUsd = (accumulated.costUsd ?? 0) + (attempt.costUsd ?? 0);
  const seen = (key: 'inputTokens' | 'outputTokens' | 'costUsd'): boolean =>
    accumulated[key] !== undefined || attempt[key] !== undefined;
  return {
    ...(seen('inputTokens') ? { inputTokens } : {}),
    ...(seen('outputTokens') ? { outputTokens } : {}),
    ...(seen('costUsd') ? { costUsd } : {}),
    latencyMs: accumulated.latencyMs + attempt.latencyMs,
  };
}

/**
 * Reads an abort flag through a function call.
 *
 * A direct `request.signal?.aborted` check would be narrowed away by the guard
 * at the top of the retry loop — but the flag can flip during the `await`, which
 * is precisely the case that matters.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

/** True for the `AbortError` a well-behaved adapter throws on cancellation. */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Wraps a provider so transient failures are retried.
 *
 * A thin decorator on purpose: it does not touch the request, does not rewrite
 * the prompt, and does not reinterpret a result. Usage is accumulated across
 * attempts, so the cost of a retried call is the cost of every attempt it made
 * — under-reporting that would make a budget meaningless.
 */
export function withRetry(
  provider: SemanticModelProvider,
  options: RetryOptions = {},
): SemanticModelProvider {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 3));
  const narrowed = options.isRetryable;
  const delayFor = (attempt: number): number =>
    typeof options.delayMs === 'function' ? options.delayMs(attempt) : (options.delayMs ?? 0);

  const retryable = (code: SemanticProviderErrorCode): boolean => {
    if (NEVER_RETRYABLE_ERROR_CODES.includes(code)) return false;
    return narrowed === undefined ? RETRYABLE_ERROR_CODES.includes(code) : narrowed(code);
  };

  return {
    name: provider.name,
    model: provider.model,
    async generateStructured<T>(
      request: SemanticGenerationRequest<T>,
    ): Promise<SemanticGenerationResult<T>> {
      let usage: SemanticUsage = { latencyMs: 0 };
      let last: SemanticGenerationResult<T> | undefined;

      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        if (request.signal?.aborted === true) {
          return {
            success: false,
            error: { code: 'cancelled', message: 'The request was aborted before it was sent.' },
            usage,
          };
        }

        let result: SemanticGenerationResult<T>;
        try {
          result = await provider.generateStructured(request);
        } catch (error) {
          // A provider that throws is still a provider that failed. Turning the
          // throw into a result keeps the usage accounting intact and keeps the
          // failure inside the same union every other failure travels in.
          const aborted = isAbortError(error) || isAborted(request.signal);
          result = {
            success: false,
            error: {
              code: aborted ? 'cancelled' : 'provider_error',
              message: error instanceof Error ? error.message : String(error),
            },
            usage: { latencyMs: 0 },
          };
        }

        usage = totalUsage(usage, result.usage);
        if (result.success) return { ...result, usage };

        last = result;
        if (!retryable(result.error.code) || attempt === attempts) break;
        const delay = delayFor(attempt);
        if (delay > 0) await sleep(delay);
      }

      /* c8 ignore next 3 -- `attempts` is at least 1, so `last` is always set. */
      if (last === undefined) {
        return {
          success: false,
          error: { code: 'provider_error', message: 'The provider was never called.' },
          usage,
        };
      }
      return { ...last, usage };
    },
  };
}
