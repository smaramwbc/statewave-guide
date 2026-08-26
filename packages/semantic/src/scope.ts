/**
 * Which graph facts a feature may speak for.
 *
 * `spine.ts` answers "which relationships carry behaviour". This module answers
 * the question underneath it, which the pipeline got wrong until Round 1
 * measured it: *whose* behaviour. An evidence pack is a neighbourhood, and a
 * neighbourhood contains siblings. A claim can be true of the application, cite
 * real relationships, satisfy every dimension of its verification rule, and
 * still be about the feature next door.
 *
 * That is not hypothetical. `settings.new-key` — a `<code>` element that
 * displays a rotated API key — was given the settings form's submit capability,
 * because `element:settings.form` sits in its pack and the form really does
 * submit. Both gates the verifier had were satisfied: the subject was a *known*
 * identity and the evidence was real. Neither gate asked whether the subject
 * was *this feature's*.
 *
 * The rule this module enforces is a path, never a distance:
 *
 * > A feature owns what it reaches by walking **forward** out of its own roots
 * > along edges that describe behaviour. It never owns what it reaches by
 * > walking an edge **backwards** and descending somewhere else.
 *
 * `settings.new-key` has no outgoing edges at all. Its only route to the form is
 * up a `contains` edge into the shared page and back down into a sibling, so it
 * owns exactly itself — and the claim is refused. A feature genuinely rooted at
 * the form owns `submits_to` on its first hop, so the identical claim still
 * verifies there. Wrong feature rejects, right feature accepts, and the
 * difference is the direction of one edge.
 *
 * Two boundaries stop ownership from swallowing the application, and neither is
 * a hop count:
 *
 * - **The endpoint is the frontier.** A feature owns the identity of the API it
 *   calls. It does not own the controller behind it, the repository under that,
 *   or `db.query`. Those are how the product is built, not what it does, and
 *   they are {@link ScopeClass} `REACHABLE`.
 * - **Shared infrastructure is nobody's feature.** A node reached along a
 *   structural edge that many other nodes also reach along that same edge is
 *   shared: `lib/http.ts#unwrap` has thirteen callers, `db.ts#query` eleven,
 *   `hasPermission` five. Measured on the fixture, fan-in separates these
 *   cleanly from feature-specific functions, which have exactly one caller.
 *
 * @packageDocumentation
 */

import type { ApplicationNode, Relationship, RelationshipType } from '@statewavedev/guide-indexer';
import { compareStrings } from './compare.js';

/**
 * Edges a feature owns what it reaches through, and keeps walking.
 *
 * Each one answers "and then what happens?": the container holds the control,
 * the control invokes the handler, the handler opens the dialog, the dialog
 * renders the form, the form submits, the service calls the endpoint. A user
 * pressing the button causes every step, so the feature answers for all of them.
 *
 * `uses_hook` and `uses_service` are here deliberately. A hook is a *delegation
 * of behaviour* — `ClientsPage` gets its rows through `useClients`, and severing
 * that edge severs the page from the endpoint that fills it. `validates_with` is
 * not here for the opposite reason: a schema is a property of a step, not
 * another step.
 *
 * `navigates_to` is not here either. See {@link REACH_FORWARD}.
 */
export const OWNERSHIP_FORWARD: readonly RelationshipType[] = [
  'contains',
  'invokes',
  'opens',
  'renders',
  'submits_to',
  'calls',
  'calls_api',
  'requires_permission',
  'uses_hook',
  'uses_service',
];

/**
 * Edges that hand control elsewhere without handing over ownership.
 *
 * A link to `/clients` owns *the act of navigating*. It does not own the clients
 * page, the component that page renders, or the fourteen elements inside it —
 * continuing through this edge would swallow the destination feature whole,
 * which is the sibling failure entered from the other end. So the destination is
 * recorded and the walk stops.
 *
 * That is still everything the rules need: `navigation` and `capability/navigate`
 * require a route the subject *points at*, never one it owns.
 */
