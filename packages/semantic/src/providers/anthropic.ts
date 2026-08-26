/**
 * The Anthropic adapter.
 *
 * Separate from the OpenAI-compatible one because the Messages API is genuinely
 * a different shape — `system` is a top-level field rather than a message role,
 * structured output is `output_config.format` rather than `response_format`, and
 * usage is reported under different keys.
 *
 * Three current-model behaviours shape this file, and each would be a silent
 * 400 if carried over from an older prior:
 *
 * - **`temperature` and `top_p` are rejected**, not ignored, on Opus 5 / Sonnet 5
 *   and the 4.7+ family. A benchmark cannot pin randomness the way it can on an
 *   OpenAI-compatible endpoint; `output_config.effort` is the nearest control and
 *   is what this adapter sets. The comparison records effective settings per
 *   provider rather than pretending they are equivalent.
 * - **`budget_tokens` is removed.** Thinking is configured as
 *   `{ type: 'adaptive' }`; a token budget returns 400.
 * - **Assistant prefill is removed.** The response shape is controlled by
 *   `output_config.format`, never by seeding an assistant turn.
 *
 * The SDK is an **optional** dependency, loaded on first use. A package that
 * abstracts over providers should not force every consumer to install one
 * vendor's client, and an adapter whose SDK is absent should report
 * `not_configured` rather than crash the process at import time.
 *
 * @packageDocumentation
 */

import type { z } from 'zod';
import { ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS, toJsonSchema } from './json-schema.js';
import type {
  SemanticGenerationRequest,
  SemanticGenerationResult,
  SemanticModelProvider,
  SemanticProviderErrorCode,
  SemanticUsage,
} from '../provider.js';
import { parseStructured } from './shared.js';

/** Reasoning depth. The nearest thing to a determinism control on this API. */
export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** Configuration for the Anthropic Messages API. */
export interface AnthropicProviderOptions {
  /** Adapter name recorded on generated claims. Defaults to `anthropic`. */
  name?: string;
  /** Model id, e.g. `claude-opus-5`. Exact string; never date-suffixed. */
  model: string;
  /** API key. Falls back to the SDK's own resolution when omitted. */
  apiKey?: string;
  /**
   * Reasoning depth.
   *
   * Defaults to `low`: the benchmark measures whether a model can ground claims
   * in supplied evidence, which is a reading task rather than a reasoning one,
   * and a lower effort keeps runs comparable and affordable.
   */
  effort?: AnthropicEffort;
  /** Upper bound on the response. Defaults to 16000. */
  maxOutputTokens?: number;
  /** Per-request timeout in milliseconds. Defaults to 120s. */
  timeoutMs?: number;
}

/** The slice of the SDK this adapter uses. Kept minimal so it is easy to fake. */
interface AnthropicLikeClient {
  messages: {
    create(body: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  };
}

interface MessagesResponse {
  content?: Array<{ type?: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: string;
  stop_details?: { category?: string | null; explanation?: string } | null;
}

/** Maps an SDK error onto the pipeline's error vocabulary. */
function classify(thrown: unknown): { code: SemanticProviderErrorCode; message: string } {
  const status =
    typeof thrown === 'object' && thrown !== null && 'status' in thrown
      ? Number((thrown as { status: unknown }).status)
      : undefined;
  const message = thrown instanceof Error ? thrown.message : String(thrown);

  if (status === 401 || status === 403) return { code: 'not_configured', message };
  if (status === 429) return { code: 'rate_limited', message };
  if (status === 408 || status === 504) return { code: 'timeout', message };
  return { code: 'provider_error', message };
}

/**
 * Creates an Anthropic provider.
 *
 * @param loadClient - injected for tests. Production passes nothing and the
 * adapter imports `@anthropic-ai/sdk` on first use.
 */
export function createAnthropicProvider(
  options: AnthropicProviderOptions,
  loadClient?: () => Promise<AnthropicLikeClient>,
): SemanticModelProvider {
  const name = options.name ?? 'anthropic';
  const maxTokens = options.maxOutputTokens ?? 16_000;
  const timeoutMs = options.timeoutMs ?? 120_000;
  let client: AnthropicLikeClient | undefined;
  let loadFailure: string | undefined;

  async function resolveClient(): Promise<AnthropicLikeClient | undefined> {
    if (client !== undefined || loadFailure !== undefined) return client;
    try {
      if (loadClient !== undefined) {
        client = await loadClient();
      } else {
        // Optional dependency, so the specifier is built at runtime: a bare
        // literal would make bundlers resolve it eagerly and fail the build for
        // consumers who never use this adapter.
        const specifier = '@anthropic-ai/sdk';
        const module = (await import(/* @vite-ignore */ specifier)) as {
          default: new (config: Record<string, unknown>) => AnthropicLikeClient;
        };
        client = new module.default(options.apiKey === undefined ? {} : { apiKey: options.apiKey });
      }
    } catch (thrown) {
      loadFailure = thrown instanceof Error ? thrown.message : 'could not load @anthropic-ai/sdk';
    }
    return client;
  }

  return {
    name,
    model: options.model,

    async generateStructured<T>(
      request: SemanticGenerationRequest<T>,
    ): Promise<SemanticGenerationResult<T>> {
      const started = Date.now();
      const usage = (): SemanticUsage => ({ latencyMs: Date.now() - started });

      const resolved = await resolveClient();
      if (resolved === undefined) {
        return {
          success: false,
          error: {
            code: 'not_configured',
            message: `${name}: ${loadFailure ?? 'install @anthropic-ai/sdk to use this adapter'}`,
          },
          usage: usage(),
        };
      }

      try {
        const response = (await resolved.messages.create(
          {
            model: options.model,
            max_tokens: maxTokens,
            // Ours, and never mixed with repository text.
            system: request.system,
            // Untrusted evidence, shown to the model as data.
            messages: [{ role: 'user', content: request.evidence }],
            thinking: { type: 'adaptive' },
            output_config: {
              effort: options.effort ?? 'low',
              format: {
                type: 'json_schema',
                schema: toJsonSchema(
                  request.schema as z.ZodType,
                  ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS,
                ),
              },
            },
          },
          {
            timeout: timeoutMs,
            ...(request.signal === undefined ? {} : { signal: request.signal }),
          },
        )) as MessagesResponse;

        const measured: SemanticUsage = {
          latencyMs: Date.now() - started,
          ...(response.usage?.input_tokens === undefined
            ? {}
            : { inputTokens: response.usage.input_tokens }),
          ...(response.usage?.output_tokens === undefined
            ? {}
            : { outputTokens: response.usage.output_tokens }),
        };

        // A safety decline returns HTTP 200 with no usable content, so it has to
        // be checked before the content array is read.
        if (response.stop_reason === 'refusal') {
          return {
            success: false,
            error: {
              code: 'provider_error',
              message: `${name} declined the request (${response.stop_details?.category ?? 'unspecified'}).`,
            },
            usage: measured,
          };
        }

        const text = (response.content ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text ?? '')
          .join('');

        return parseStructured(request.schema, text, measured);
      } catch (thrown) {
        if (request.signal?.aborted === true) {
          return {
            success: false,
            error: { code: 'cancelled', message: 'The request was cancelled.' },
            usage: usage(),
          };
        }
        return { success: false, error: classify(thrown), usage: usage() };
      }
    },
  };
}
