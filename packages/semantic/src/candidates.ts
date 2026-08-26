/**
 * Deterministic feature discovery.
 *
 * **A model never discovers a feature.** Everything a model is ever asked about
 * originates here, in code, from facts the indexer proved. That ordering is the
 * whole safety argument of the pipeline: if discovery were generative, a model
 * could invent a capability the application does not have, and every downstream
 * check — schema, evidence, verification — would be checking the *description*
 * of something that never existed.
 *
 * Discovery walks five roots in priority order, and a lower-priority root is
 * skipped when a higher-priority candidate already covers it. Without that,
 * `clients.create`, the route it lives on, the form it submits and the endpoint
 * that form calls would become four features describing one thing.
 *
 * 1. **Guide elements** — every `element:` node. Highest priority, because the
 *    id is one a developer chose deliberately.
 * 2. **Routes** — a `route:` node no element candidate reached.
 * 3. **Forms** — a `submits_to` source not already covered.
 * 4. **Canonical API endpoints** — an `api:` node observed on *both* tiers, so
 *    the frontend/backend join succeeded, not already covered.
 * 5. **Permission-backed actions** — a `requires_permission` source not covered.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode, Relationship } from '@statewavedev/guide-indexer';
import type { RelationshipType } from '@statewavedev/guide-indexer';
import { compareStrings } from './compare.js';
import { deriveFeatureId, reserveFeatureId } from './feature-id.js';
import { BEHAVIOUR_SPINE, spineRank } from './spine.js';

/** How a candidate came to exist. */
export type CandidateDiscoveryReason =
  'guide-element' | 'route' | 'form' | 'api-endpoint' | 'permission';

/** A feature the pipeline is willing to ask a model about. */
export interface FeatureCandidate {
  /** The feature id. See {@link deriveFeatureId} for the rules. */
  id: string;
  /** `semantic-id` when a developer named it; `derived` when we did. */
  idOrigin: 'semantic-id' | 'derived';
  /** Graph node ids this candidate is rooted at, sorted. */
  rootNodes: string[];
  /** Why this became a candidate. */
  discoveredBy: CandidateDiscoveryReason;
}

/** Options for {@link discoverFeatureCandidates}. */
export interface DiscoverCandidatesOptions {
  /** Cap on candidates, applied after sorting by id. Default: no cap. */
  limit?: number;
}

/**
 * How far coverage reaches from a candidate root.
 *
 * Four hops is enough for the canonical chain — element → handler → service →
 * endpoint — and short enough that one element in a shared layout does not
 * swallow the whole application.
 */
const COVERAGE_DEPTH = 4;

/**
 * Edges coverage may traverse *against* their direction.
 *
 * An element's container and the route above it are found by walking `contains`
 * and `renders` backwards; nothing else is walked backwards, because "something
 * calls this function" does not make that caller part of this feature.
 */
const COVERAGE_BACKWARD: readonly RelationshipType[] = ['contains', 'renders'];

/** Adjacency built once per discovery pass. */
interface Adjacency {
  outgoing: Map<string, Relationship[]>;
  incoming: Map<string, Relationship[]>;
}

function buildAdjacency(relationships: readonly Relationship[]): Adjacency {
  const outgoing = new Map<string, Relationship[]>();
  const incoming = new Map<string, Relationship[]>();
  for (const relationship of relationships) {
    const from = outgoing.get(relationship.source);
    if (from) from.push(relationship);
    else outgoing.set(relationship.source, [relationship]);
    const to = incoming.get(relationship.target);
    if (to) to.push(relationship);
    else incoming.set(relationship.target, [relationship]);
  }
  return { outgoing, incoming };
}

/**
 * Every node a candidate rooted at `roots` speaks for.
 *
 * Forward traversal follows the behaviour spine only. A `uses_hook` or
 * `validates_with` edge is a real fact and belongs in the evidence pack, but it
 * does not make the hook or the schema *part of the feature*, and letting it
 * extend coverage would silently suppress candidates that share a validation
 * schema.
 */
function coverageFrom(roots: readonly string[], adjacency: Adjacency): Set<string> {
  const covered = new Set<string>(roots);
  let frontier = [...roots];
  for (let depth = 0; depth < COVERAGE_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const relationship of adjacency.outgoing.get(id) ?? []) {
        if (spineRank(relationship.type) === BEHAVIOUR_SPINE.length) continue;
        if (covered.has(relationship.target)) continue;
        covered.add(relationship.target);
        next.push(relationship.target);
      }
      for (const relationship of adjacency.incoming.get(id) ?? []) {
        if (!COVERAGE_BACKWARD.includes(relationship.type)) continue;
        if (covered.has(relationship.source)) continue;
        covered.add(relationship.source);
        next.push(relationship.source);
      }
    }
    frontier = next;
  }
  return covered;
}