export const REACH_FORWARD: readonly RelationshipType[] = ['navigates_to'];

/**
 * Structural edges whose targets are shared rather than owned.
 *
 * The three edge types along which "many things reach this" means "this belongs
 * to no one of them". A button rendered by eight pages is the design system; a
 * function called by thirteen call sites is a utility. Fan-in is measured on the
 * edge type, not overall, because the same node can be shared as a component and
 * specific as a caller.
 *
 * `calls_api` is deliberately absent: two features may legitimately create a
 * client, and both own `POST /api/clients` — the endpoint's identity is exactly
 * what a capability claim is about. `requires_permission` is absent for the same
 * reason; a permission gating twelve controls still gates this one.
 */
export const SHARED_WHEN_FANNED_IN: readonly RelationshipType[] = ['contains', 'renders', 'calls'];

/**
 * Edges walked *against* their direction, from the roots only, to find where a
 * feature lives.
 *
 * A feature needs to know its page and its route: `capability/view` accepts a
 * route or component witness, and a reader wants to be told where to go. But
 * ancestry is a property of the **roots**, not of everything owned. Seeding this
 * walk from every owned node is how a shared primitive becomes a bridge —
 * `primitives/Button` has eight incoming `renders`, so walking back out of it
 * reaches every page in the application and makes them all "where this feature
 * lives". Measured, that turned four unrelated pages into context for
 * `clients.create`.
 *
 * The walk chains upward — component, then the route rendering it — and may
 * never turn around. That single restriction is the difference between the bug
 * and the positive control.
 */
export const CONTEXT_BACKWARD: readonly RelationshipType[] = ['contains', 'renders'];

/**
 * One step to a fact *about* an owned node that is not another step of it.
 *
 * A `constraint` claim must cite the schema its subject validates with, so the
 * schema has to be citable. It is not owned and is never expanded, which stops a
 * schema shared by two endpoints from bridging their features.
 */
export const CONTEXT_LEAF: readonly RelationshipType[] = ['validates_with'];

/**
 * What a node is to one feature.
 *
 * Four answers where the pipeline previously had two ("in the pack" and "not"),
 * because a pack holds four genuinely different things: what this feature does,
 * what it hands off to, where it lives, and what merely sits beside it.
 * Collapsing the last into the first is the whole of the Round 1 defect.
 *
 * `OUTSIDE` is an answer, not an absence. A node may be in this feature's
 * evidence on purpose — so the model can see what the feature is *not* — and
 * still be something the feature may never speak for.
 */
export type ScopeClass = 'OWNED' | 'REACHABLE' | 'CONTEXTUAL' | 'OUTSIDE';

/**
 * Why a node carries the class it carries.
 *
 * Recorded rather than recomputed, because the two `CONTEXTUAL` bases are not
 * interchangeable and the verifier has to tell them apart. A schema may satisfy
 * a rule dimension; the page a feature sits on may not — otherwise
 * `workflow_step`, which constrains only `nodeKinds`, accepts any page in the
 * pack and the misattribution simply moves one node up.
 */
export type ScopeBasis =
  /** A root the candidate was discovered at. Ownership by definition. */
  | 'root'
  /** Reached forward from a root along {@link OWNERSHIP_FORWARD}. */
  | 'ownership-path'
  /** One `navigates_to` step out of an owned node. Terminal. */
  | 'reach-edge'
  /** Behind an endpoint this feature owns — controller, repository, `db.query`. */
  | 'behind-endpoint'
  /** Reached along a structural edge that many other nodes also reach. */
  | 'shared-infrastructure'
  /** Reached upward from a **root** along `contains`/`renders`. Never a witness. */
  | 'containment-ancestor'
  /** One `validates_with` step out of an owned node. May be a witness. */
  | 'supporting-detail';

/** One edge of an ownership path, in the direction the graph actually has it. */
export interface OwnershipStep {
  relationship: RelationshipType;
  source: string;
  target: string;
}

