/**
 * The deterministic mock provider.
 *
 * There is no vendor adapter in this package, and that is a decision rather
 * than an omission: no credentials exist in this environment, and an untested
 * HTTP client for a paid API is worse than none — it looks finished, it cannot
 * be exercised, and it invites someone to trust it.
 *
 * What exists instead is a provider that is *better* for the thing this package
 * actually has to prove:
 *
 * - **Scriptable.** A test can inject an exact response, including a hostile
 *   one — an invented graph id, a renamed feature id, a fabricated route — and
 *   watch the verifier refuse it.
 * - **Recording.** Every call keeps its system instruction and its evidence
 *   verbatim, which is how the injection tests assert that untrusted text never
 *   escaped the data block.
 * - **Deterministic.** Same request, same answer, byte for byte, on every
 *   machine. No clock, no randomness: latency is reported as zero because a real
 *   duration would make an otherwise identical run differ.
 *
 * Unscripted, it derives a plausible, evidence-respecting answer from the
 * evidence pack itself — titles from the feature id, references only to ids
 * present in the pack — so the whole pipeline is runnable end to end without a
 * provider key.
 *
 * @packageDocumentation
 */

import type {
  SemanticGenerationRequest,
  SemanticGenerationResult,
  SemanticModelProvider,
  SemanticProviderErrorCode,
  SemanticUsage,
} from '../provider.js';
import { compareStrings } from '../compare.js';
import { EVIDENCE_FENCE_CLOSE, EVIDENCE_FENCE_OPEN } from '../prompt.js';

/** One call the mock received, kept verbatim. */
export interface RecordedCall {
  /** The request's task name. */
  task: string;
  /** The trusted instruction, exactly as sent. */
  system: string;
  /** The untrusted data block, exactly as sent. */
  evidence: string;
  /** Feature id read out of the data block, when it had one. */
  featureId?: string;
  /** The script key that answered, or `default`. */
  matched: string;
}

/** How a test tells the mock what to say. */
export interface MockScript {
  /** Keyed by `${task}:${featureId}` or task alone; falls back to a default. */
  responses?: Record<string, unknown>;
  /** Return a raw value that will fail schema validation, to test that path. */
  malformed?: string[];
  fail?: Record<string, SemanticProviderErrorCode>;
}

/** The key used when nothing more specific matches. */
export const MOCK_DEFAULT_KEY = 'default';

/** The mock's adapter name, recorded on everything it generates. */
export const MOCK_PROVIDER_NAME = 'mock';

/** The mock's model identifier. */
export const MOCK_PROVIDER_MODEL = 'deterministic-mock-1';

/** The raw text returned for a key listed in {@link MockScript.malformed}. */
export const MALFORMED_RESPONSE = '{"title":12345,"description":null,"id":"renamed-by-the-model"}';

/** One node, as the mock reads it back out of the data block. */
interface ParsedNode {
  id: string;
  kind: string;
  /** What this fact is to the feature: `belongs`, `reaches`, `context`, `other`. */
  scope?: string;
  name?: string;
  facts: Record<string, string>;
}

/**
 * True for a fact this feature may speak for.
 *
 * `belongs` always. `reaches` only for a route, which is a destination a
 * feature legitimately names without owning what is on it.
 */
function belongsToFeature(node: ParsedNode): boolean {
  if (node.scope === undefined) return true;
  if (node.scope === 'belongs') return true;
  return node.scope === 'reaches' && node.kind === 'route';
}

/** One relationship, as the mock reads it back out of the data block. */
interface ParsedRelationship {
  id: string;
  type: string;
  source: string;
  target: string;
}

/** What the mock could read out of a data block. */
interface ParsedEvidence {
  featureId?: string;
  root?: string;
  nodes: ParsedNode[];
  nodeIds: string[];
  elementIds: string[];
  relationships: ParsedRelationship[];
  routes: string[];
  permissions: string[];
  relationshipCount: number;
  unknownCount: number;
}