/** Sources of a relationship type, sorted and de-duplicated. */
function sourcesOf(relationships: readonly Relationship[], type: RelationshipType): string[] {
  const sources = new Set<string>();
  for (const relationship of relationships) {
    if (relationship.type === type) sources.add(relationship.source);
  }
  return [...sources].sort(compareStrings);
}

/**
 * Proposes every feature the graph can justify.
 *
 * The result is sorted by id and is a pure function of the graph *as a set*: two
 * graphs with the same nodes and relationships produce the same candidates, in
 * the same order, with the same ids, whatever order their arrays happened to be
 * in. Every pass iterates nodes sorted by id for that reason.
 */
export function discoverFeatureCandidates(
  graph: ApplicationGraph,
  options?: DiscoverCandidatesOptions,
): FeatureCandidate[] {
  const byId = new Map<string, ApplicationNode>();
  for (const node of graph.nodes) byId.set(node.id, node);
  const adjacency = buildAdjacency(graph.relationships);

  // Sorted here rather than relying on the caller. Two of the passes below carry
  // state — `takenIds`, which decides which of two colliding derived ids keeps
  // the base name, and `covered`, which decides which of two mutually-covering
  // nodes becomes a candidate at all — so array order would otherwise decide
  // both, and the result would be a pure function of the graph's *serialisation*
  // rather than of the graph. The indexer does sort its output, which makes this
  // unreachable through the CLI; `discoverFeatureCandidates` is exported, and a
  // library caller that builds or transforms a graph itself is under no such
  // obligation.
  const nodes = [...graph.nodes].sort((a, b) => compareStrings(a.id, b.id));

  const candidates: FeatureCandidate[] = [];
  const takenIds = new Set<string>();
  const covered = new Set<string>();

  /** Records a candidate and marks everything it speaks for as covered. */
  function claim(node: ApplicationNode, discoveredBy: CandidateDiscoveryReason): void {
    const isSemantic = node.kind === 'element';
    const base = deriveFeatureId(node);
    // A semantic id is adopted verbatim. It cannot collide, because it is the
    // node's own identity and node ids are unique — and if it somehow did, a
    // discriminator would be the wrong answer: renaming a developer's id is
    // exactly the failure this pipeline exists to prevent.
    const id = isSemantic ? base : reserveFeatureId(base, takenIds);
    if (isSemantic) takenIds.add(id);
    candidates.push({
      id,
      idOrigin: isSemantic ? 'semantic-id' : 'derived',
      rootNodes: [node.id],
      discoveredBy,
    });
    for (const reached of coverageFrom([node.id], adjacency)) covered.add(reached);
  }

  // 1. Guide elements. Every one becomes a candidate — never suppressed by
  //    coverage, because two elements in one component are two things a user
  //    can do, and collapsing them would lose the id a developer wrote.
  //    Running this pass first also reserves every semantic id before a single
  //    derived id is minted, so no derived id can ever shadow one.
  for (const node of nodes) {
    if (node.kind === 'element') claim(node, 'guide-element');
  }

  // 2. Routes with no element of their own.
  for (const node of nodes) {
    if (node.kind !== 'route' || covered.has(node.id)) continue;
    claim(node, 'route');
  }

  // 3. Forms whose submit target nothing else speaks for.
  for (const source of sourcesOf(graph.relationships, 'submits_to')) {
    if (covered.has(source)) continue;
    const node = byId.get(source);
    if (node === undefined) continue;
    claim(node, 'form');
  }

  // 4. Endpoints proven on both tiers. A frontend-only endpoint is a call to
  //    something we never found, and a backend-only one is a route nothing
  //    reaches; neither is a feature a user can be shown.
  for (const node of nodes) {
    if (node.kind !== 'api' || covered.has(node.id)) continue;
    if (!node.observedOn.includes('frontend') || !node.observedOn.includes('backend')) continue;
    claim(node, 'api-endpoint');
  }

  // 5. Permission-gated actions that surfaced nowhere else.
  for (const source of sourcesOf(graph.relationships, 'requires_permission')) {
    if (covered.has(source)) continue;
    const node = byId.get(source);
    if (node === undefined) continue;
    claim(node, 'permission');
  }

  candidates.sort((a, b) => compareStrings(a.id, b.id));
  const limit = options?.limit;
  return limit === undefined || limit < 0 ? candidates : candidates.slice(0, limit);
}