/**
 * One node's place in one feature.
 *
 * `path` is the evidence for `scope`, not decoration. "Why does `clients.create`
 * own `api:POST:/api/clients`?" is answerable as
 * `invokes > opens > renders > submits_to > calls > calls_api`, and
 * every hop is checkable against the graph. An ownership claim nobody can
 * retrace is an assertion, and this pipeline does not make those.
 */
export interface ScopeEntry {
  nodeId: string;
  scope: Exclude<ScopeClass, 'OUTSIDE'>;
  basis: ScopeBasis;
  /** The chain from a root. Empty exactly for a root. */
  path: readonly OwnershipStep[];
}

/** Everything one feature may speak for, and everything it may not. */
export interface FeatureScope {
  readonly featureId: string;
  /** Discovery's roots, sorted. */
  readonly roots: readonly string[];
  /** `OUTSIDE` for anything unclassified, including nodes in no pack at all. */
  classify(nodeId: string): ScopeClass;
  entry(nodeId: string): ScopeEntry | undefined;
  /** The chain from a root, or `undefined` when the node is `OUTSIDE`. */
  ownershipPath(nodeId: string): readonly OwnershipStep[] | undefined;
  /**
   * May this node be the witness that satisfies a verification rule dimension?
   *
   * Narrower than "is it in scope". A page the feature sits on is legitimate
   * *context* — a reader wants to be told where to go — but it proves nothing
   * about the feature, and `workflow_step` constrains only `nodeKinds`, so
   * without this distinction any page in the pack satisfies it. Measured on the
   * fixture, that accepted 203 of 203 cross-page citations, including
   * `clients.create` describing the settings page.
   */
  canWitness(nodeId: string): boolean;
  /**
   * Forward closure from one in-scope node, over ownership edges.
   *
   * Not derived from {@link ScopeEntry.path}: that is the lexicographically
   * least *shortest* path, so a node genuinely downstream of `nodeId` may have
   * been discovered by a shorter route and would fail a prefix test.
   * `permission:clients:create` is reachable from `element:clients.create` in
   * one hop and from `api:POST:/api/clients` in seven; a prefix test would deny
   * the endpoint a permission it demonstrably requires.
   */
  reachableFrom(nodeId: string): ReadonlySet<string>;
  /** Every classified node, sorted by id. */
  entries(): readonly ScopeEntry[];
  /** Counts per class, for scope-health reporting. */
  summary(): { owned: number; reachable: number; contextual: number };
}

/** What {@link computeFeatureScope} needs to see. */
export interface FeatureScopeInput {
  featureId: string;
  roots: readonly string[];
  /** Nodes the pack builder considered — already safety-filtered. */
  nodes: readonly ApplicationNode[];
  /** Relationships among those nodes — already safety-filtered. */
  relationships: readonly Relationship[];
}

/** A node id naming an API endpoint — the ownership frontier. */
function isEndpoint(nodeId: string): boolean {
  return nodeId.startsWith('api:');
}

/**
 * Computes one feature's scope.
 *
 * Deterministic in every respect: the walks are breadth-first over
 * relationships sorted by id, so a node discovered by two paths of equal length
 * keeps the lexicographically least one, and two runs over the same graph
 * produce byte-identical entries.
 *
 * A model never participates. By the time a response exists the scope is
 * already fixed, and the response is checked against it.
 */