const EMPTY_EVIDENCE: ParsedEvidence = {
  nodes: [],
  nodeIds: [],
  elementIds: [],
  relationships: [],
  routes: [],
  permissions: [],
  relationshipCount: 0,
  unknownCount: 0,
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** A `facts` object, with only its string-valued entries kept. */
function asFacts(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null) return {};
  const facts: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') facts[key] = entry;
  }
  return facts;
}

/**
 * Reads the data block back into the facts the default answer needs.
 *
 * Total by construction: the mock is handed untrusted text and must never throw
 * on it, because a test that scripts hostile evidence is testing the pipeline,
 * not the mock's parser.
 */
function parseEvidence(evidence: string): ParsedEvidence {
  const start = evidence.indexOf(EVIDENCE_FENCE_OPEN);
  const end = evidence.lastIndexOf(EVIDENCE_FENCE_CLOSE);
  const body =
    start === -1 || end === -1 || end < start
      ? evidence
      : evidence.slice(start + EVIDENCE_FENCE_OPEN.length, end);

  let document: unknown;
  try {
    document = JSON.parse(body);
  } catch {
    return EMPTY_EVIDENCE;
  }
  if (typeof document !== 'object' || document === null) return EMPTY_EVIDENCE;

  const record = document as Record<string, unknown>;
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  const nodes: ParsedNode[] = [];
  const nodeIds: string[] = [];
  const elementIds: string[] = [];
  for (const node of rawNodes) {
    if (typeof node !== 'object' || node === null) continue;
    const entry = node as Record<string, unknown>;
    if (typeof entry.id !== 'string' || typeof entry.kind !== 'string') continue;
    nodes.push({
      id: entry.id,
      kind: entry.kind,
      ...(typeof entry.scope === 'string' ? { scope: entry.scope } : {}),
      ...(typeof entry.name === 'string' ? { name: entry.name } : {}),
      facts: asFacts(entry.facts),
    });
    nodeIds.push(entry.id);
    if (entry.kind === 'element') elementIds.push(entry.id);
  }

  const rawRelationships = Array.isArray(record.relationships) ? record.relationships : [];
  const relationships: ParsedRelationship[] = [];
  for (const relationship of rawRelationships) {
    if (typeof relationship !== 'object' || relationship === null) continue;
    const entry = relationship as Record<string, unknown>;
    if (
      typeof entry.id !== 'string' ||
      typeof entry.type !== 'string' ||
      typeof entry.source !== 'string' ||
      typeof entry.target !== 'string'
    ) {
      continue;
    }
    relationships.push({
      id: entry.id,
      type: entry.type,
      source: entry.source,
      target: entry.target,
    });
  }

  return {
    ...(typeof record.featureId === 'string' ? { featureId: record.featureId } : {}),
    ...(typeof record.root === 'string' ? { root: record.root } : {}),
    nodes: nodes.sort((a, b) => compareStrings(a.id, b.id)),
    nodeIds: nodeIds.sort(compareStrings),
    elementIds: elementIds.sort(compareStrings),
    relationships: relationships.sort((a, b) => compareStrings(a.id, b.id)),
    routes: asStringArray(record.routes).sort(compareStrings),
    permissions: asStringArray(record.permissions).sort(compareStrings),
    relationshipCount: rawRelationships.length,
    unknownCount: asStringArray(record.unknown).length,
  };
}

/** Verbs that read better in front of their noun. */
const LEADING_VERBS = new Set([
  'add',
  'archive',
  'assign',
  'close',
  'create',
  'delete',
  'edit',
  'export',
  'filter',
  'import',
  'list',
  'new',
  'open',
  'remove',
  'save',
  'search',
  'submit',
  'update',
  'view',
]);

function clamp(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit).trimEnd();
}

