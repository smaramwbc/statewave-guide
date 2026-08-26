/**
 * Orchestration: one graph in, one verified Product Model out.
 *
 * Every stage this module drives already exists and already fails closed. What
 * it adds is the *order*, and the order is the design:
 *
 * ```
 * discover  →  pack  →  prompt  →  provider  →  schema  →  VERIFY  →  claims
 *                                                                       ↓
 *                                            feature  ←  render  ←  accepted only
 * ```
 *
 * Three properties are worth stating outright, because each one is a thing an
 * orchestrator usually loses.
 *
 * **Nothing skips the verifier.** There is no path from a provider response to a
 * `ProductFeature` that does not pass through {@link verifyEnrichment}. The
 * model's own `description` is not one of the things that survives: it is used
 * to decide whether the feature is presentable at all, and then discarded in
 * favour of prose the renderer composes from claims the verifier upheld. A
 * fluent paragraph is the most persuasive thing a model produces and the least
 * checkable, so it does not get to be the answer.
 *
 * **The renderer is fed accepted claims and graph facts.** See `./render.ts`.
 * The draft handed to it carries routes, permissions, elements and entry
 * points, and its `description`, `title` and `questions` are emptied first —
 * every one of those is generated language, and a renderer that could read them
 * could echo them back into the description. What it can still see is
 * {@link ProductClaim.text} on the accepted claims, because a claim is one
 * object and the assertion travels with the sentence; the guarantee that holds
 * is the narrower one `./render.ts` states — a renderer never sees a *rejected*
 * assertion — plus the wording gate in `./verifier.ts`.
 *
 * **Refusals are output, not absence.** Rejected claims are persisted into
 * `ProductModel.claims`, counted in {@link SemanticVerificationSummary.blocked}
 * and returned in {@link EnrichmentRun.rejected}. "What did the model try to say
 * that we would not let it" is the single most useful signal this pipeline
 * produces, and dropping it would leave a reader unable to tell a careful
 * pipeline from an idle one.
 *
 * ## Reuse is a replay, not a copy
 *
 * A feature whose {@link ProductFeature.dependencyFingerprint} matches the
 * fingerprint of its freshly built pack skips the **provider**, not the
 * verifier. The stored claims are rebuilt into the response they came from and
 * put back through {@link verifyEnrichment} against today's graph, and the
 * feature is re-assembled from whatever survives.
 *
 * Copying the stored feature forward instead would make `product.json` a second
 * source of truth: a hand-edited file — or one written by an older generator —
 * would be re-projected into documentation under "structurally verified" for
 * ever, with nothing in the pipeline ever looking at it again. ADR 0008 puts the
 * artefact below the graph in the chain of authority, and a copy quietly
 * inverts that. A replay costs one verification pass and no model call.
 *
 * Two things are deliberately *not* recomputed. Claims keep their original
 * {@link ClaimProvenance.graphHash} — that is the graph the language was derived
 * from, and rewriting it would erase the record of when it was written — and
 * they keep their original {@link GeneratorAttribution}, because stamping
 * today's provider on prose it never produced would be a false record. Only
 * `dependencyFingerprint`, which is what a supersession decision reads, is
 * refreshed.
 *
 * @packageDocumentation
 */

import type {
  ApplicationGraph,
  ApplicationNode,
  Relationship,
  RelationshipType,
} from '@statewavedev/guide-indexer';
import type {
  ClaimProvenance,
  FactualClaimEnrichment,
  FeatureEnrichment,
  GeneratorAttribution,
  LanguageClaimEnrichment,
  ProductClaim,
  ProductClaimType,
  ProductFeature,
  ProductModel,
  ProductModelSource,
  ProductPermission,
  ProductWorkflow,
  ProductWorkflowStep,
  SemanticEvidence,
  SemanticRejectionReason,
  SemanticVerificationSummary,
  WorkflowOrderBasis,
} from '@statewavedev/guide-shared';
import { isFactualClaimType } from '@statewavedev/guide-shared';
import type { FeatureCandidate } from './candidates.js';
import { discoverFeatureCandidates } from './candidates.js';
import { buildEvidence, indexGraph } from './claims.js';
import type { GraphIndex } from './claims.js';
import { compareStrings, sortedUnique } from './compare.js';
import { SEMANTIC_GENERATOR_VERSION } from './constants.js';
import type { EvidencePack, EvidencePackLimits } from './evidence-pack.js';
import { buildEvidencePack } from './evidence-pack.js';
import { dependencyFingerprint, graphHash } from './fingerprint.js';
import { planClaimOpportunities } from './opportunities.js';
import { buildFeatureEnrichmentRequest } from './prompt.js';
import { computeFeatureScope } from './scope.js';
import type { FeatureScope } from './scope.js';
import type { SemanticModelProvider, SemanticUsage } from './provider.js';
import type { ClaimVerifierRegistry } from './registry.js';
import type { ProseRenderer } from './render.js';
import { createDeterministicRenderer } from './render.js';
import { redactSecrets } from './safety.js';
import { BEHAVIOUR_SPINE, spineRank } from './spine.js';
import { featureConfidence, survivingProse, verifyEnrichment } from './verifier.js';

