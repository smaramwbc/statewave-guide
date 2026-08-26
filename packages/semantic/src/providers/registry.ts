/**
 * Resolving configured providers, and reporting honestly when one cannot run.
 *
 * The benchmark must never fabricate a result. A provider whose credentials are
 * absent produces a `skipped` entry naming the environment variable it wanted —
 * not an error, not a zero, and certainly not a silent omission that would make
 * a comparison table look complete when it is not.
 *
 * @packageDocumentation
 */

import type { SemanticModelProvider } from '../provider.js';
import { createAnthropicProvider } from './anthropic.js';
import type { AnthropicEffort } from './anthropic.js';
import { createOpenAiCompatibleProvider } from './openai-compatible.js';
import type { StructuredOutputMode } from './openai-compatible.js';

/** Transports a configured provider can use. */
export type ProviderKind = 'openai-compatible' | 'anthropic' | 'mock';

/** One entry in the benchmark's provider list. */
export interface ProviderConfig {
  /** Stable identifier used in output paths, e.g. `openai-gpt-5`. */
  id: string;
  kind: ProviderKind;
  /** Model identifier, exactly as the endpoint expects it. */
  model: string;
  /** Environment variable holding the credential. Never the credential itself. */
  apiKeyEnv?: string;
  /** Required for `openai-compatible`. */
  baseUrl?: string;
  headers?: Record<string, string>;
  structuredOutput?: StructuredOutputMode;
  temperature?: number;
  effort?: AnthropicEffort;
  maxOutputTokens?: number;
  timeoutMs?: number;
}

/** A provider that is ready to run, or the reason it is not. */
export type ResolvedProvider =
  | { status: 'ready'; config: ProviderConfig; provider: SemanticModelProvider; settings: string }
  | { status: 'skipped'; config: ProviderConfig; reason: string };

/**
 * The default provider list.
 *
 * Model ids are configuration, not architecture — nothing outside this array
 * names a model, so re-pointing the benchmark is an edit to one file.
 *
 * **Why direct adapters *and* routers, when a router reaches every model.**
 * OpenRouter and a LiteLLM proxy both speak the OpenAI protocol, so a single
 * adapter reaches Claude, Gemini and GPT through either. That covers breadth
 * cheaply. It does not replace a direct adapter, for two reasons:
 *
 * 1. **Translation is a confound.** Through an OpenAI-shaped shim, a router maps
 *    `response_format` onto `output_config.format` and the system role onto the
 *    top-level `system` field. When a schema failure appears, that mapping makes
 *    it impossible to say whether the model failed to produce the shape or the
 *    router mistranslated it — and schema reliability is one of the things being
 *    measured.
 * 2. **Some controls do not survive the shim.** `output_config.effort` has no
 *    OpenAI-compatible equivalent, and since current Claude models reject
 *    `temperature` outright, effort is the only determinism-adjacent control
 *    that exists. Benchmarking Claude through a router means benchmarking it
 *    with no randomness control at all.
 *
 * The overlap is then turned into a measurement rather than treated as waste:
 * the same Claude model is listed twice, direct and via OpenRouter, so the
 * router itself becomes an isolated variable. If the two disagree, the
 * difference is the transport.
 *
 * Everything below is skipped unless its credential is present, so a list longer
 * than the keys available costs nothing.
 */
