/**
 * Framework-independent traversal over an {@link ApplicationGraph}.
 *
 * Nothing here parses source or touches a file. It answers questions about a
 * graph that has already been built, which is what lets the same code run in
 * the CLI, in a test, and — later — behind a runtime that is explaining a
 * feature to a user.
 *
 * Every answer is structured data. `explainPath` returns evidence records, not
 * prose: turning those into a sentence is a presentation decision, and baking
 * one in here would make the output impossible to render any other way.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode, IndexerDiagnostic } from './graph.js';
import type { ApplicationNodeKind } from './node-id.js';
import { elementId as toElementId } from './node-id.js';
import type { Evidence } from './evidence.js';
import type { Relationship, RelationshipType } from './relationships.js';

/** One hop along a path. */
export interface PathStep {
  relationship: RelationshipType;
  /** Canonical id of the node the hop starts at. */
  source: string;
  /** Canonical id of the node the hop arrives at. */
  target: string;
  confidence: number;
  evidence: Evidence[];
}

/** A structured explanation of one hop. Never natural language. */
export interface PathExplanation extends PathStep {
  /** The resolved source node, when it is present in the graph. */
  sourceNode?: ApplicationNode;
  /** The resolved target node, when it is present in the graph. */
  targetNode?: ApplicationNode;
}

/** Why a feature path stopped where it did. */
export type FeaturePathStopReason =
  /** The chain ran out of behaviour edges. This is the normal terminus. */
  | 'no-further-behaviour'
  /** Continuing would revisit a node already on the path. */
  | 'cycle'
  /** The path hit its depth limit. */
  | 'max-depth'
  /** The starting element is not in the graph at all. */
  | 'start-not-found';

/** A gap in a feature path — something the indexer could not prove. */
export interface FeaturePathGap {
  /** The node the chain stopped at. */
  at: string;
  reason: FeaturePathStopReason;
  /**
   * Diagnostics recorded in any file the chain passed through, including the one
   * it stopped in.
   *
   * Deliberately the whole path rather than just the terminus. The walk is
   * greedy and follows a single branch, so a function that both calls something
   * resolvable and something refused will be walked down the resolvable side —
   * and the refusal, which is exactly what the developer needs to see, would
   * never surface if only the last node's file were consulted.
   *
   * A path that stops is a finding, not a failure. This is what makes the
   * difference between "there is genuinely nothing further" and "a pattern was
   * not understood" visible.
   */
  relatedDiagnostics: IndexerDiagnostic[];
}

/** The deterministic behaviour chain reachable from a UI element. */
export interface FeaturePath {
  /** Canonical id of the starting element. */
  start: string;
  /** The component that contains the element, via an incoming `contains` edge. */
  container?: string;
  /** Routes that reach the container, sorted. */
  routes: string[];
  /** Permissions gating the element or its container, sorted. */
  permissions: string[];
  /** The behaviour chain, in order. Empty when nothing could be proven. */
  path: PathStep[];
  /** Where and why the chain ended. */
  gap: FeaturePathGap;
}

/** Options for {@link GraphQuery.findPath}. */
export interface FindPathOptions {
  /** Only traverse these relationship types. */
  via?: RelationshipType[];
  /** Maximum number of hops. Defaults to 12. */
  maxDepth?: number;
}

/** Options for {@link GraphQuery.resolveFeaturePath}. */
export interface ResolveFeaturePathOptions {
  /** Maximum number of hops. Defaults to 12. */
  maxDepth?: number;
}

/** Read-only queries over a built graph. */
export interface GraphQuery {
  /** The graph this query wraps. */
  readonly graph: ApplicationGraph;
  /** Looks a node up by canonical id. */
  getNode(id: string): ApplicationNode | undefined;
  /** Every node of a kind, sorted by id. */
  nodesOfKind<K extends ApplicationNodeKind>(kind: K): Extract<ApplicationNode, { kind: K }>[];
  /** Relationships leaving a node, sorted by id. */
  getOutgoing(id: string, type?: RelationshipType): Relationship[];
  /** Relationships arriving at a node, sorted by id. */
  getIncoming(id: string, type?: RelationshipType): Relationship[];
  /** Nodes one hop away in either direction, deduplicated and sorted by id. */
  neighbors(id: string): ApplicationNode[];
  /**
   * Shortest path between two nodes, or `undefined` when none exists.
   *
   * Breadth-first, so the result is the fewest hops. Ties are broken by
   * relationship id, which keeps the answer stable across runs.
   */
  findPath(source: string, target: string, options?: FindPathOptions): PathStep[] | undefined;
  /** Resolves each hop's endpoints to nodes. Structured evidence, no prose. */
  explainPath(steps: readonly PathStep[]): PathExplanation[];
  /**
   * Builds the deepest evidence-backed behaviour chain from a UI element.
   *
   * Accepts either a semantic id (`clients.create`) or a canonical node id
   * (`element:clients.create`).
   */
  resolveFeaturePath(
    elementIdOrSemanticId: string,
    options?: ResolveFeaturePathOptions,
  ): FeaturePath;
}

