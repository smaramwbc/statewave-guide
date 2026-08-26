/**
 * Helpers every real provider adapter shares.
 *
 * Two jobs, both of which must be identical across providers or the benchmark
 * compares transports rather than models: how the trusted instruction and the
 * untrusted evidence are laid out in the request, and how a response is turned
 * into a validated result.
 *
 * @packageDocumentation
 */

import type { z } from 'zod';
import type {
  SemanticGenerationRequest,
  SemanticGenerationResult,
  SemanticUsage,
} from '../provider.js';

/** One chat message, in the shape every OpenAI-compatible endpoint expects. */
export interface ProviderMessage {
  role: 'system' | 'user';
  content: string;
}

/**
 * Lays the request out as a system turn and a user turn.
 *
 * The separation is the point, and it is why this is shared rather than
 * duplicated per adapter. `request.system` is ours and goes in the system role;
 * `request.evidence` is repository text — untrusted, already fenced by
 * `prompt.ts` — and goes in the user role, where it is data being shown to the
 * model rather than instruction being given to it.
 *
 * Concatenating the two into one system string would undo the whole
 * instruction/data separation, and it is exactly the shortcut a transport-level
 * adapter is tempted into.
 */
export function buildProviderMessages(
  request: SemanticGenerationRequest<unknown>,
): ProviderMessage[] {
  return [
    { role: 'system', content: request.system },
    { role: 'user', content: request.evidence },
  ];
}

/**
 * Extracts the first JSON object from a response.
 *
 * Models wrap JSON in prose or a fenced block often enough that refusing those
 * outright would measure formatting compliance rather than product
 * understanding. Anything beyond a single balanced object is left to fail
 * validation — this recovers a shape, it does not repair one.
 */
export function extractJsonObject(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(trimmed);
  if (fenced?.[1] !== undefined) return fenced[1].trim();

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start !== -1 && end > start ? trimmed.slice(start, end + 1) : undefined;
}

/**
 * Validates raw response text against the request's schema.
 *
 * A malformed or non-conforming response is `schema_violation` — a first-class,
 * counted outcome rather than a thrown error, because how reliably a provider
 * returns the requested shape is itself one of the things the benchmark
 * measures.
 */
export function parseStructured<T>(
  schema: z.ZodType<T>,
  text: string,
  usage: SemanticUsage,
): SemanticGenerationResult<T> {
  const json = extractJsonObject(text);
  if (json === undefined) {
    return {
      success: false,
      error: { code: 'schema_violation', message: 'Response contained no JSON object.' },
      usage,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (thrown) {
    return {
      success: false,
      error: {
        code: 'schema_violation',
        message: `Response was not valid JSON: ${thrown instanceof Error ? thrown.message : ''}`,
      },
      usage,
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return {
      success: false,
      error: { code: 'schema_violation', message: `Response failed its schema — ${issues}` },
      usage,
    };
  }

  return { success: true, data: result.data, usage, raw: text };
}
