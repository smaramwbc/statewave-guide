/**
 * One adapter for every OpenAI-compatible endpoint.
 *
 * OpenAI, OpenRouter, a LiteLLM proxy and a local Ollama server all speak the
 * same `POST /chat/completions` shape, so they are one adapter with a different
 * `baseUrl` rather than four. That matters for the benchmark specifically: an
 * adapter per vendor would be four places for a subtle difference in how the
 * request is built to creep in, and the whole point of the comparison is that
 * every provider receives semantically equivalent input.
 *
 * Written with `fetch` rather than a vendor SDK. The request is a JSON body with
 * four fields; a dependency would buy nothing and would force every consumer of
 * `@statewavedev/guide-semantic` to install it.
 *
 * @packageDocumentation
 */

import type { z } from 'zod';
import { toJsonSchema } from './json-schema.js';
import type {
  SemanticGenerationRequest,
  SemanticGenerationResult,
  SemanticModelProvider,
  SemanticProviderErrorCode,
  SemanticUsage,
} from '../provider.js';
import { buildProviderMessages, parseStructured } from './shared.js';

/** How a provider is asked to return JSON. */
export type StructuredOutputMode =
  /** `response_format: json_schema` with `strict: true`. Strongest. */
  | 'json_schema'
  /** `response_format: json_object`. The model is told the shape in the prompt. */
  | 'json_object'
  /** Nothing set; the instruction alone asks for JSON. Weakest, and last resort. */
  | 'prompt';

/** Configuration for an OpenAI-compatible endpoint. */
export interface OpenAiCompatibleOptions {
  /** Adapter name recorded on generated claims, e.g. `openai` or `openrouter`. */
  name: string;
  /** Model identifier as the endpoint expects it. */
  model: string;
  /** Base URL including the version path, e.g. `https://api.openai.com/v1`. */
  baseUrl: string;
  /** Bearer token. Never logged, never included in any artefact. */
  apiKey?: string;
  /** Extra headers. OpenRouter wants `HTTP-Referer` and `X-Title`. */
  headers?: Record<string, string>;
  /** Defaults to `json_schema`. */
  structuredOutput?: StructuredOutputMode;
  /**
   * Sampling temperature. `0` for a benchmark.
   *
   * Omitted from the request when `undefined`, because some endpoints reject the
   * field rather than ignoring it.
   */
  temperature?: number;
  /** Upper bound on the response. */
  maxOutputTokens?: number;
  /** Per-request timeout. Defaults to 120s — enrichment prompts are large. */
  timeoutMs?: number;
  /** Injected for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
}

/** Maps an HTTP status onto the pipeline's error vocabulary. */
function statusToCode(status: number): SemanticProviderErrorCode {
  if (status === 401 || status === 403) return 'not_configured';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timeout';
  return 'provider_error';
}

/**
 * Creates a provider for any OpenAI-compatible endpoint.
 *
 * @example
 * ```ts
 * // OpenAI
 * createOpenAiCompatibleProvider({ name: 'openai', model: 'gpt-5',
 *   baseUrl: 'https://api.openai.com/v1', apiKey: process.env.OPENAI_API_KEY });
 *
 * // OpenRouter
 * createOpenAiCompatibleProvider({ name: 'openrouter', model: 'anthropic/claude-opus-4.6',
 *   baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });
 *
 * // A LiteLLM proxy
 * createOpenAiCompatibleProvider({ name: 'litellm', model: 'my-route',
 *   baseUrl: 'http://localhost:4000/v1', apiKey: process.env.LITELLM_API_KEY });
 * ```
 */
export function createOpenAiCompatibleProvider(
  options: OpenAiCompatibleOptions,
): SemanticModelProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const mode = options.structuredOutput ?? 'json_schema';
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    name: options.name,
    model: options.model,

    async generateStructured<T>(
      request: SemanticGenerationRequest<T>,
    ): Promise<SemanticGenerationResult<T>> {
      const started = Date.now();
      const usage = (): SemanticUsage => ({ latencyMs: Date.now() - started });

      if (options.apiKey === undefined || options.apiKey === '') {
        return {
          success: false,
          error: { code: 'not_configured', message: `${options.name}: no API key configured.` },
          usage: usage(),
        };
      }

      const body: Record<string, unknown> = {
        model: options.model,
        messages: buildProviderMessages(request),
      };
      if (options.temperature !== undefined) body['temperature'] = options.temperature;
      if (options.maxOutputTokens !== undefined) body['max_tokens'] = options.maxOutputTokens;
      if (mode === 'json_schema') {
        body['response_format'] = {
          type: 'json_schema',
          json_schema: {
            name: request.task.replace(/[^a-zA-Z0-9_-]/g, '_'),
            strict: true,
            schema: toJsonSchema(request.schema as z.ZodType),
          },
        };
      } else if (mode === 'json_object') {
        body['response_format'] = { type: 'json_object' };
      }

      // The caller's signal and our own timeout both have to abort the request.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = (): void => controller.abort();
      request.signal?.addEventListener('abort', onAbort, { once: true });

      try {
        const response = await fetchImpl(`${options.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${options.apiKey}`,
            ...options.headers,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          return {
            success: false,
            error: {
              code: statusToCode(response.status),
              // Truncated: a provider error body can be enormous, and it is
              // untrusted text that ends up in a benchmark artefact.
              message: `${options.name} HTTP ${response.status}: ${detail.slice(0, 300)}`,
            },
            usage: usage(),
          };
        }

        const payload = (await response.json()) as ChatCompletionResponse;
        const text = payload.choices?.[0]?.message?.content ?? '';
        const measured: SemanticUsage = {
          latencyMs: Date.now() - started,
          ...(payload.usage?.prompt_tokens === undefined
            ? {}
            : { inputTokens: payload.usage.prompt_tokens }),
          ...(payload.usage?.completion_tokens === undefined
            ? {}
            : { outputTokens: payload.usage.completion_tokens }),
        };

        return parseStructured(request.schema, text, measured);
      } catch (thrown) {
        const aborted = request.signal?.aborted === true;
        return {
          success: false,
          error: {
            code: aborted ? 'cancelled' : controller.signal.aborted ? 'timeout' : 'provider_error',
            message: thrown instanceof Error ? thrown.message : String(thrown),
          },
          usage: usage(),
        };
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}