/**
 * Relationship types that carry *behaviour*, in the order a feature chain
 * prefers them.
 *
 * Order matters and is deliberate. From a UI element the interesting question is
 * "what does pressing this do?", so `invokes` comes first; from a handler the
 * next question is "what appears?", so `opens` precedes `calls`. A path that
 * preferred `calls` first would dive into utility functions and never reach the
 * dialog.
 */
const BEHAVIOUR_ORDER: readonly RelationshipType[] = [
  'invokes',
  'opens',
  'renders',
  'submits_to',
  // Ordering below this point is about reaching the most informative terminus.
  //
  // `calls_api` outranks `calls`: once a function both makes a request and calls
  // a helper, the request is the fact worth having. Preferring `calls` walks into
  // shared utilities like `unwrap(response)` and ends the chain in plumbing.
  //
  // `calls` in turn outranks `uses_service`, because a `uses_service` edge points
  // at the service *object*, which has no outgoing behaviour of its own — so
  // preferring it strands the chain one hop short of the endpoint.
  'calls_api',
  'calls',
  'uses_service',
  'navigates_to',
];

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toStep(relationship: Relationship): PathStep {
  return {
    relationship: relationship.type,
    source: relationship.source,
    target: relationship.target,
    confidence: relationship.confidence,
    evidence: relationship.evidence,
  };
}