/** How many related features one feature lists. */
const MAX_RELATED_FEATURES = 12;

/** What one enrichment run needs. */
export interface EnrichmentOptions {
  /** The deterministic graph. The only source of facts in the whole run. */
  graph: ApplicationGraph;
  /** Where language comes from. Never a source of facts. */
  provider: SemanticModelProvider;
  /** Defaults to {@link createDeterministicRenderer}, which is authoritative. */
  renderer?: ProseRenderer;
  /** Application-supplied verification rules. Absent means the built-in matrix only. */
  registry?: ClaimVerifierRegistry;
  /** Caps on each evidence pack. */
  limits?: EvidencePackLimits;
  /** Cap on candidates, applied after they are sorted by id. */
  candidateLimit?: number;
  /**
   * Enrich only these candidate ids.
   *
   * Every other candidate is still discovered — `knownFeatureIds` must stay
   * complete, or a claim whose `subjectRef` names a real feature outside the
   * selection would be rejected as an unknown subject. Only the *provider calls*
   * are narrowed.
   *
   * Exists for the benchmark: enriching a whole application to score twenty
   * features means paying for the rest, three times over.
   */
  candidateIds?: readonly string[];
  /** A previous model, for fingerprint reuse. */
  previous?: ProductModel;
  onProgress?: (event: EnrichmentEvent) => void;
  signal?: AbortSignal;
  /** Application name, recorded on the model. */
  application?: string;
  /** Version of the analysed application, recorded on the model and every claim. */
  applicationVersion?: string;
  /** Git commit of the analysed application, recorded on the model and every claim. */
  commit?: string;
}

/** Progress, for a terminal or a log. Never load-bearing. */
export type EnrichmentEvent =
  | { kind: 'candidate'; featureId: string; index: number; total: number }
  | { kind: 'reused'; featureId: string }
  | { kind: 'accepted'; featureId: string; confidence: number }
  | { kind: 'refused'; featureId: string; detail: string }
  | { kind: 'cancelled'; completed: number; total: number };

/**
 * One thing the run refused.
 *
 * A claim refusal carries the claim's id and type; a whole-feature refusal
 * carries neither, because there was nothing to build a claim out of.
 * `reason` is absent when the failure has no place in the contract's
 * vocabulary — a provider timing out is not a semantic rejection, and
 * inventing a reason code for it would put an infrastructure problem into the
 * same bucket as a fabricated capability.
 */
export interface EnrichmentRejection {
  featureId: string;
  claim?: string;
  type?: ProductClaimType;
  reason?: SemanticRejectionReason;
  detail: string;
}