/** `clients.create` → `Create clients`. Deterministic, and only ever language. */
function titleFrom(featureId: string): string {
  const words = featureId.split(/[.\-_/]/).filter((word) => word !== '');
  if (words.length === 0) return 'Untitled feature';
  const last = words[words.length - 1] ?? '';
  const ordered = LEADING_VERBS.has(last) ? [last, ...words.slice(0, -1)] : words;
  const sentence = ordered.join(' ');
  return clamp(`${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`, 80);
}

/**
 * How far the mock treats the evidence as speaking for the feature.
 *
 * Four hops, matching the depth candidate discovery and the verifier's subject
 * closure both use, so a claim the mock proposes is one the verifier can
 * actually resolve rather than one it will refuse on a technicality.
 */
const SUBJECT_DEPTH = 4;

/** Which capability verb an HTTP method is evidence for, per the built-in matrix. */
const METHOD_ACTIONS: Record<string, string> = {
  POST: 'create',
  PATCH: 'update',
  PUT: 'update',
  DELETE: 'delete',
  GET: 'view',
};

/** `/clients/:clientId` → `clients`; a path with nothing nameable → `records`. */
function nounFromPath(path: string): string {
  const segments = path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && !segment.startsWith(':') && !segment.startsWith('*'));
  const last = segments[segments.length - 1];
  return last === undefined || last === '' ? 'records' : last.replace(/[^A-Za-z0-9-]/g, '');
}

/** Everything reachable from the root along the pack's own relationships. */
function subjectChain(parsed: ParsedEvidence): Set<string> {
  const outgoing = new Map<string, ParsedRelationship[]>();
  for (const relationship of parsed.relationships) {
    const list = outgoing.get(relationship.source);
    if (list) list.push(relationship);
    else outgoing.set(relationship.source, [relationship]);
  }
  const root = parsed.root;
  const reached = new Set<string>(root === undefined ? [] : [root]);
  let frontier = [...reached];
  for (let hop = 0; hop < SUBJECT_DEPTH && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const relationship of outgoing.get(id) ?? []) {
        if (reached.has(relationship.target)) continue;
        reached.add(relationship.target);
        next.push(relationship.target);
      }
    }
    frontier = next;
  }
  return reached;
}

/**
 * The answer the mock derives when no script covers the call.
 *
 * Every claim it proposes is built out of relationships that are *in the pack*
 * and run from the feature's own chain, so an unscripted run produces a Product
 * Model that genuinely survives verification rather than a pile of refusals. It
 * is still only a mock: it reads the evidence mechanically and writes flat
 * sentences, which is exactly what a deterministic stand-in should do.
 */