export const DEFAULT_PROVIDERS: readonly ProviderConfig[] = [
  // --- direct: full fidelity, vendor-specific controls available -----------
  {
    id: 'openai-gpt-5',
    kind: 'openai-compatible',
    model: 'gpt-5',
    baseUrl: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
    structuredOutput: 'json_schema',
    temperature: 0,
  },
  {
    id: 'anthropic-opus-5',
    kind: 'anthropic',
    model: 'claude-opus-5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    // No temperature: current Claude models reject the field outright.
    effort: 'low',
  },

  // --- via OpenRouter: breadth through one credential ----------------------
  {
    // Deliberately the same model as `anthropic-opus-5`. Running both isolates
    // the router as a variable; a disagreement between them is the transport.
    id: 'openrouter-claude-opus-5',
    kind: 'openai-compatible',
    model: 'anthropic/claude-opus-5',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    headers: { 'X-Title': 'statewave-guide-provider-reality-check' },
    structuredOutput: 'json_schema',
    temperature: 0,
  },
  {
    // Gemini reaches the benchmark only through a router: no direct adapter
    // exists, and one OpenRouter credential is cheaper than a third vendor SDK.
    id: 'openrouter-gemini-3-pro',
    kind: 'openai-compatible',
    model: 'google/gemini-3-pro',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    headers: { 'X-Title': 'statewave-guide-provider-reality-check' },
    structuredOutput: 'json_schema',
    temperature: 0,
  },

  // --- via a LiteLLM proxy: whatever the operator has routed ---------------
  {
    // A self-hosted proxy: the model name is whatever the deployment routes.
    // Present so a team already running LiteLLM can benchmark their own routing
    // without adding an adapter.
    id: 'litellm-proxy',
    kind: 'openai-compatible',
    model: 'statewave-benchmark',
    baseUrl: 'http://127.0.0.1:4000/v1',
    apiKeyEnv: 'LITELLM_API_KEY',
    structuredOutput: 'json_schema',
    temperature: 0,
  },
];

/** A one-line description of the settings a run actually used. */
function describeSettings(config: ProviderConfig): string {
  const parts: string[] = [`model=${config.model}`];
  if (config.temperature !== undefined) parts.push(`temperature=${config.temperature}`);
  if (config.effort !== undefined) parts.push(`effort=${config.effort}`);
  if (config.structuredOutput !== undefined) parts.push(`structured=${config.structuredOutput}`);
  if (config.temperature === undefined && config.kind === 'anthropic') {
    // Recorded rather than left blank: a reader comparing stability across
    // providers needs to know this one could not be pinned the same way.
    parts.push('temperature=unsupported-by-api');
  }
  return parts.join(' ');
}

/**
 * Resolves one configured provider against the environment.
 *
 * Reads the credential from `process.env` at the last moment and passes it
 * straight to the adapter. It is never stored on the returned object, so a
 * result can be serialised into a benchmark artefact without leaking anything.
 */
export function resolveProvider(
  config: ProviderConfig,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedProvider {
  const settings = describeSettings(config);

  if (config.kind === 'mock') {
    return { status: 'skipped', config, reason: 'mock providers are not benchmarked' };
  }

  const apiKey = config.apiKeyEnv === undefined ? undefined : env[config.apiKeyEnv];
  if (config.apiKeyEnv !== undefined && (apiKey === undefined || apiKey === '')) {
    return {
      status: 'skipped',
      config,
      reason: `credentials unavailable — ${config.apiKeyEnv} is not set`,
    };
  }

  if (config.kind === 'anthropic') {
    return {
      status: 'ready',
      config,
      settings,
      provider: createAnthropicProvider({
        name: config.id,
        model: config.model,
        ...(apiKey === undefined ? {} : { apiKey }),
        ...(config.effort === undefined ? {} : { effort: config.effort }),
        ...(config.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: config.maxOutputTokens }),
        ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
      }),
    };
  }

  if (config.baseUrl === undefined) {
    return { status: 'skipped', config, reason: 'no baseUrl configured' };
  }

  return {
    status: 'ready',
    config,
    settings,
    provider: createOpenAiCompatibleProvider({
      name: config.id,
      model: config.model,
      baseUrl: config.baseUrl,
      ...(apiKey === undefined ? {} : { apiKey }),
      ...(config.headers === undefined ? {} : { headers: config.headers }),
      ...(config.structuredOutput === undefined
        ? {}
        : { structuredOutput: config.structuredOutput }),
      ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
      ...(config.maxOutputTokens === undefined ? {} : { maxOutputTokens: config.maxOutputTokens }),
      ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
    }),
  };
}

/** Resolves every configured provider. */
export function resolveProviders(
  configs: readonly ProviderConfig[] = DEFAULT_PROVIDERS,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedProvider[] {
  return configs.map((config) => resolveProvider(config, env));
}