/** What one run produced. */
export interface EnrichmentRun {
  /** The Product Model. Structurally deterministic; every array sorted. */
  model: ProductModel;
  /** Every provider call this run made, summed. Reused features cost nothing. */
  usage: SemanticUsage;
  /** Every refusal, in candidate order then claim order. */
  rejected: EnrichmentRejection[];
  /** Feature ids reused from `previous` without a provider call, sorted. */
  reused: string[];
  /** Everything a reader should know that is not a refusal. */
  warnings: string[];
  /**
   * What the deterministic planner offered and what the model did with it.
   *
   * Reported per feature rather than summed, because the interesting number is
   * not how many opportunities existed but how often a model, given a provable
   * claim, decided it was not worth saying. Round 1 had no way to measure that:
   * restraint scored 0/30 because declining was not expressible.
   */
  opportunities: {
    featureId: string;
    offered: number;
    accepted: number;
    declined: number;
  }[];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Sums usage across attempts without inventing figures a provider never gave. */
function addUsage(total: SemanticUsage, next: SemanticUsage): SemanticUsage {
  const seen = (key: 'inputTokens' | 'outputTokens' | 'costUsd'): boolean =>
    total[key] !== undefined || next[key] !== undefined;
  return {
    ...(seen('inputTokens')
      ? { inputTokens: (total.inputTokens ?? 0) + (next.inputTokens ?? 0) }
      : {}),
    ...(seen('outputTokens')
      ? { outputTokens: (total.outputTokens ?? 0) + (next.outputTokens ?? 0) }
      : {}),
    ...(seen('costUsd') ? { costUsd: (total.costUsd ?? 0) + (next.costUsd ?? 0) } : {}),
    latencyMs: total.latencyMs + next.latencyMs,
  };
}

/** `Create a client` → `create a client`, leaving acronyms alone. */
function decapitalise(text: string): string {
  const second = text.charAt(1);
  // `API keys` stays `API keys`: lowering the first letter of an acronym reads
  // as a typo rather than as a sentence.
  if (second !== '' && second === second.toUpperCase() && second !== second.toLowerCase()) {
    return text;
  }
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/**
 * How far a feature's own scope reaches.
 *
 * Four hops, the same figure candidate discovery and the verifier's subject
 * closure both use, so "what this feature is" means one thing across the
 * pipeline instead of three.
 */
const SCOPE_DEPTH = 4;

/**
 * Edges the scope walk follows *against* their direction.
 *
 * An element's containing component and the route above it are found by walking
 * `contains` and `renders` backwards. Nothing else is walked backwards: "something
 * calls this function" does not make that caller part of this feature.
 */
const SCOPE_BACKWARD: readonly RelationshipType[] = ['contains', 'renders'];

/**
 * The nodes a feature actually speaks for, inside its pack.
 *
 * Not the whole pack. A pack is a *neighbourhood* — it contains every sibling
 * button on the same page, because the model needs that context to describe one
 * of them — and copying it wholesale into `ProductFeature.elements` would have
 * "create a client" claim to own the delete button next to it. That is a false
 * fact in a field a runtime joins on, which is worse than a thin one.
 *
 * Two independent walks, deliberately not one:
 *
 * - **forward** along the behaviour spine, which is what the feature *does*;
 * - **backward** along `contains`/`renders`, which is where it *lives*.
 *
 * Kept separate because a combined walk would reach the containing component
 * and then descend into every other element it contains, which is the
 * over-broad answer this function exists to avoid.
 */
function featureScope(roots: readonly string[], pack: EvidencePack): Set<string> {
  const outgoing = new Map<string, Relationship[]>();
  const incoming = new Map<string, Relationship[]>();
  for (const relationship of pack.relationships) {
    const from = outgoing.get(relationship.source);
    if (from) from.push(relationship);
    else outgoing.set(relationship.source, [relationship]);
    const to = incoming.get(relationship.target);
    if (to) to.push(relationship);
    else incoming.set(relationship.target, [relationship]);
  }

  const inPack = new Set(pack.nodes.map((node) => node.id));
  const scope = new Set<string>(roots.filter((id) => inPack.has(id)));
  const start = [...scope];

  /** One bounded walk, adding whatever `step` reaches to the shared scope. */
  const walk = (step: (id: string) => Iterable<string>): void => {
    let frontier = start;
    for (let hop = 0; hop < SCOPE_DEPTH && frontier.length > 0; hop += 1) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const reached of step(id)) {
          if (scope.has(reached)) continue;
          scope.add(reached);
          next.push(reached);
        }
      }
      frontier = next;
    }
  };

  walk(function* forward(id) {
    for (const relationship of outgoing.get(id) ?? []) {
      // Off-spine edges are facts about the neighbourhood, not about what the
      // feature does; a `validates_with` edge reaching a schema does not make
      // that schema part of the feature.
      if (spineRank(relationship.type) === BEHAVIOUR_SPINE.length) continue;
      yield relationship.target;
    }
  });
  walk(function* backward(id) {
    for (const relationship of incoming.get(id) ?? []) {
      if (!SCOPE_BACKWARD.includes(relationship.type)) continue;
      yield relationship.source;
    }
  });

  return scope;
}

/** The graph facts a feature owns, read off the nodes in its scope. */
function scopedFacts(
  scope: ReadonlySet<string>,
  nodes: readonly ApplicationNode[],
): { elements: string[]; routes: string[]; permissions: string[] } {
  const elements: string[] = [];
  const routes: string[] = [];
  const permissions: string[] = [];
  for (const node of nodes) {
    if (!scope.has(node.id)) continue;
    if (node.kind === 'element') elements.push(node.elementId);
    if (node.kind === 'route') routes.push(node.path);
    if (node.kind === 'permission') permissions.push(node.permission);
  }
  return {
    elements: sortedUnique(elements),
    routes: sortedUnique(routes),
    permissions: sortedUnique(permissions),
  };
}

/**
 * Every permission the graph knows about, lifted rather than generated.
 *
 * A fact about the application, not an opinion about it, so it does not depend
 * on which candidates were enriched or on whether a model said anything useful.
 *
 * It reads the *graph*, not a pack, so it is the one place in the model that the
 * pack's sanitising never touches — and a permission string is repository text
 * (`admin:${process.env.KEY}` resolves to a literal often enough). One whose own
 * name is credential-shaped is dropped rather than listed: its id *is* the
 * secret, so there is no version of the row that does not publish it.
 */
function liftPermissions(graph: ApplicationGraph, index: GraphIndex): ProductPermission[] {
  const requiredBy = new Map<string, string[]>();
  const supporting = new Map<string, string[]>();
  for (const relationship of graph.relationships) {
    if (relationship.type !== 'requires_permission') continue;
    const holders = requiredBy.get(relationship.target) ?? [];
    holders.push(relationship.source);
    requiredBy.set(relationship.target, holders);
    const edges = supporting.get(relationship.target) ?? [];
    edges.push(relationship.id);
    supporting.set(relationship.target, edges);
  }

  const permissions: ProductPermission[] = [];
  for (const node of graph.nodes) {
    if (node.kind !== 'permission') continue;
    if (redactSecrets(node.id) !== node.id || redactSecrets(node.permission) !== node.permission) {
      continue;
    }
    permissions.push({
      id: node.permission,
      requiredBy: sortedUnique(requiredBy.get(node.id) ?? []),
      evidence: buildEvidence([node.id, ...(supporting.get(node.id) ?? [])], index),
    });
  }
  return permissions.sort((a, b) => compareStrings(a.id, b.id));
}