function defaultFeatureResponse(parsed: ParsedEvidence): unknown {
  const featureId = parsed.featureId ?? parsed.root ?? 'unknown-feature';
  const subjectRef = `feature:${featureId}`;
  const title = titleFrom(featureId);
  const lower = title.toLowerCase();
  const byId = new Map(parsed.nodes.map((node) => [node.id, node]));
  const chain = subjectChain(parsed);

  const capabilities: unknown[] = [];
  const permissions: unknown[] = [];
  const navigation: unknown[] = [];
  const steps: unknown[] = [];

  for (const relationship of parsed.relationships) {
    if (!chain.has(relationship.source)) continue;
    const target = byId.get(relationship.target);
    if (target === undefined) continue;
    // Same reason as the step loop below: an edge is the feature's to cite only
    // when both ends are. A navigation link reaches the destination page, so
    // without this it would claim the destination's permission requirement as
    // its own.
    const source = byId.get(relationship.source);
    if (source !== undefined && !belongsToFeature(source)) continue;
    if (!belongsToFeature(target)) continue;

    if (relationship.type === 'calls_api' && target.kind === 'api') {
      const path = target.facts.path ?? '';
      // An endpoint the indexer could not resolve is not an endpoint we have.
      if (path.startsWith('?')) continue;
      const action = METHOD_ACTIONS[target.facts.method ?? ''];
      if (action === undefined) continue;
      capabilities.push({
        type: 'capability',
        text: clamp(
          `${nounFromPath(path)} can be ${action === 'view' ? 'viewed' : `${action}d`}.`,
          200,
        ),
        subjectRef,
        action,
        targets: [relationship.id, relationship.target],
      });
      continue;
    }
    if (relationship.type === 'requires_permission' && target.kind === 'permission') {
      const permission = target.name;
      if (permission === undefined || !parsed.permissions.includes(permission)) continue;
      permissions.push({
        type: 'permission',
        text: clamp(`Using this requires the ${permission} permission.`, 200),
        subjectRef,
        permission,
        targets: [relationship.id, relationship.target],
      });
      continue;
    }
    if (relationship.type === 'navigates_to' && target.kind === 'route') {
      const route = target.name;
      if (route === undefined || !parsed.routes.includes(route)) continue;
      navigation.push({
        type: 'navigation',
        text: clamp(`This leads to ${route}.`, 200),
        subjectRef,
        route,
        targets: [relationship.id, relationship.target],
      });
    }
  }

  // Steps come from the feature's own chain, not from the whole pack: a pack
  // holds every sibling control on the same page, and listing them all would
  // have "create a client" instruct a user to press delete.
  for (const node of parsed.nodes) {
    if (!chain.has(node.id)) continue;
    if (node.kind !== 'element' && node.kind !== 'route') continue;
    // The chain alone is not enough. A navigation link's chain runs through
    // the route it points at and into the destination page's controls, so a
    // "go to Clients" feature would list every button on the clients page as
    // one of its own steps. The scope label says which facts are the feature's
    // to speak for; a model that ignores it gets TARGET_OUT_OF_SCOPE, and a
    // stand-in for a well-behaved model should not need to be told twice.
    //
    // A route it merely *reaches* is the exception, and the reason `reaches`
    // exists as a class of its own: "then you land on the client's page" is a
    // step, where "then you press the button on that page" is someone else's
    // feature.
    if (!belongsToFeature(node)) continue;
    steps.push({
      type: 'workflow_step',
      text: clamp(`Use ${node.name ?? node.id}.`, 200),
      subjectRef,
      targets: [node.id],
    });
  }

  const factualClaims = [...capabilities, ...permissions, ...navigation, ...steps].slice(0, 12);
  const languageTargets = parsed.root === undefined ? [] : [parsed.root];

  return {
    title,
    description: clamp(
      `Lets a user ${lower}${parsed.routes.length > 0 ? ` on ${parsed.routes.join(', ')}` : ''}.`,
      400,
    ),
    factualClaims,
    languageClaims: [
      {
        type: 'purpose',
        text: clamp(`Someone uses this when they need to ${lower}.`, 160),
        targets: languageTargets,
      },
      {
        type: 'user_question',
        text: clamp(`How do I ${lower}?`, 160),
        targets: languageTargets,
      },
    ],
    confidenceReason: clamp(
      `Derived only from the ${parsed.nodeIds.length} nodes and ${parsed.relationshipCount} relationships in the evidence pack; ${parsed.unknownCount} facts were refused as unknown and were not filled in.`,
      400,
    ),
  };
}