export function computeFeatureScope(input: FeatureScopeInput): FeatureScope {
  const edges = [...input.relationships].sort((a, b) => compareStrings(a.id, b.id));
  const known = new Set(input.nodes.map((node) => node.id));

  const outgoing = new Map<string, Relationship[]>();
  const incoming = new Map<string, Relationship[]>();
  for (const edge of edges) {
    (outgoing.get(edge.source) ?? outgoing.set(edge.source, []).get(edge.source))!.push(edge);
    (incoming.get(edge.target) ?? incoming.set(edge.target, []).get(edge.target))!.push(edge);
  }

  /** How many nodes reach `target` along `type`. The shared-infrastructure test. */
  const fanIn = (target: string, type: RelationshipType): number => {
    let count = 0;
    for (const edge of incoming.get(target) ?? []) {
      if (edge.type === type) count += 1;
    }
    return count;
  };

  const entries = new Map<string, ScopeEntry>();
  const record = (
    nodeId: string,
    scope: Exclude<ScopeClass, 'OUTSIDE'>,
    basis: ScopeBasis,
    path: readonly OwnershipStep[],
  ): boolean => {
    if (entries.has(nodeId)) return false;
    if (!known.has(nodeId)) return false;
    entries.set(nodeId, { nodeId, scope, basis, path });
    return true;
  };

  const step = (edge: Relationship): OwnershipStep => ({
    relationship: edge.type,
    source: edge.source,
    target: edge.target,
  });

  const roots = [...input.roots].sort(compareStrings);

  // Pass 1 — the roots. Ownership by definition.
  for (const root of roots) record(root, 'OWNED', 'root', []);

  // Pass 2 — forward from the roots, stopping at the two boundaries.
  const ownedQueue: string[] = [...entries.keys()];
  const deferred: { edge: Relationship; path: readonly OwnershipStep[] }[] = [];
  while (ownedQueue.length > 0) {
    const current = ownedQueue.shift()!;
    // The endpoint is the frontier: its identity is owned, what implements it
    // is not. Everything past this point is recorded in pass 3 as REACHABLE.
    if (isEndpoint(current) && entries.get(current)?.basis !== 'root') continue;
    const path = entries.get(current)?.path ?? [];

    for (const edge of outgoing.get(current) ?? []) {
      if (!OWNERSHIP_FORWARD.includes(edge.type)) continue;
      if (entries.has(edge.target)) continue;
      const next = [...path, step(edge)];

      if (SHARED_WHEN_FANNED_IN.includes(edge.type) && fanIn(edge.target, edge.type) > 1) {
        // Shared infrastructure. Recorded so a claim may still cite it, never
        // expanded, so one design-system button cannot bridge two features.
        deferred.push({ edge, path: next });
        continue;
      }

      if (record(edge.target, 'OWNED', 'ownership-path', next)) ownedQueue.push(edge.target);
    }
  }

  for (const { edge, path } of deferred) {
    record(edge.target, 'REACHABLE', 'shared-infrastructure', path);
  }

  // Pass 3 — behind the endpoints this feature owns. How it is implemented.
  const ownedEndpoints = [...entries.values()]
    .filter((entry) => entry.scope === 'OWNED' && isEndpoint(entry.nodeId))
    .map((entry) => entry.nodeId)
    .sort(compareStrings);
  const behindQueue = [...ownedEndpoints];
  while (behindQueue.length > 0) {
    const current = behindQueue.shift()!;
    const path = entries.get(current)?.path ?? [];
    for (const edge of outgoing.get(current) ?? []) {
      if (!OWNERSHIP_FORWARD.includes(edge.type)) continue;
      if (entries.has(edge.target)) continue;
      if (record(edge.target, 'REACHABLE', 'behind-endpoint', [...path, step(edge)])) {
        behindQueue.push(edge.target);
      }
    }
  }

  // Pass 4 — one navigation step out. Terminal by construction.
  for (const entry of [...entries.values()].sort((a, b) => compareStrings(a.nodeId, b.nodeId))) {
    if (entry.scope !== 'OWNED') continue;
    for (const edge of outgoing.get(entry.nodeId) ?? []) {
      if (!REACH_FORWARD.includes(edge.type)) continue;
      record(edge.target, 'REACHABLE', 'reach-edge', [...entry.path, step(edge)]);
    }
  }

  // Pass 5 — where the feature lives. From the ROOTS, upward only.
  let ancestors = roots;
  const seenAncestors = new Set<string>(roots);
  while (ancestors.length > 0) {
    const next: string[] = [];
    for (const child of ancestors) {
      for (const edge of incoming.get(child) ?? []) {
        if (!CONTEXT_BACKWARD.includes(edge.type)) continue;
        if (seenAncestors.has(edge.source)) continue;
        seenAncestors.add(edge.source);
        // The edge is recorded in the direction the graph has it — pointing
        // down at the feature. Reversing it to make the array read uniformly
        // would be inventing a relationship.
        if (record(edge.source, 'CONTEXTUAL', 'containment-ancestor', [step(edge)])) {
          next.push(edge.source);
        }
      }
    }
    ancestors = next.sort(compareStrings);
  }

  // Pass 6 — schemas hanging off owned nodes. Citable, never expanded.
  for (const entry of [...entries.values()].sort((a, b) => compareStrings(a.nodeId, b.nodeId))) {
    if (entry.scope !== 'OWNED') continue;
    for (const edge of outgoing.get(entry.nodeId) ?? []) {
      if (!CONTEXT_LEAF.includes(edge.type)) continue;
      record(edge.target, 'CONTEXTUAL', 'supporting-detail', [...entry.path, step(edge)]);
    }
  }

  const sorted = [...entries.values()].sort((a, b) => compareStrings(a.nodeId, b.nodeId));
  const forwardCache = new Map<string, ReadonlySet<string>>();

  // A claim may cite an *edge*, not only a node — "the button submits to this
  // handler" is a fact about the relationship, and the verifier accepts either
  // end of it as support. An edge has no entry of its own, so it takes the
  // weaker of its endpoints: an edge is part of this feature exactly when both
  // the things it joins are. Without this a cited relationship id falls through
  // to OUTSIDE and the feature is refused its own ownership edge — with a
  // refusal that says it belongs to someone else, which is false.
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const WEAKEST: ScopeClass[] = ['OUTSIDE', 'CONTEXTUAL', 'REACHABLE', 'OWNED'];
  const classOf = (id: string): ScopeClass => {
    const direct = entries.get(id);
    if (direct !== undefined) return direct.scope;
    const edge = edgeById.get(id);
    if (edge === undefined) return 'OUTSIDE';
    const ends = [classOf(edge.source), classOf(edge.target)];
    return ends.reduce((worst, next) =>
      WEAKEST.indexOf(next) < WEAKEST.indexOf(worst) ? next : worst,
    );
  };
  const witnessOf = (id: string): boolean => {
    const direct = entries.get(id);
    if (direct !== undefined) return direct.basis !== 'containment-ancestor';
    const edge = edgeById.get(id);
    if (edge === undefined) return false;
    return witnessOf(edge.source) && witnessOf(edge.target);
  };

  return {
    featureId: input.featureId,
    roots,
    classify: classOf,
    entry: (nodeId) => entries.get(nodeId),
    ownershipPath: (nodeId) => entries.get(nodeId)?.path,
    // Everything in scope may witness except the page above the feature. See
    // FeatureScope.canWitness for why that one exclusion carries the weight.
    canWitness: witnessOf,
    reachableFrom: (nodeId) => {
      const cached = forwardCache.get(nodeId);
      if (cached !== undefined) return cached;
      const seen = new Set<string>();
      if (entries.has(nodeId)) {
        const queue = [nodeId];
        while (queue.length > 0) {
          const current = queue.shift()!;
          for (const edge of outgoing.get(current) ?? []) {
            if (!OWNERSHIP_FORWARD.includes(edge.type)) continue;
            if (!entries.has(edge.target)) continue;
            if (seen.has(edge.target)) continue;
            seen.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
      forwardCache.set(nodeId, seen);
      return seen;
    },
    entries: () => sorted,
    summary: () => ({
      owned: sorted.filter((entry) => entry.scope === 'OWNED').length,
      reachable: sorted.filter((entry) => entry.scope === 'REACHABLE').length,
      contextual: sorted.filter((entry) => entry.scope === 'CONTEXTUAL').length,
    }),
  };
}

/** How an ownership path reads in a refusal or a report. */
export function describeOwnershipPath(path: readonly OwnershipStep[]): string {
  if (path.length === 0) return 'the feature root itself';
  return path.map((entry) => entry.relationship).join(' > ');
}