/**
 * A workflow built from accepted `workflow_step` claims.
 *
 * Not from a second generation pass. Every step is therefore a claim that
 * already survived verification — its targets exist, they belong to this
 * feature's evidence, and they are addressable — which means "the steps are
 * verified" is true in the same sense the rest of the model is, rather than in a
 * weaker sense nobody spelled out.
 */
function buildWorkflow(
  featureId: string,
  featureTitle: string,
  claims: readonly ProductClaim[],
  attribution: GeneratorAttribution,
  scope: FeatureScope,
): ProductWorkflow | undefined {
  // Order comes from the graph, never from the order the model happened to
  // answer in. A feature's behaviour path *is* its sequence: the control is
  // pressed, the handler runs, the dialog opens, the form submits. How far
  // along that path a step's evidence sits is how far along the workflow it
  // belongs, and that is a fact rather than a narrative.
  const pending = claims
    .filter((claim) => claim.type === 'workflow_step' && claim.status !== 'rejected')
    .map((claim) => {
      const targets = sortedUnique(claim.assertion?.targets ?? []);
      const depths = targets
        .map((target) => scope.ownershipPath(target)?.length)
        .filter((depth): depth is number => depth !== undefined);
      return {
        claim,
        targets,
        // The furthest point this step reaches. A step that touches both the
        // button and the endpoint belongs where it ends up, not where it began.
        depth: depths.length === 0 ? undefined : Math.max(...depths),
      };
    });
  if (pending.length === 0) return undefined;

  // Unknown when the graph does not separate the steps: every step at the same
  // distance, or any step the graph cannot place at all. An invented sequence
  // is worse than an unordered list, so the absence is recorded rather than
  // papered over with response order.
  const depths = pending.map((entry) => entry.depth);
  const placed = depths.every((depth) => depth !== undefined);
  const distinct = new Set(depths).size;
  const orderBasis: WorkflowOrderBasis =
    placed && distinct === pending.length ? 'ownership-path' : 'unknown';

  const ordered =
    orderBasis === 'ownership-path'
      ? [...pending].sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0))
      : [...pending].sort((a, b) => compareStrings(a.claim.id, b.claim.id));

  const steps: ProductWorkflowStep[] = ordered.map((entry, position) => ({
    index: position + 1,
    text: entry.claim.text,
    targets: entry.targets,
    evidence: entry.claim.evidence,
  }));

  const evidence = new Map<string, SemanticEvidence>();
  for (const step of steps) {
    for (const record of step.evidence) evidence.set(record.ref, record);
  }
  return {
    id: `${featureId}#workflow`,
    featureId,
    title: `How to ${decapitalise(featureTitle)}`,
    orderBasis,
    steps,
    evidence: [...evidence.values()].sort((a, b) => compareStrings(a.ref, b.ref)),
    generatedBy: attribution,
  };
}

/**
 * Fills in `relatedFeatures` once every feature exists.
 *
 * Relatedness is "shares a graph fact", ranked by how many facts are shared so
 * the strongest connections survive the cap. A shared layout component would
 * otherwise make every feature related to every other, and a list of everything
 * is a list of nothing.
 */
function linkRelatedFeatures(features: readonly ProductFeature[]): void {
  const owners = new Map<string, string[]>();
  for (const feature of features) {
    for (const fact of feature.dependsOn) {
      const list = owners.get(fact) ?? [];
      list.push(feature.id);
      owners.set(fact, list);
    }
  }
  for (const feature of features) {
    const shared = new Map<string, number>();
    for (const fact of feature.dependsOn) {
      for (const other of owners.get(fact) ?? []) {
        if (other === feature.id) continue;
        shared.set(other, (shared.get(other) ?? 0) + 1);
      }
    }
    feature.relatedFeatures = [...shared.entries()]
      .sort((a, b) => b[1] - a[1] || compareStrings(a[0], b[0]))
      .slice(0, MAX_RELATED_FEATURES)
      .map(([id]) => id)
      .sort(compareStrings);
  }
}

/**
 * Which `blocked` counter a rejection belongs to.
 *
 * The counters are named after *what was stopped*, so the claim's type decides
 * as much as the reason does. A `delete` capability refused because the endpoint
 * it cited is a POST is an unsupported capability that was blocked, whatever
 * reason code carried it; filing it nowhere would let this table report zeroes
 * on a run that blocked a dozen fabrications, which is the opposite of what a
 * reader takes from it.
 *
 * It is still **not a total**. Reasons that describe the response rather than a
 * fact about the application — `UNSUPPORTED_CLAIM_RULE`, which means "not
 * checked", and `SCHEMA_VIOLATION` — belong to no category here on purpose, and
 * `docs.ts` prints the remainder as its own row so the table's own arithmetic is
 * visible rather than implied.
 */