/** Creates a {@link GraphQuery} over a graph. */
export function createGraphQuery(graph: ApplicationGraph): GraphQuery {
  const byId = new Map<string, ApplicationNode>();
  for (const node of graph.nodes) byId.set(node.id, node);

  const outgoing = new Map<string, Relationship[]>();
  const incoming = new Map<string, Relationship[]>();
  for (const relationship of graph.relationships) {
    const from = outgoing.get(relationship.source);
    if (from) from.push(relationship);
    else outgoing.set(relationship.source, [relationship]);

    const to = incoming.get(relationship.target);
    if (to) to.push(relationship);
    else incoming.set(relationship.target, [relationship]);
  }
  for (const list of outgoing.values()) list.sort((a, b) => compareStrings(a.id, b.id));
  for (const list of incoming.values()) list.sort((a, b) => compareStrings(a.id, b.id));

  /** Diagnostics indexed by file, for explaining why a chain stopped. */
  const diagnosticsByFile = new Map<string, IndexerDiagnostic[]>();
  for (const diagnostic of graph.diagnostics) {
    if (!diagnostic.file) continue;
    const list = diagnosticsByFile.get(diagnostic.file);
    if (list) list.push(diagnostic);
    else diagnosticsByFile.set(diagnostic.file, [diagnostic]);
  }

  function getOutgoing(id: string, type?: RelationshipType): Relationship[] {
    const list = outgoing.get(id) ?? [];
    return type ? list.filter((r) => r.type === type) : [...list];
  }

  function getIncoming(id: string, type?: RelationshipType): Relationship[] {
    const list = incoming.get(id) ?? [];
    return type ? list.filter((r) => r.type === type) : [...list];
  }

  /** Diagnostics from every file the chain touched, deduplicated, in path order. */
  function diagnosticsAlong(nodeIds: readonly string[]): IndexerDiagnostic[] {
    const seenFiles = new Set<string>();
    const collected: IndexerDiagnostic[] = [];
    for (const nodeId of nodeIds) {
      const file = byId.get(nodeId)?.provenance.file;
      if (!file || seenFiles.has(file)) continue;
      seenFiles.add(file);
      collected.push(...(diagnosticsByFile.get(file) ?? []));
    }
    return collected;
  }

  function findPath(
    source: string,
    target: string,
    options: FindPathOptions = {},
  ): PathStep[] | undefined {
    if (source === target) return [];
    if (!byId.has(source) || !byId.has(target)) return undefined;

    const maxDepth = options.maxDepth ?? 12;
    const allowed = options.via ? new Set(options.via) : undefined;

    const cameFrom = new Map<string, Relationship>();
    const seen = new Set<string>([source]);
    let frontier = [source];

    for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
      const next: string[] = [];
      for (const current of frontier) {
        for (const relationship of getOutgoing(current)) {
          if (allowed && !allowed.has(relationship.type)) continue;
          if (seen.has(relationship.target)) continue;
          seen.add(relationship.target);
          cameFrom.set(relationship.target, relationship);
          if (relationship.target === target) {
            const steps: PathStep[] = [];
            let cursor = target;
            while (cursor !== source) {
              const edge = cameFrom.get(cursor);
              if (!edge) return undefined;
              steps.unshift(toStep(edge));
              cursor = edge.source;
            }
            return steps;
          }
          next.push(relationship.target);
        }
      }
      frontier = next;
    }
    return undefined;
  }

  function resolveFeaturePath(
    elementIdOrSemanticId: string,
    options: ResolveFeaturePathOptions = {},
  ): FeaturePath {
    const start = elementIdOrSemanticId.startsWith('element:')
      ? elementIdOrSemanticId
      : toElementId(elementIdOrSemanticId);

    if (!byId.has(start)) {
      return {
        start,
        routes: [],
        permissions: [],
        path: [],
        gap: { at: start, reason: 'start-not-found', relatedDiagnostics: [] },
      };
    }

    const container = getIncoming(start, 'contains')[0]?.source;

    // A route reaches the element when it renders the container, directly or
    // through a chain of `renders` edges.
    const routes = new Set<string>();
    if (container) {
      for (const route of graph.nodes) {
        if (route.kind !== 'route') continue;
        if (route.id === container) continue;
        if (findPath(route.id, container, { via: ['renders'], maxDepth: 6 }))
          routes.add(route.path);
      }
      const direct = getIncoming(container, 'renders');
      for (const edge of direct) {
        const node = byId.get(edge.source);
        if (node?.kind === 'route') routes.add(node.path);
      }
    }

    const permissions = new Set<string>();
    for (const id of [start, ...(container ? [container] : [])]) {
      for (const edge of getOutgoing(id, 'requires_permission')) {
        const node = byId.get(edge.target);
        if (node?.kind === 'permission') permissions.add(node.permission);
      }
    }

    // Walk the behaviour chain greedily. At each node take the highest-priority
    // outgoing behaviour edge that does not revisit the path; ties break by
    // target id so the answer is identical on every run.
    const maxDepth = options.maxDepth ?? 12;
    const path: PathStep[] = [];
    const visited = new Set<string>([start]);
    let current = start;
    let reason: FeaturePathStopReason = 'no-further-behaviour';

    for (let depth = 0; depth < maxDepth; depth += 1) {
      const candidates = getOutgoing(current)
        .filter((r) => BEHAVIOUR_ORDER.includes(r.type))
        .sort((a, b) => {
          const byPriority = BEHAVIOUR_ORDER.indexOf(a.type) - BEHAVIOUR_ORDER.indexOf(b.type);
          return byPriority !== 0 ? byPriority : compareStrings(a.target, b.target);
        });

      const next = candidates.find((r) => !visited.has(r.target));
      if (!next) {
        reason = candidates.length > 0 ? 'cycle' : 'no-further-behaviour';
        break;
      }

      path.push(toStep(next));
      visited.add(next.target);
      current = next.target;

      if (depth === maxDepth - 1) reason = 'max-depth';
    }

    return {
      start,
      ...(container ? { container } : {}),
      routes: [...routes].sort(compareStrings),
      permissions: [...permissions].sort(compareStrings),
      path,
      gap: {
        at: current,
        reason,
        relatedDiagnostics: diagnosticsAlong([start, ...path.map((step) => step.target), current]),
      },
    };
  }

  return {
    graph,
    getNode: (id) => byId.get(id),
    nodesOfKind: <K extends ApplicationNodeKind>(kind: K) =>
      graph.nodes.filter(
        (node): node is Extract<ApplicationNode, { kind: K }> => node.kind === kind,
      ),
    getOutgoing,
    getIncoming,
    neighbors(id) {
      const ids = new Set<string>();
      for (const relationship of getOutgoing(id)) ids.add(relationship.target);
      for (const relationship of getIncoming(id)) ids.add(relationship.source);
      return [...ids]
        .map((nodeId) => byId.get(nodeId))
        .filter((node): node is ApplicationNode => node !== undefined)
        .sort((a, b) => compareStrings(a.id, b.id));
    },
    findPath,
    explainPath: (steps) =>
      steps.map((step) => {
        const sourceNode = byId.get(step.source);
        const targetNode = byId.get(step.target);
        return {
          ...step,
          ...(sourceNode ? { sourceNode } : {}),
          ...(targetNode ? { targetNode } : {}),
        };
      }),
    resolveFeaturePath,
  };
}
