/**
 * The real provider adapters.
 *
 * Tested without a network: every case drives an injected `fetch` or a fake
 * client. What is being pinned is not that a vendor works — that is what the
 * benchmark measures — but that the adapter cannot weaken the pipeline around
 * it: no credential leaks into an artefact, no unparsed response becomes a
 * success, and the instruction/data separation survives the transport.
 */

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createOpenAiCompatibleProvider } from '../src/providers/openai-compatible.js';
import { createAnthropicProvider } from '../src/providers/anthropic.js';
import { resolveProvider, DEFAULT_PROVIDERS } from '../src/providers/registry.js';
import {
  ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS,
  toJsonSchema,
} from '../src/providers/json-schema.js';
import { extractJsonObject, buildProviderMessages } from '../src/providers/shared.js';

const schema = z.object({ title: z.string(), count: z.number() });
const request = {
  system: 'TRUSTED INSTRUCTION',
  evidence: '<<<EVIDENCE>>> untrusted repository text <<<END>>>',
  schema,
  task: 'feature-enrichment',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chatBody(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  };
}

describe('the OpenAI-compatible adapter', () => {
  it('sends the instruction as system and the evidence as user', async () => {
    // The separation has to survive the transport, or every guarantee upstream
    // of it is worthless.
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(chatBody('{"title":"t","count":1}')),
    );
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await provider.generateStructured(request);

    const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(body.messages).toEqual([
      { role: 'system', content: 'TRUSTED INSTRUCTION' },
      { role: 'user', content: request.evidence },
    ]);
    expect(body.messages[0].content).not.toContain('untrusted');
  });

  it('parses a valid structured response', async () => {
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl: (async () =>
        jsonResponse(chatBody('{"title":"t","count":2}'))) as unknown as typeof fetch,
    });

    const result = await provider.generateStructured(request);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ title: 't', count: 2 });
    expect(result.usage.inputTokens).toBe(11);
    expect(result.usage.outputTokens).toBe(7);
  });

  it('reports a non-conforming response as schema_violation rather than succeeding', async () => {
    // How reliably a provider returns the requested shape is one of the things
    // the benchmark measures, so this is a counted outcome, not a crash.
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl: (async () => jsonResponse(chatBody('{"title":"t"}'))) as unknown as typeof fetch,
    });

    const result = await provider.generateStructured(request);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.code).toBe('schema_violation');
  });

  it('recovers JSON from a fenced block, because models wrap it', async () => {
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl: (async () =>
        jsonResponse(
          chatBody('Here you go:\n```json\n{"title":"t","count":3}\n```'),
        )) as unknown as typeof fetch,
    });

    const result = await provider.generateStructured(request);
    expect(result.success && result.data.count).toBe(3);
  });

  it.each([
    [401, 'not_configured'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
  ])('maps HTTP %i onto %s', async (status, code) => {
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      apiKey: 'k',
      fetchImpl: (async () => jsonResponse({ error: {} }, status)) as unknown as typeof fetch,
    });

    const result = await provider.generateStructured(request);
    expect(result.success === false && result.error.code).toBe(code);
  });

  it('never puts the API key in an error message', async () => {
    // Errors end up in benchmark artefacts.
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      apiKey: 'sk-super-secret-value',
      fetchImpl: (async () =>
        jsonResponse({ error: { message: 'boom' } }, 500)) as unknown as typeof fetch,
    });

    const result = await provider.generateStructured(request);
    expect(JSON.stringify(result)).not.toContain('sk-super-secret-value');
  });

  it('fails closed with no API key', async () => {
    const provider = createOpenAiCompatibleProvider({
      name: 'test',
      model: 'm',
      baseUrl: 'https://example.test/v1',
      fetchImpl: (async () => jsonResponse(chatBody('{}'))) as unknown as typeof fetch,
    });

    const result = await provider.generateStructured(request);
    expect(result.success === false && result.error.code).toBe('not_configured');
  });
});