function tallyBlocked(
  blocked: SemanticVerificationSummary['blocked'],
  reason: SemanticRejectionReason,
  type: ProductClaimType,
): void {
  switch (reason) {
    case 'UNSUPPORTED_CAPABILITY':
      blocked.unsupportedCapabilities += 1;
      return;
    case 'UNSUPPORTED_CONSTRAINT':
      blocked.unsupportedConstraints += 1;
      return;
    case 'UNKNOWN_PERMISSION':
      blocked.unsupportedPermissions += 1;
      return;
    case 'UNSUPPORTED_WORKFLOW_STEP':
      blocked.workflowStepsWithoutEvidence += 1;
      return;
    case 'UNKNOWN_GRAPH_REFERENCE':
    case 'UNKNOWN_SUBJECT':
    case 'UNKNOWN_ENDPOINT':
    case 'UNKNOWN_ROUTE':
      blocked.unknownReferences += 1;
      return;
    case 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM':
    case 'NO_SUPPORTING_EVIDENCE':
    case 'CONTRADICTS_GRAPH':
      // The evidence failures. Which category they belong to is a question about
      // the claim, not about the reason.
      if (type === 'capability') blocked.unsupportedCapabilities += 1;
      else if (type === 'constraint') blocked.unsupportedConstraints += 1;
      else if (type === 'permission') blocked.unsupportedPermissions += 1;
      else if (type === 'workflow_step') blocked.workflowStepsWithoutEvidence += 1;
      return;
    default:
      // `UNSUPPORTED_CLAIM_RULE`, `SCHEMA_VIOLATION` and `FEATURE_ID_CHANGED`
      // are counted in `rejectionsByReason` and nowhere here. "We had no rule"
      // is not "we stopped a fabrication", and folding the two together would
      // overstate the table above and understate the matrix's own gaps.
      return;
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** Everything one candidate contributed. */
interface CandidateOutcome {
  feature?: ProductFeature;
  workflow?: ProductWorkflow;
  claims: ProductClaim[];
  rejections: EnrichmentRejection[];
  warnings: string[];
  reused: boolean;
  /** True when a decision was reached, whether or not a feature came out of it. */
  decided: boolean;
  /** True when the provider never answered, so nothing about the feature was decided. */
  unavailable?: boolean;
  /** What the planner offered this candidate and what the model did with it. */
  opportunities?: EnrichmentRun['opportunities'][number];
}

/** The 1-based ordinal encoded in a claim id, or 0 when there is none to read. */
function ordinalOf(claim: ProductClaim): number {
  const ordinal = Number(claim.id.slice(claim.id.lastIndexOf(':') + 1));
  return Number.isSafeInteger(ordinal) && ordinal > 0 ? ordinal : 0;
}

/**
 * Rebuilds the model response a stored feature came from.
 *
 * Reuse **replays** a previous answer through the verifier rather than trusting
 * it, so this reconstruction has to be faithful enough that a claim gets the id
 * it had before: `draftClaims` numbers ordinals per type in the order it is
 * handed them, so the claims are ordered by type and then by the ordinal already
 * encoded in their ids.
 *
 * Rejected claims are replayed too. They are part of the response the model
 * gave, they keep the refusal visible, and leaving them out would silently
 * renumber everything after them.
 */
function replayEnrichment(
  feature: ProductFeature,
  claims: readonly ProductClaim[],
): FeatureEnrichment {
  const ordered = [...claims].sort(
    (a, b) => compareStrings(a.type, b.type) || ordinalOf(a) - ordinalOf(b),
  );
  const factualClaims: FeatureEnrichment['factualClaims'] = [];
  const languageClaims: FeatureEnrichment['languageClaims'] = [];
  for (const claim of ordered) {
    const assertion = claim.assertion;
    if (assertion !== undefined && isFactualClaimType(claim.type)) {
      factualClaims.push({
        type: claim.type as FactualClaimEnrichment['type'],
        text: claim.text,
        subjectRef: assertion.subjectRef,
        ...(assertion.subjectLabel === undefined ? {} : { subjectLabel: assertion.subjectLabel }),
        ...(assertion.action === undefined ? {} : { action: assertion.action }),
        ...(assertion.route === undefined ? {} : { route: assertion.route }),
        ...(assertion.permission === undefined ? {} : { permission: assertion.permission }),
        targets: [...assertion.targets],
      });
      continue;
    }
    if (isFactualClaimType(claim.type)) continue;
    languageClaims.push({
      type: claim.type as LanguageClaimEnrichment['type'],
      text: claim.text,
      targets: claim.evidence.map((record) => record.ref),
    });
  }
  return {
    title: feature.title,
    description: feature.description,
    factualClaims,
    decisions: [],
    languageClaims,
    confidenceReason: 'Replayed from a previous Product Model and re-verified against this graph.',
  };
}

/** What a candidate is being enriched from. */
interface CandidateSource {
  enrichment: FeatureEnrichment;
  provenance: ClaimProvenance;
  attribution: GeneratorAttribution;
  reused: boolean;
}

/**
 * Whether a stored feature may be replayed instead of regenerated.
 *
 * Two conditions, and the second one is easy to leave out. The facts must be
 * unchanged — that is what `dependencyFingerprint` answers. And the *pipeline*
 * must be unchanged: a claim upheld by last month's verification matrix was
 * upheld by a different set of rules, and carrying it forward under today's
 * banner would present a check that never ran as one that passed.
 */
function replayable(
  previous: ProductModel | undefined,
  feature: ProductFeature | undefined,
  fingerprint: string,
): feature is ProductFeature {
  if (previous === undefined || feature === undefined) return false;
  if (feature.dependencyFingerprint !== fingerprint) return false;
  return previous.source.generatorVersion === SEMANTIC_GENERATOR_VERSION;
}

/** Runs one candidate all the way from pack to feature. */
async function enrichCandidate(
  candidate: FeatureCandidate,
  options: EnrichmentOptions,
  shared: {
    index: GraphIndex;
    knownFeatureIds: ReadonlySet<string>;
    attribution: GeneratorAttribution;
    hash: string;
    renderer: ProseRenderer;
    onUsage: (usage: SemanticUsage) => void;
  },
): Promise<CandidateOutcome> {
  const pack = buildEvidencePack(options.graph, candidate, options.limits);
  // Computed over the pack, so the scope the model is shown, the scope the
  // planner enumerates from and the scope the verifier gates on are the same
  // object. Three notions of ownership that must agree eventually disagree.
  const scope = computeFeatureScope({
    featureId: candidate.id,
    roots: candidate.rootNodes,
    nodes: pack.nodes,
    relationships: pack.relationships,
  });
  const opportunities = planClaimOpportunities({
    candidate,
    knownFeatureIds: shared.knownFeatureIds,
    pack,
    graph: options.graph,
    scope,
    ...(options.registry === undefined ? {} : { registry: options.registry }),
  });
  const fingerprint = dependencyFingerprint(pack);
  const freshProvenance: ClaimProvenance = {
    graphHash: shared.hash,
    ...(options.applicationVersion === undefined
      ? {}
      : { applicationVersion: options.applicationVersion }),
    ...(options.commit === undefined ? {} : { commit: options.commit }),
    dependencyFingerprint: fingerprint.hash,
  };

  const previousFeature = options.previous?.features.find((entry) => entry.id === candidate.id);
  let source: CandidateSource;

  if (replayable(options.previous, previousFeature, fingerprint.hash)) {
    const previousClaims = (options.previous?.claims ?? []).filter(
      (claim) => claim.featureId === candidate.id,
    );
    source = {
      enrichment: replayEnrichment(previousFeature, previousClaims),
      // The claim was *derived* from the graph the previous run saw, and it says
      // so; only the fingerprint — which is what a supersession decision reads —
      // is refreshed. Rewriting the graph hash would erase the record of when
      // the language was actually generated.
      provenance: {
        ...(previousClaims[0]?.provenance ?? freshProvenance),
        dependencyFingerprint: fingerprint.hash,
      },
      // Attribution belongs to whoever wrote the words. Stamping today's
      // provider on prose it never produced would be a false record.
      attribution: previousFeature.generatedBy ?? shared.attribution,
      reused: true,
    };
  } else {
    const request = buildFeatureEnrichmentRequest(pack, options.signal, scope, opportunities);
    const result = await options.provider.generateStructured(request);
    shared.onUsage(result.usage);

    if (!result.success) {
      const schemaFailure = result.error.code === 'schema_violation';
      return {
        claims: [],
        rejections: [
          {
            featureId: candidate.id,
            ...(schemaFailure ? { reason: 'SCHEMA_VIOLATION' as const } : {}),
            detail: schemaFailure
              ? `The response did not satisfy the enrichment schema: ${result.error.message}`
              : `The provider did not answer (${result.error.code}): ${result.error.message}`,
          },
        ],
        warnings: [],
        reused: false,
        // Only a schema violation is a decision *about the feature*: the model
        // answered and the answer was refused. A timeout, a rate limit or a
        // cancelled call is an infrastructure event, and counting it as a
        // refusal would report "3 features refused" for a run in which the
        // verifier never ran at all.
        decided: schemaFailure,
        ...(schemaFailure ? {} : { unavailable: true }),
      };
    }
    source = {
      enrichment: result.data,
      provenance: freshProvenance,
      attribution: shared.attribution,
      reused: false,
    };
  }

  const verification = verifyEnrichment({
    candidate,
    knownFeatureIds: shared.knownFeatureIds,
    pack,
    graph: options.graph,
    enrichment: source.enrichment,
    attribution: source.attribution,
    provenance: source.provenance,
    scope,
    plan: opportunities,
    ...(options.registry === undefined ? {} : { registry: options.registry }),
  });

  const rejections: EnrichmentRejection[] = verification.rejectedClaims.map((entry) => ({
    featureId: candidate.id,
    claim: entry.claim,
    type: entry.type,
    reason: entry.reason,
    detail: entry.detail,
  }));

  if (!verification.accepted) {
    return {
      claims: verification.claims,
      rejections: [
        ...rejections,
        {
          featureId: candidate.id,
          detail:
            'The feature was refused: nothing it asserted survived verification, or its name did not survive redaction.',
        },
      ],
      warnings: verification.warnings,
      reused: false,
      decided: true,
      opportunities: {
        featureId: candidate.id,
        offered: opportunities.length,
        accepted: (source.enrichment.decisions ?? []).filter(
          (decision) => decision.decision === 'accept',
        ).length,
        declined: (source.enrichment.decisions ?? []).filter(
          (decision) => decision.decision === 'decline',
        ).length,
      },
    };
  }

  const title = verification.title;
  const accepted = verification.claims.filter((claim) => claim.status !== 'rejected');
  const workflow = buildWorkflow(candidate.id, title, accepted, source.attribution, scope);
  const purpose = accepted.find((claim) => claim.type === 'purpose')?.text;

  const facts = scopedFacts(featureScope(candidate.rootNodes, pack), pack.nodes);
  const feature: ProductFeature = {
    id: candidate.id,
    kind: 'feature',
    title,
    description: '',
    entryPoints: sortedUnique(candidate.rootNodes),
    routes: facts.routes,
    elements: facts.elements,
    permissions: facts.permissions,
    workflows: workflow === undefined ? [] : [workflow.id],
    relatedFeatures: [],
    questions: sortedUnique(
      accepted
        .filter((claim) => claim.type === 'user_question' || claim.type === 'synonym')
        .map((claim) => claim.text),
    ),
    claims: verification.claims.map((claim) => claim.id).sort(compareStrings),
    evidence: buildEvidence(sortedUnique(candidate.rootNodes), shared.index),
    confidence: featureConfidence(verification.claimSummary),
    claimSummary: verification.claimSummary,
    idOrigin: candidate.idOrigin,
    dependencyFingerprint: fingerprint.hash,
    dependsOn: fingerprint.dependsOn,
    generatedBy: source.attribution,
  };

  // The draft the renderer sees. `description`, `title`, `purpose` and
  // `questions` are all empty or absent: every one of them is generated language,
  // and handing a renderer generated language is handing it something it could
  // echo into the description without any of it having been checked. What it
  // gets is the graph facts and the accepted claims.
  const rendered = await shared.renderer.render({
    feature: { ...feature, title: '', questions: [] },
    claims: accepted,
    ...(workflow === undefined ? {} : { workflow }),
  });

  return {
    feature: {
      ...feature,
      description: survivingProse(rendered.description),
      ...(purpose === undefined ? {} : { purpose }),
    },
    ...(workflow === undefined ? {} : { workflow }),
    claims: verification.claims,
    rejections,
    warnings: verification.warnings,
    reused: source.reused,
    decided: true,
    opportunities: {
      featureId: candidate.id,
      offered: opportunities.length,
      accepted: (source.enrichment.decisions ?? []).filter(
        (decision) => decision.decision === 'accept',
      ).length,
      declined: (source.enrichment.decisions ?? []).filter(
        (decision) => decision.decision === 'decline',
      ).length,
    },
  };
}

/**
 * Turns an ApplicationGraph into a verified Product Model.
 *
 * Deterministic in structure: candidates are discovered in id order, every array
 * in the result is sorted, and the only field that can differ between two runs
 * over the same graph with the same responses is
 * {@link ProductModelSource.generatedAt} — which is excluded from every hash for
 * exactly that reason.
 */
export async function enrichApplicationGraph(options: EnrichmentOptions): Promise<EnrichmentRun> {
  const { graph, provider } = options;
  const renderer = options.renderer ?? createDeterministicRenderer();
  const index = indexGraph(graph);
  const hash = graphHash(graph);

  const candidates = discoverFeatureCandidates(
    graph,
    options.candidateLimit === undefined ? undefined : { limit: options.candidateLimit },
  );
  const knownFeatureIds = new Set(candidates.map((candidate) => candidate.id));
  // Narrow AFTER knownFeatureIds is built, never before.
  const selected =
    options.candidateIds === undefined
      ? candidates
      : candidates.filter((candidate) => options.candidateIds?.includes(candidate.id));

  const attribution: GeneratorAttribution = {
    provider: provider.name,
    model: provider.model,
    version: SEMANTIC_GENERATOR_VERSION,
  };

  let usage: SemanticUsage = { latencyMs: 0 };
  const shared = {
    index,
    knownFeatureIds,
    attribution,
    hash,
    renderer,
    onUsage: (next: SemanticUsage): void => {
      usage = addUsage(usage, next);
    },
  };

  const features: ProductFeature[] = [];
  const workflows: ProductWorkflow[] = [];
  const claims: ProductClaim[] = [];
  const rejected: EnrichmentRejection[] = [];
  const reused: string[] = [];
  const warnings: string[] = [];
  const opportunityTally: EnrichmentRun['opportunities'] = [];
  let decided = 0;
  let unavailable = 0;

  for (const [position, candidate] of selected.entries()) {
    if (options.signal?.aborted === true) {
      options.onProgress?.({
        kind: 'cancelled',
        completed: position,
        total: selected.length,
      });
      warnings.push(
        `The run was cancelled after ${position} of ${selected.length} candidates. The model describes only what completed.`,
      );
      break;
    }

    options.onProgress?.({
      kind: 'candidate',
      featureId: candidate.id,
      index: position + 1,
      total: selected.length,
    });

    const outcome = await enrichCandidate(candidate, options, shared);
    if (outcome.decided) decided += 1;
    if (outcome.unavailable === true) unavailable += 1;
    claims.push(...outcome.claims);
    rejected.push(...outcome.rejections);
    warnings.push(...outcome.warnings.map((warning) => `${candidate.id}: ${warning}`));
    if (outcome.opportunities !== undefined) opportunityTally.push(outcome.opportunities);
    if (outcome.reused) reused.push(candidate.id);
    if (outcome.feature !== undefined) features.push(outcome.feature);
    if (outcome.workflow !== undefined) workflows.push(outcome.workflow);

    if (outcome.reused) {
      options.onProgress?.({ kind: 'reused', featureId: candidate.id });
    } else if (outcome.feature !== undefined) {
      options.onProgress?.({
        kind: 'accepted',
        featureId: candidate.id,
        confidence: outcome.feature.confidence,
      });
    } else {
      options.onProgress?.({
        kind: 'refused',
        featureId: candidate.id,
        detail: outcome.rejections[outcome.rejections.length - 1]?.detail ?? 'Refused.',
      });
    }
  }

  linkRelatedFeatures(features);

  if (unavailable > 0) {
    warnings.push(
      `${unavailable} candidate(s) were not enriched: the provider did not answer, or the call was cancelled. They are neither accepted nor refused, because nothing about them was checked.`,
    );
  }
  if (
    options.previous !== undefined &&
    options.previous.source.generatorVersion !== SEMANTIC_GENERATOR_VERSION
  ) {
    warnings.push(
      `The previous Product Model was generated by version ${options.previous.source.generatorVersion} and this pipeline is version ${SEMANTIC_GENERATOR_VERSION}. Nothing was reused: a claim upheld by an older verification matrix has not been checked by this one.`,
    );
  }

  // --- Aggregate. Everything here is counted from the claims that were
  // actually persisted, so the summary can never disagree with the model.
  const blocked = {
    unsupportedCapabilities: 0,
    unsupportedConstraints: 0,
    unsupportedPermissions: 0,
    workflowStepsWithoutEvidence: 0,
    unknownReferences: 0,
  };
  const reasons = new Map<string, number>();
  let factualClaimsGenerated = 0;
  let structurallyVerified = 0;
  let semanticallyGrounded = 0;
  let claimsRejected = 0;
  let acceptedWithEvidence = 0;
  let acceptedTotal = 0;

  for (const claim of claims) {
    if (claim.assertion !== undefined) factualClaimsGenerated += 1;
    if (claim.status === 'structurally_verified') structurallyVerified += 1;
    if (claim.status === 'semantically_grounded') semanticallyGrounded += 1;
    if (claim.status === 'rejected') {
      claimsRejected += 1;
      const reason = claim.rejection?.reason;
      if (reason !== undefined) {
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
        tallyBlocked(blocked, reason, claim.type);
      }
      continue;
    }
    acceptedTotal += 1;
    if (claim.evidence.length > 0) acceptedWithEvidence += 1;
  }
  for (const rejection of rejected) {
    if (rejection.claim !== undefined || rejection.reason === undefined) continue;
    reasons.set(rejection.reason, (reasons.get(rejection.reason) ?? 0) + 1);
  }

  const rejectionsByReason: Record<string, number> = {};
  for (const key of [...reasons.keys()].sort(compareStrings)) {
    rejectionsByReason[key] = reasons.get(key) ?? 0;
  }

  const verification: SemanticVerificationSummary = {
    // Discovery is always complete; enrichment may have been narrowed.
    featureCandidates: candidates.length,
    featuresEnriched: decided,
    featuresAccepted: features.length,
    featuresRejected: decided - features.length,
    factualClaimsGenerated,
    structurallyVerified,
    semanticallyGrounded,
    claimsRejected,
    blocked,
    evidenceCoverage: acceptedTotal === 0 ? 0 : acceptedWithEvidence / acceptedTotal,
    rejectionsByReason,
  };

  const source: ProductModelSource = {
    ...(options.commit === undefined ? {} : { commit: options.commit }),
    ...(options.applicationVersion === undefined
      ? {}
      : { applicationVersion: options.applicationVersion }),
    graphHash: hash,
    generatorVersion: SEMANTIC_GENERATOR_VERSION,
    provider: provider.name,
    model: provider.model,
    generatedAt: new Date().toISOString(),
  };

  const application = options.application ?? graph.application;
  const model: ProductModel = {
    version: 2,
    ...(application === undefined ? {} : { application }),
    source,
    features: features.sort((a, b) => compareStrings(a.id, b.id)),
    workflows: workflows.sort((a, b) => compareStrings(a.id, b.id)),
    claims: claims.sort((a, b) => compareStrings(a.id, b.id)),
    permissions: liftPermissions(graph, index),
    verification,
  };

  return {
    model,
    usage,
    rejected,
    reused: reused.sort(compareStrings),
    warnings,
    opportunities: opportunityTally,
  };
}