/** The workflow the mock derives when no script covers the call. */
function defaultWorkflowResponse(parsed: ParsedEvidence): unknown {
  const featureId = parsed.featureId ?? parsed.root ?? 'unknown-feature';
  const ordered = parsed.elementIds.length > 0 ? parsed.elementIds : parsed.nodeIds;
  return {
    title: clamp(`${titleFrom(featureId)} steps`, 80),
    steps: ordered.slice(0, 12).map((id) => ({
      text: clamp(`Use ${id}.`, 200),
      targets: [id],
    })),
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Creates a deterministic provider.
 *
 * @param script Exact responses, forced failures and malformed payloads, keyed
 * by `${task}:${featureId}`, then by `task`, then by `default`.
 */
export function createMockProvider(
  script: MockScript = {},
): SemanticModelProvider & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  function resolveKey(task: string, featureId: string | undefined, keys: Iterable<string>): string {
    const available = new Set(keys);
    if (featureId !== undefined && available.has(`${task}:${featureId}`)) {
      return `${task}:${featureId}`;
    }
    if (available.has(task)) return task;
    return available.has(MOCK_DEFAULT_KEY) ? MOCK_DEFAULT_KEY : '';
  }

  return {
    name: MOCK_PROVIDER_NAME,
    model: MOCK_PROVIDER_MODEL,
    calls,
    generateStructured<T>(
      request: SemanticGenerationRequest<T>,
    ): Promise<SemanticGenerationResult<T>> {
      const parsed = parseEvidence(request.evidence);
      const usage = (raw: string): SemanticUsage => ({
        inputTokens: estimateTokens(request.system) + estimateTokens(request.evidence),
        outputTokens: estimateTokens(raw),
        costUsd: 0,
        // Zero, not a measurement: a wall clock would make two identical runs
        // produce different output, which is the one thing this package forbids.
        latencyMs: 0,
      });

      const failKey = resolveKey(request.task, parsed.featureId, Object.keys(script.fail ?? {}));
      const malformedKey = resolveKey(request.task, parsed.featureId, script.malformed ?? []);
      const responseKey = resolveKey(
        request.task,
        parsed.featureId,
        Object.keys(script.responses ?? {}),
      );
      const matched =
        failKey !== ''
          ? failKey
          : malformedKey !== ''
            ? malformedKey
            : responseKey !== ''
              ? responseKey
              : MOCK_DEFAULT_KEY;

      calls.push({
        task: request.task,
        system: request.system,
        evidence: request.evidence,
        ...(parsed.featureId === undefined ? {} : { featureId: parsed.featureId }),
        matched,
      });

      if (request.signal?.aborted === true) {
        return Promise.resolve({
          success: false,
          error: { code: 'cancelled', message: 'The request was aborted before it was sent.' },
          usage: usage(''),
        });
      }

      if (failKey !== '') {
        const code = script.fail?.[failKey] ?? 'provider_error';
        return Promise.resolve({
          success: false,
          error: { code, message: `The mock provider was scripted to fail with ${code}.` },
          usage: usage(''),
        });
      }

      // A raw string that is not the shape the schema wants. This is the path a
      // real provider takes far more often than anyone expects.
      if (malformedKey !== '') {
        const parsedRaw: unknown = JSON.parse(MALFORMED_RESPONSE);
        const outcome = request.schema.safeParse(parsedRaw);
        if (outcome.success) {
          /* c8 ignore next 5 -- only reachable if a caller passes a schema that accepts anything. */
          return Promise.resolve({
            success: true,
            data: outcome.data,
            usage: usage(MALFORMED_RESPONSE),
            raw: MALFORMED_RESPONSE,
          });
        }
        return Promise.resolve({
          success: false,
          error: { code: 'schema_violation', message: outcome.error.message },
          usage: usage(MALFORMED_RESPONSE),
        });
      }

      const scripted = responseKey === '' ? undefined : script.responses?.[responseKey];
      const wantsWorkflow = request.task.toLowerCase().includes('workflow');
      const candidates: unknown[] =
        scripted !== undefined
          ? [scripted]
          : wantsWorkflow
            ? [defaultWorkflowResponse(parsed), defaultFeatureResponse(parsed)]
            : [defaultFeatureResponse(parsed), defaultWorkflowResponse(parsed)];

      let firstError = 'The mock produced no response for this schema.';
      for (const candidate of candidates) {
        const outcome = request.schema.safeParse(candidate);
        if (outcome.success) {
          const raw = JSON.stringify(candidate);
          return Promise.resolve({ success: true, data: outcome.data, usage: usage(raw), raw });
        }
        if (candidate === candidates[0]) firstError = outcome.error.message;
      }

      return Promise.resolve({
        success: false,
        error: { code: 'schema_violation', message: firstError },
        usage: usage(''),
      });
    },
  };
}