describe('the Anthropic adapter', () => {
  /** A fake standing in for the SDK client. */
  function fakeClient(response: unknown) {
    const create = vi.fn(
      async (_body: Record<string, unknown>, _options?: Record<string, unknown>) => response,
    );
    return { create, client: { messages: { create } } };
  }

  it('puts the instruction in `system` and the evidence in a user message', async () => {
    const { create, client } = fakeClient({
      content: [{ type: 'text', text: '{"title":"t","count":1}' }],
      usage: { input_tokens: 5, output_tokens: 2 },
    });
    const provider = createAnthropicProvider({ model: 'claude-opus-5' }, async () => client);

    await provider.generateStructured(request);

    const body = create.mock.calls[0]?.[0] ?? {};
    expect(body['system']).toBe('TRUSTED INSTRUCTION');
    expect(body['messages']).toEqual([{ role: 'user', content: request.evidence }]);
  });

  it('never sends temperature or budget_tokens, which current models reject', async () => {
    // Both return a 400 on Opus 5 / Sonnet 5 and the 4.7+ family. Sending either
    // would make every call fail rather than degrade.
    const { create, client } = fakeClient({
      content: [{ type: 'text', text: '{"title":"t","count":1}' }],
    });
    const provider = createAnthropicProvider({ model: 'claude-opus-5' }, async () => client);

    await provider.generateStructured(request);

    const body = create.mock.calls[0]?.[0] ?? {};
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
    expect(body['thinking']).toEqual({ type: 'adaptive' });
    expect((body['thinking'] as Record<string, unknown>)['budget_tokens']).toBeUndefined();
    expect((body['output_config'] as Record<string, unknown>)['effort']).toBe('low');
  });

  it('treats a safety refusal as a failure rather than reading empty content', async () => {
    const { client } = fakeClient({
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      content: [],
    });
    const provider = createAnthropicProvider({ model: 'claude-opus-5' }, async () => client);

    const result = await provider.generateStructured(request);
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.message).toContain('cyber');
  });

  it('reports not_configured when the optional SDK is absent', async () => {
    const provider = createAnthropicProvider({ model: 'claude-opus-5' }, async () => {
      throw new Error('Cannot find module @anthropic-ai/sdk');
    });

    const result = await provider.generateStructured(request);
    expect(result.success === false && result.error.code).toBe('not_configured');
  });
});

describe('the provider registry', () => {
  it('skips a provider whose credential is missing, naming the variable', () => {
    const resolved = resolveProvider(
      {
        id: 'x',
        kind: 'openai-compatible',
        model: 'm',
        baseUrl: 'https://e.test/v1',
        apiKeyEnv: 'MISSING_KEY',
      },
      {},
    );
    expect(resolved.status).toBe('skipped');
    expect(resolved.status === 'skipped' && resolved.reason).toContain('MISSING_KEY');
  });

  it('resolves a provider when the credential is present', () => {
    const resolved = resolveProvider(
      {
        id: 'x',
        kind: 'openai-compatible',
        model: 'm',
        baseUrl: 'https://e.test/v1',
        apiKeyEnv: 'PRESENT_KEY',
      },
      { PRESENT_KEY: 'k' },
    );
    expect(resolved.status).toBe('ready');
  });

  it('never stores the credential on the resolved object', () => {
    const resolved = resolveProvider(
      {
        id: 'x',
        kind: 'openai-compatible',
        model: 'm',
        baseUrl: 'https://e.test/v1',
        apiKeyEnv: 'PRESENT_KEY',
      },
      { PRESENT_KEY: 'sk-leaky' },
    );
    expect(JSON.stringify(resolved)).not.toContain('sk-leaky');
  });

  it('records that Anthropic cannot be temperature-pinned', () => {
    const resolved = resolveProvider(
      { id: 'a', kind: 'anthropic', model: 'claude-opus-5', apiKeyEnv: 'K', effort: 'low' },
      { K: 'k' },
    );
    expect(resolved.status === 'ready' && resolved.settings).toContain(
      'temperature=unsupported-by-api',
    );
  });

  it('names no model outside the config array', () => {
    // Model ids are configuration. Re-pointing the benchmark is one file.
    expect(DEFAULT_PROVIDERS.every((config) => config.model.length > 0)).toBe(true);
    expect(new Set(DEFAULT_PROVIDERS.map((c) => c.id)).size).toBe(DEFAULT_PROVIDERS.length);
  });
});

describe('structured-output plumbing', () => {
  it('emits a strict JSON Schema', () => {
    const generated = toJsonSchema(z.object({ a: z.string(), b: z.number().optional() }));
    expect(generated['additionalProperties']).toBe(false);
    // Strict modes reject a schema whose `required` omits a declared key.
    expect(generated['required']).toEqual(['a', 'b']);
  });

  it('extracts JSON from prose and fences', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
    expect(extractJsonObject('text ```json\n{"a":1}\n``` more')).toBe('{"a":1}');
    expect(extractJsonObject('no json here')).toBeUndefined();
  });

  it('keeps instruction and evidence in separate roles', () => {
    const messages = buildProviderMessages(request);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('user');
  });
});

// ---------------------------------------------------------------------------
// Provider schema dialects
//
// These bounds were established against the live Anthropic API, not inferred
// from a specification. If a request starts failing with "property 'X' is not
// supported", the dialect below is the thing to re-probe.
// ---------------------------------------------------------------------------

describe('provider schema dialects', () => {
  const constrained = z.object({
    items: z.array(z.string()).max(5),
    score: z.number().min(0).max(1),
  });

  it('keeps every constraint for a provider that accepts standard JSON Schema', () => {
    const schema = toJsonSchema(constrained) as {
      properties: { items: Record<string, unknown>; score: Record<string, unknown> };
    };
    expect(schema.properties.items['maxItems']).toBe(5);
    expect(schema.properties.score['minimum']).toBe(0);
    expect(schema.properties.score['maximum']).toBe(1);
  });

  it('removes only the keywords Anthropic rejects, and only where it rejects them', () => {
    const schema = toJsonSchema(constrained, ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS) as {
      properties: { items: Record<string, unknown>; score: Record<string, unknown> };
    };
    // Rejected by the API with a 400.
    expect(schema.properties.items).not.toHaveProperty('maxItems');
    expect(schema.properties.score).not.toHaveProperty('minimum');
    expect(schema.properties.score).not.toHaveProperty('maximum');
    // Accepted by the API — dropping these would lose real signal for nothing.
    expect(schema.properties.items['type']).toBe('array');
    expect(schema.properties.items['items']).toEqual({ type: 'string' });
  });

  it('strips inside nested objects and array items, not just at the root', () => {
    const nested = z.object({
      rows: z.array(z.object({ tags: z.array(z.string()).max(3), n: z.number().min(1) })),
    });
    const json = JSON.stringify(toJsonSchema(nested, ANTHROPIC_UNSUPPORTED_SCHEMA_KEYWORDS));
    expect(json).not.toContain('maxItems');
    expect(json).not.toContain('minimum');
  });

  it('still rejects an over-long array locally — the Zod schema remains the gate', async () => {
    // The wire schema no longer carries `maxItems`, so the safety question is
    // whether a violating response is caught anyway. It must be: prevention
    // moved to detection, and detection is what the pipeline relies on.
    const provider = createAnthropicProvider(
      { apiKey: 'test-key', model: 'claude-opus-5' },
      async () => ({
        messages: {
          create: async () => ({
            content: [
              {
                type: 'text',
                text: JSON.stringify({ items: ['a', 'b', 'c', 'd', 'e', 'f'], score: 0.5 }),
              },
            ],
            usage: { input_tokens: 1, output_tokens: 1 },
            stop_reason: 'end_turn',
          }),
        },
      }),
    );
    const result = await provider.generateStructured({
      system: 'x',
      evidence: 'y',
      schema: constrained,
      task: 'test',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('schema_violation');
  });
});
