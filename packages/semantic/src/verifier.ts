/**
 * Matrix-driven claim verification.
 *
 * This is the gate the whole pipeline exists for. Everything before it produces
 * *language*; this decides which of that language is allowed to be presented as
 * product truth, and it decides it against the graph rather than against how the
 * sentence reads.
 *
 * Four properties hold here, and each one is a thing a verifier normally loses:
 *
 * **There is no generic fallback.** Nothing is accepted for the mere reason that
 * it cited something. Every factual assertion is looked up in the verification
 * matrix (or in a registered verifier), and an assertion with no rule resolves to
 * `EXPLICITLY_UNSUPPORTED` — never to `structurally_verified`. A fallback is how
 * a verifier stops verifying at exactly the moment verification starts to
 * matter: when a model produces something nobody anticipated.
 *
 * **"We could not check this" is not "this is false".** They are different
 * facts about the world, they are reported differently, and they are counted
 * separately — {@link FeatureClaimSummary.unsupportedActions} exists so an
 * unverifiable claim never looks disproven.
 *
 * **The universal checks are not skippable.** Subject identity, subject scope,
 * target existence, target scope and any value stated in words are settled
 * before any rule — built-in or registered — is consulted. A registered verifier
 * is handed a claim that is already known to be about a real subject *of this
 * feature* and to cite real, in-scope facts, and it cannot reach around that.
 *
 * **Identity is matched exactly.** No case folding, no trimming, no Unicode
 * normalisation. ` feature:clients.create`, `Feature:clients.create` and a
 * homoglyph of it are three different strings, and all three resolve to nothing.
 * Repairing them would hand a model a way to name something it was never shown.
 *
 * ## What is checked, and what is only scanned
 *
 * The unit of verification is the **assertion**: `{ subjectRef, action, route,
 * permission, targets }`. Everything in this file is about that object.
 *
 * The sentence beside it — {@link ProductClaim.text} — is not verified, and
 * cannot be: no check here can decide whether "creating a client also creates
 * the matching Salesforce contact" is true. What the sentence gets is a
 * **scan**, in `./proposition.ts`: eleven capability and effect words, reported
 * when nothing accepted and nothing cited supports them, and the claim is
 * refused when one appears. That catches the shape a fabrication usually takes
 * and misses every fabrication phrased in other words. The distinction is worth
 * keeping sharp, because "checked" and "scanned" are very different guarantees
 * and only one of them is the strong claim this package makes.
 *
 * The same scan is applied to the model's `title`, which is generated language
 * that no claim backs at all and yet becomes a page's heading.
 *
 * ## How a rule is evaluated
 *
 * A rule names up to three dimensions, and **every dimension it names must
 * hold**:
 *
 * | Dimension | Satisfied by |
 * | --- | --- |
 * | `nodeKinds` | a cited target that resolves to a pack node of an allowed kind |
 * | `httpMethods` | a cited target that is an `api` node whose method is allowed |
 * | `relationships` | a pack relationship of an allowed type, running from the subject to a cited target |
 *
 * Requiring all of them is stricter than some of the matrix's `requirement`
 * captions read — that prose summarises a rule for a table, and where the two
 * differ the check is the one that fails closed. It is never weaker: a `create`
 * claim citing a button element and nothing else is refused, because a control
 * labelled "Create" is not evidence that creating works.
 *
 * ## What "the subject" means for a relationship
 *
 * A feature is not one node. The subject of `feature:clients.create` is the
 * behaviour chain that candidate speaks for: its roots, plus everything reached
 * from them along the behaviour spine *inside this pack*. That is what makes
 * `element → invokes → handler → calls_api → api` count as the subject deleting
 * something, while a `requires_permission` edge hanging off an unrelated element
 * does not reach the subject at all and cannot support "only administrators can
 * do this".
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode, Relationship } from '@statewavedev/guide-indexer';
import type {
  CapabilityAction,
  ClaimProvenance,
  ClaimVerificationOutcome,
  ClaimVerificationRule,
  FeatureClaimSummary,
  FeatureEnrichment,
  GeneratorAttribution,
  ProductClaim,
  ProductClaimType,
  SemanticRejectionReason,
} from '@statewavedev/guide-shared';
import { UNSUPPORTED_CAPABILITY_ACTIONS, findBuiltInRule } from '@statewavedev/guide-shared';
import type { FeatureCandidate } from './candidates.js';
import type { ClaimDraft, GraphIndex } from './claims.js';
import { acceptedClaim, buildEvidence, draftClaims, indexGraph, rejectedClaim } from './claims.js';
import { compareStrings } from './compare.js';
import { UNKNOWN_API_PATH_PREFIX } from './constants.js';
import type { EvidencePack } from './evidence-pack.js';
import { checkRenderedPropositions } from './proposition.js';
import type { ClaimVerifierRegistration, ClaimVerifierRegistry } from './registry.js';
import { featureTitleFromId } from './render.js';
import { REDACTION_PLACEHOLDER, redactSecrets } from './safety.js';
import { BEHAVIOUR_SPINE, spineRank } from './spine.js';

/** Prefix that marks a subject reference as naming a feature rather than a node. */
export const FEATURE_SUBJECT_PREFIX = 'feature:';

/**
 * How far the subject of a feature claim extends along the behaviour spine.
 *
 * Four hops is the canonical chain — element → handler → service → endpoint —
 * and matches the depth candidate discovery uses to decide what a feature
 * speaks for. Anything further and one element in a shared layout would start
 * acting as the subject of half the application.
 */
const SUBJECT_CLOSURE_DEPTH = 4;

/** One refused claim, indexed for reporting. */
export interface RejectedClaim {
  /** Id of the claim. The full record, text included, is in `claims`. */
  claim: string;
  type: ProductClaimType;
  reason: SemanticRejectionReason;
  detail: string;
}

/** What verification established about one feature's enrichment. */
export interface SemanticVerificationResult {
  /** True when the feature itself survived: it has a name, a description and at least one accepted claim. */
  accepted: boolean;
  /**
   * The title the feature may be published under.
   *
   * The model's own title once it has survived redaction and the prose gate, or
   * a title built from the feature id when it did not. Decided here rather than
   * by a caller so there is exactly one answer to "what survived", and empty
   * only when redaction left nothing at all — in which case `accepted` is false.
   */
  title: string;
  /** Every claim with its final status and outcome, in the order the model returned it. */
  claims: ProductClaim[];
  rejectedClaims: RejectedClaim[];
  warnings: string[];
  /** Share of accepted claims carrying at least one piece of evidence, in `[0, 1]`. */
  evidenceCoverage: number;
  claimSummary: FeatureClaimSummary;
}

/** Everything one verification pass needs. */
export interface VerifyEnrichmentInput {
  candidate: FeatureCandidate;
  /**
   * Feature ids the pipeline itself proposed.
   *
   * A `feature:` subject reference resolves against this set — and against the
   * candidate under verification, which is a known identity by construction.
   */
  knownFeatureIds: ReadonlySet<string>;
  pack: EvidencePack;
  graph: ApplicationGraph;
  /** The model's response, already through its schema. */
  enrichment: FeatureEnrichment;
  attribution: GeneratorAttribution;
  provenance: ClaimProvenance;
  /** Application-supplied checks. Absent means the built-in matrix only. */
  registry?: ClaimVerifierRegistry;
}

/** Why a claim was refused, in the shape {@link ProductClaim.rejection} wants. */
interface Refusal {
  reason: SemanticRejectionReason;
  detail: string;
}

/** How one factual assertion resolved. */
interface FactualResolution {
  outcome: ClaimVerificationOutcome;
  /** Ids that justified acceptance. Empty on refusal. */
  evidenceIds: string[];
  refusal?: Refusal;
  /** Set when the refusal was "no rule exists", keyed for the summary. */
  unsupportedKey?: string;
  /** Set when a registered verifier, rather than the matrix, decided. */
  registered?: string;
}

/** Lookups a verification pass shares across every claim. */
interface VerificationContext {
  candidate: FeatureCandidate;
  knownFeatureIds: ReadonlySet<string>;
  pack: EvidencePack;
  graph: ApplicationGraph;
  index: GraphIndex;
  packNodes: ReadonlyMap<string, ApplicationNode>;
  packRelationships: ReadonlyMap<string, Relationship>;
  /** Pack relationships by source id, for the subject closure and the relationship dimension. */
  outgoing: ReadonlyMap<string, Relationship[]>;
  /** Subjects already resolved in this pass. A feature's claims share subjects. */
  subjects: Map<string, ReadonlySet<string> | undefined>;
  registry: ClaimVerifierRegistry | undefined;
}

// ---------------------------------------------------------------------------
// Rejection vocabulary
// ---------------------------------------------------------------------------

/**
 * The reason a claim is refused when nothing it cited is even the right *kind*
 * of thing.
 *
 * Chosen per claim type rather than shared, because "no permission node was
 * cited" and "no capability path was cited" are different findings and a reader
 * acting on the output needs to be able to tell them apart.
 */
function kindFailureReason(type: ProductClaimType): SemanticRejectionReason {
  switch (type) {
    case 'capability':
      return 'UNSUPPORTED_CAPABILITY';
    case 'constraint':
      return 'UNSUPPORTED_CONSTRAINT';
    case 'workflow_step':
      return 'UNSUPPORTED_WORKFLOW_STEP';
    // `navigation` and `permission` deliberately do **not** map to
    // `UNKNOWN_ROUTE` / `UNKNOWN_PERMISSION`. Reaching here means the cited
    // facts were the wrong kind — a function node where a route node was
    // needed — and the route or permission the claim named may be perfectly
    // real; `evaluateNamedValues` has already settled that question. Saying
    // "unknown route" about a route the graph does contain is a machine-
    // readable statement that is false, and it mis-files the refusal in
    // `blocked.unknownReferences` as well.
    default:
      return 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM';
  }
}

/**
 * The reason a claim is refused when the right kinds were cited but nothing
 * connects them to the subject.
 *
 * `EVIDENCE_DOES_NOT_SUPPORT_CLAIM` is the honest description of that case: the
 * facts are real, they are simply about something else. A constraint keeps its
 * own reason because "no schema, test or graph basis" is what a constraint
 * failure means whichever dimension fell over.
 */
function relationshipFailureReason(type: ProductClaimType): SemanticRejectionReason {
  return type === 'constraint' ? 'UNSUPPORTED_CONSTRAINT' : 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM';
}

/** A cited id, quoted safely for a rejection detail. */
function quote(value: string): string {
  return `"${redactSecrets(value)}"`;
}

// ---------------------------------------------------------------------------
// Subject identity
// ---------------------------------------------------------------------------

/**
 * Everything the subject of a claim speaks for, inside this pack.
 *
 * Walks the behaviour spine forward from the roots, so a relationship starting
 * anywhere on the feature's own chain counts as starting at the subject, and a
 * relationship starting outside it does not.
 */
function subjectClosure(roots: readonly string[], context: VerificationContext): Set<string> {
  const reached = new Set<string>();
  for (const id of roots) {
    if (context.packNodes.has(id)) reached.add(id);
  }
  let frontier = [...reached];
  for (let hop = 0; hop < SUBJECT_CLOSURE_DEPTH && frontier.length > 0; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const relationship of context.outgoing.get(id) ?? []) {
        // Off-spine edges are facts about the neighbourhood, not about what the
        // feature does; `validates_with` reaching a schema does not make that
        // schema part of the subject.
        if (spineRank(relationship.type) === BEHAVIOUR_SPINE.length) continue;
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
 * Resolves a `subjectRef` to the nodes it speaks for.
 *
 * Returns `undefined` when the reference names nothing the pipeline knows —
 * which is the whole point of the field. A model may describe a subject; it may
 * not invent one.
 *
 * A known identity that is **not anchored in this pack** — another feature, or a
 * node from elsewhere in the graph — resolves to the empty set rather than to
 * `undefined`: it exists, it is simply not this feature. Whether that is a
 * refusal is decided in {@link checkUniversally}, which needs to tell "you named
 * nothing" apart from "you named something else".
 */
function resolveSubject(
  subjectRef: string,
  context: VerificationContext,
): ReadonlySet<string> | undefined {
  if (subjectRef.startsWith(FEATURE_SUBJECT_PREFIX)) {
    const featureId = subjectRef.slice(FEATURE_SUBJECT_PREFIX.length);
    if (featureId === context.candidate.id) {
      return subjectClosure(context.candidate.rootNodes, context);
    }
    if (context.knownFeatureIds.has(featureId)) return new Set<string>();
    return undefined;
  }
  if (context.packNodes.has(subjectRef)) return subjectClosure([subjectRef], context);
  if (context.index.nodes.has(subjectRef)) return new Set<string>();
  return undefined;
}

/**
 * {@link resolveSubject}, memoised for one pass.
 *
 * A feature's twelve claims are usually about two or three subjects, and a
 * closure is a graph walk; resolving each one once keeps the pass linear in the
 * pack rather than in claims × pack.
 */
function subjectFor(
  subjectRef: string,
  context: VerificationContext,
): ReadonlySet<string> | undefined {
  if (context.subjects.has(subjectRef)) return context.subjects.get(subjectRef);
  const resolved = resolveSubject(subjectRef, context);
  context.subjects.set(subjectRef, resolved);
  return resolved;
}

// ---------------------------------------------------------------------------
// Rule evaluation
// ---------------------------------------------------------------------------

/** One dimension's outcome. */
interface DimensionResult {
  satisfied: boolean;
  evidenceIds: string[];
  refusal?: Refusal;
}

/** Whether an `api` node may serve as evidence for a rule that names methods. */
function methodAllowed(node: ApplicationNode, rule: ClaimVerificationRule): boolean {
  if (node.kind !== 'api') return true;
  if (rule.httpMethods === undefined) return true;
  return rule.httpMethods.includes(node.method);
}

/** `nodeKinds`: at least one cited target of an allowed kind. */
function evaluateKinds(
  rule: ClaimVerificationRule,
  type: ProductClaimType,
  targets: readonly string[],
  context: VerificationContext,
): DimensionResult {
  if (rule.nodeKinds === undefined) return { satisfied: true, evidenceIds: [] };
  const witnesses = targets.filter((id) => {
    const node = context.packNodes.get(id);
    return node !== undefined && rule.nodeKinds?.includes(node.kind) === true;
  });
  if (witnesses.length > 0) return { satisfied: true, evidenceIds: witnesses };
  return {
    satisfied: false,
    evidenceIds: [],
    refusal: {
      reason: kindFailureReason(type),
      detail: `The rule requires ${rule.requirement}; none of the cited facts is a ${rule.nodeKinds.join(', ')} node.`,
    },
  };
}

/**
 * `httpMethods`: at least one cited target is an `api` node with an allowed
 * method.
 *
 * The three ways this fails are three different findings. An endpoint with the
 * wrong verb is real evidence pointed at the wrong claim; an endpoint whose path
 * the indexer could not resolve is an endpoint we do not actually have; citing
 * no endpoint at all is a capability asserted with no path that performs it.
 */
function evaluateMethods(
  rule: ClaimVerificationRule,
  targets: readonly string[],
  context: VerificationContext,
): DimensionResult {
  const methods = rule.httpMethods;
  if (methods === undefined) return { satisfied: true, evidenceIds: [] };

  const endpoints = targets
    .map((id) => context.packNodes.get(id))
    .filter((node): node is Extract<ApplicationNode, { kind: 'api' }> => node?.kind === 'api');
  const resolved = endpoints.filter((node) => !node.path.startsWith(UNKNOWN_API_PATH_PREFIX));
  const witnesses = resolved.filter((node) => methods.includes(node.method));
  if (witnesses.length > 0) {
    return { satisfied: true, evidenceIds: witnesses.map((node) => node.id) };
  }

  const required = methods.join('/');
  if (resolved.length > 0) {
    const found = [...new Set(resolved.map((node) => node.method))].sort(compareStrings).join(', ');
    return {
      satisfied: false,
      evidenceIds: [],
      refusal: {
        reason: 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
        detail: `The rule requires ${required}; the cited endpoints are ${found}. The evidence is real and performs a different action.`,
      },
    };
  }
  if (endpoints.length > 0) {
    return {
      satisfied: false,
      evidenceIds: [],
      refusal: {
        reason: 'UNKNOWN_ENDPOINT',
        detail: `The only cited endpoints have unresolved paths (${quote(UNKNOWN_API_PATH_PREFIX)} prefix), so the graph does not know what they are.`,
      },
    };
  }
  return {
    satisfied: false,
    evidenceIds: [],
    refusal: {
      reason: 'UNKNOWN_ENDPOINT',
      detail: `The rule requires ${required}; the claim cited no endpoint the graph contains.`,
    },
  };
}

/**
 * `relationships`: an allowed edge running from the subject to a cited target.
 *
 * Direction is load-bearing. `requires_permission` reaching the subject is what
 * makes "only administrators can create clients" checkable; the same permission
 * node sitting elsewhere in the pack proves nothing about this feature, and
 * accepting it would be the failure mode the whole matrix exists to prevent.
 */
function evaluateRelationships(
  rule: ClaimVerificationRule,
  type: ProductClaimType,
  targets: readonly string[],
  subject: ReadonlySet<string>,
  context: VerificationContext,
): DimensionResult {
  const allowed = rule.relationships;
  if (allowed === undefined) return { satisfied: true, evidenceIds: [] };

  const cited = new Set(targets);
  const witnesses: string[] = [];
  let reachedSubject = false;
  for (const id of subject) {
    for (const relationship of context.outgoing.get(id) ?? []) {
      if (!allowed.includes(relationship.type)) continue;
      reachedSubject = true;
      // The edge counts when the claim cited either end of what it proves: the
      // edge itself, or the node it reaches.
      if (!cited.has(relationship.id) && !cited.has(relationship.target)) continue;
      const target = context.packNodes.get(relationship.target);
      // An edge that reaches a GET endpoint is not evidence of deletion, even
      // when the edge type is right.
      if (target !== undefined && !methodAllowed(target, rule)) continue;
      witnesses.push(relationship.id);
    }
  }
  if (witnesses.length > 0) {
    return { satisfied: true, evidenceIds: [...new Set(witnesses)].sort(compareStrings) };
  }
  const kinds = allowed.join(', ');
  return {
    satisfied: false,
    evidenceIds: [],
    refusal: {
      reason: relationshipFailureReason(type),
      detail: reachedSubject
        ? `The subject has ${kinds} relationships, but none of them reaches a cited fact.`
        : `No ${kinds} relationship runs from the subject to any cited fact.`,
    },
  };
}

/**
 * The route paths and permission strings a claim's own cited facts prove.
 *
 * A cited node speaks for itself; a cited relationship speaks for what it
 * reaches, because `element --requires_permission--> permission:clients:create`
 * is how a permission is proven and the edge is a legitimate thing to cite.
 */
function citedValues(
  targets: readonly string[],
  context: VerificationContext,
): { routes: Set<string>; permissions: Set<string> } {
  const routes = new Set<string>();
  const permissions = new Set<string>();
  const collect = (id: string | undefined): void => {
    if (id === undefined) return;
    const node = context.packNodes.get(id);
    if (node === undefined) return;
    if (node.kind === 'route') routes.add(node.path);
    if (node.kind === 'permission') permissions.add(node.permission);
  };
  for (const target of targets) {
    collect(target);
    collect(context.packRelationships.get(target)?.target);
  }
  return { routes, permissions };
}

/** `"/a", "/b"`, or a plain statement that there were none. */
function listOrNone(values: ReadonlySet<string>, noun: string): string {
  if (values.size === 0) return `cites no ${noun} at all`;
  return `cites ${[...values].sort(compareStrings).map(quote).join(', ')}`;
}

/**
 * Checks the values a model stated in words against the facts it cited.
 *
 * `route` and `permission` are the two fields where a model writes a *value*
 * rather than an id, which makes them the two places a fabrication is cheapest.
 *
 * Two checks, and the second one is the one that matters. Membership in the pack
 * catches a value the application has never had. It does **not** catch a value
 * that is real and belongs to something else: a pack is a neighbourhood, so it
 * routinely holds a sibling feature's route and half a dozen permissions, and
 * "reached at /admin/billing" backed by an edge that proves `/clients/:id` is a
 * sentence a reader would act on and be wrong. So the stated value must also be
 * one the claim's own evidence names.
 */
function evaluateNamedValues(
  route: string | undefined,
  permission: string | undefined,
  targets: readonly string[],
  context: VerificationContext,
): Refusal | undefined {
  if (route === undefined && permission === undefined) return undefined;
  const cited = citedValues(targets, context);

  if (route !== undefined) {
    if (!context.pack.routes.includes(route)) {
      return {
        reason: 'UNKNOWN_ROUTE',
        detail: `The claim names route ${quote(route)}, which is not a route in this feature's evidence.`,
      };
    }
    if (!cited.routes.has(route)) {
      return {
        reason: 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
        detail: `The claim names route ${quote(route)}, but it ${listOrNone(cited.routes, 'route')}. The route is real; nothing the claim points at proves this is the one.`,
      };
    }
  }

  if (permission !== undefined) {
    if (!context.pack.permissions.includes(permission)) {
      return {
        reason: 'UNKNOWN_PERMISSION',
        detail: `The claim names permission ${quote(permission)}, which is not required anywhere in this feature's evidence.`,
      };
    }
    if (!cited.permissions.has(permission)) {
      return {
        reason: 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
        detail: `The claim names permission ${quote(permission)}, but it ${listOrNone(cited.permissions, 'permission')}. The permission is real; nothing the claim points at proves this feature requires it.`,
      };
    }
  }

  return undefined;
}

/**
 * Evaluates every dimension a matrix rule names. All of them must hold.
 *
 * By the time this runs, the subject is known to exist, every cited id is known
 * to be a real fact belonging to this feature, and any route or permission the
 * model wrote out in words is known to appear in the pack. What is left to
 * decide is the only interesting question: whether those facts are the *right*
 * facts for this assertion.
 */
function evaluateRule(
  rule: ClaimVerificationRule,
  draft: ClaimDraft,
  subject: ReadonlySet<string>,
  context: VerificationContext,
): FactualResolution {
  const targets = draft.targets;

  const dimensions = [
    evaluateKinds(rule, draft.type, targets, context),
    evaluateMethods(rule, targets, context),
    evaluateRelationships(rule, draft.type, targets, subject, context),
  ];
  const evidenceIds: string[] = [];
  for (const dimension of dimensions) {
    if (!dimension.satisfied) {
      return {
        outcome: 'REJECTED_INVALID',
        evidenceIds: [],
        ...(dimension.refusal === undefined ? {} : { refusal: dimension.refusal }),
      };
    }
    evidenceIds.push(...dimension.evidenceIds);
  }
  return { outcome: 'SUPPORTED_VERIFICATION_RULE', evidenceIds };
}

// ---------------------------------------------------------------------------
// The prose gate
// ---------------------------------------------------------------------------

/**
 * The readable half of one graph fact: the words the application itself uses.
 *
 * An element's label is what a user sees on the button, a route's path is what
 * the address bar says. These are extracted from source by the indexer, so a
 * word that appears in one is a word the application uses — unlike
 * {@link ProductClaim.text}, which is a word a model chose.
 */
function nodeLanguage(node: ApplicationNode): string[] {
  switch (node.kind) {
    case 'element':
      return node.label === undefined ? [node.elementId] : [node.elementId, node.label];
    case 'route':
      return [node.path];
    case 'api':
      return [node.path];
    case 'permission':
      return [node.permission];
    case 'file':
      return [node.path];
    default:
      return [node.name];
  }
}

/**
 * The language the facts one claim cited bring with them.
 *
 * A cited relationship contributes both of its ends, because the edge is a fact
 * about the pair. Nothing outside the cited set contributes: passing the whole
 * pack would license every word in the neighbourhood, which is the shortcut
 * `./proposition.ts` warns about.
 */
function evidenceLanguageOf(targets: readonly string[], context: VerificationContext): string[] {
  const language: string[] = [];
  const add = (id: string | undefined): void => {
    if (id === undefined) return;
    const node = context.packNodes.get(id);
    if (node !== undefined) language.push(...nodeLanguage(node));
  };
  for (const target of targets) {
    add(target);
    const relationship = context.packRelationships.get(target);
    add(relationship?.source);
    add(relationship?.target);
  }
  return language;
}

/**
 * What the wording of a claim asserts that nothing supports.
 *
 * The honest scope of this check, stated so nobody reads more into a clean
 * result than it carries: it is the eleven-word watchlist in
 * `./proposition.ts`, and it cannot decide whether an English sentence is true.
 * "Creating a client also creates the matching Salesforce contact" passes it.
 * What it does catch is the vocabulary a model reaches for when it is filling a
 * gap — emails, syncs, bulk actions, spreadsheets, things that happen
 * automatically — which is the shape every fabrication in this package's
 * adversarial fixtures actually takes.
 *
 * It exists because {@link ProductClaim.text} ships. It is printed on the
 * feature page beside the assertion, and it becomes a workflow step. The
 * assertion is what was verified; the sentence is what a person reads, and
 * nothing else in the pipeline looks at the sentence at all.
 */
function unsupportedWording(
  text: string,
  backing: readonly ProductClaim[],
  evidenceLanguage: readonly string[],
): string[] {
  return checkRenderedPropositions(text, backing, { evidenceLanguage }).introduced;
}

// ---------------------------------------------------------------------------
// Registered verifiers
// ---------------------------------------------------------------------------

/**
 * Runs an application-supplied check.
 *
 * Everything it is handed has already passed the universal checks, and
 * everything it hands back is checked again: a verifier that upholds a claim
 * without naming a fact, or that names a fact outside the pack, is refused
 * rather than believed. A verifier that throws is refused too — a third-party
 * function failing is not a reason to accept the claim, and it is certainly not
 * a reason to bring the pipeline down.
 */
function runRegisteredVerifier(
  registration: ClaimVerifierRegistration,
  draft: ClaimDraft,
  context: VerificationContext,
): FactualResolution {
  const assertion = draft.assertion;
  if (assertion === undefined) {
    return {
      outcome: 'REJECTED_INVALID',
      evidenceIds: [],
      refusal: { reason: 'NO_SUPPORTING_EVIDENCE', detail: 'The claim carries no assertion.' },
    };
  }
  const label = `${registration.type}${registration.action === undefined ? '' : `/${registration.action}`}`;

  let satisfied = false;
  let evidence: readonly string[] = [];
  let detail = '';
  try {
    const result = registration.verify({
      assertion,
      type: draft.type,
      pack: context.pack,
      graph: context.graph,
      resolveTarget: (id: string) => context.packNodes.get(id),
    });
    satisfied = result.satisfied === true;
    evidence = Array.isArray(result.evidence) ? result.evidence : [];
    detail = typeof result.detail === 'string' ? redactSecrets(result.detail) : '';
  } catch {
    return {
      outcome: 'REJECTED_INVALID',
      evidenceIds: [],
      refusal: {
        reason: kindFailureReason(draft.type),
        detail: `The registered verifier for ${label} threw, so the claim could not be upheld.`,
      },
      registered: label,
    };
  }

  if (!satisfied) {
    return {
      outcome: 'REJECTED_INVALID',
      evidenceIds: [],
      refusal: {
        reason: kindFailureReason(draft.type),
        detail: detail === '' ? `The registered verifier for ${label} refused the claim.` : detail,
      },
      registered: label,
    };
  }

  const cited = evidence.filter((id) => typeof id === 'string' && id.length > 0);
  if (cited.length === 0) {
    return {
      outcome: 'REJECTED_INVALID',
      evidenceIds: [],
      refusal: {
        reason: 'NO_SUPPORTING_EVIDENCE',
        detail: `The registered verifier for ${label} upheld the claim without naming a single graph fact, so nothing was verified.`,
      },
      registered: label,
    };
  }
  const invented = cited.filter(
    (id) => !context.packNodes.has(id) && !context.packRelationships.has(id),
  );
  const outside = invented[0];
  if (outside !== undefined) {
    return {
      outcome: 'REJECTED_INVALID',
      evidenceIds: [],
      refusal: {
        reason: 'UNKNOWN_GRAPH_REFERENCE',
        detail: `The registered verifier for ${label} justified the claim with ${quote(outside)}, which is not in this feature's evidence.`,
      },
      registered: label,
    };
  }

  return {
    outcome: 'SUPPORTED_VERIFICATION_RULE',
    evidenceIds: [...draft.targets, ...cited],
    registered: label,
  };
}

// ---------------------------------------------------------------------------
// One claim
// ---------------------------------------------------------------------------

/** The universal checks, in order. Each one fails closed. */
function checkUniversally(draft: ClaimDraft, context: VerificationContext): Refusal | undefined {
  const subjectRef = draft.assertion?.subjectRef ?? '';

  // 1. Subject identity. Exact match, deliberately: a trimmed or case-folded
  //    lookup is a way for a model to name something that does not exist.
  const subject = subjectFor(subjectRef, context);
  if (subject === undefined) {
    return {
      reason: 'UNKNOWN_SUBJECT',
      detail: `${quote(subjectRef)} names neither a known feature nor a node in the graph.`,
    };
  }

  // 2. Subject scope. The identity is real; it still has to be *this* feature's.
  //    Without this check a rule that names no `relationships` dimension —
  //    `capability/view` and `workflow_step` are the two — has nothing at all
  //    tying the assertion to the feature it is filed under, because those rules
  //    only ever look at the targets. A claim whose subject is `feature:invoices.create`
  //    would then be stored as a verified fact about `clients.create`, and the
  //    renderer would take the noun for its sentence from it. Rules that *do*
  //    name relationships already refuse this, one step later and for a narrower
  //    reason; this makes it uniform and keeps the refusal accurate.
  if (subject.size === 0) {
    return {
      reason: 'NO_SUPPORTING_EVIDENCE',
      detail: `${quote(subjectRef)} is a real identity, but none of the facts it speaks for are in this feature's evidence, so it cannot be the subject of a claim about ${quote(context.candidate.id)}.`,
    };
  }

  // 3. Target existence.
  for (const target of draft.targets) {
    if (!context.index.nodes.has(target) && !context.index.relationships.has(target)) {
      return {
        reason: 'UNKNOWN_GRAPH_REFERENCE',
        detail: `${quote(target)} does not exist in the graph.`,
      };
    }
  }

  // 4. Target scope. A real id belonging to a different feature is not support
  //    for this one.
  for (const target of draft.targets) {
    if (!context.packNodes.has(target) && !context.packRelationships.has(target)) {
      return {
        reason: 'NO_SUPPORTING_EVIDENCE',
        detail: `${quote(target)} exists, but not in this feature's evidence.`,
      };
    }
  }

  if (draft.targets.length === 0) {
    return { reason: 'NO_SUPPORTING_EVIDENCE', detail: 'The claim cited no graph facts at all.' };
  }

  // 5. Values written out in words, against the facts this claim cited. These
  //    belong with the ids rather than with the rule: a registered verifier gets
  //    to decide whether the evidence supports the assertion, never whether a
  //    route the graph has never seen counts as real.
  return evaluateNamedValues(
    draft.assertion?.route,
    draft.assertion?.permission,
    draft.targets,
    context,
  );
}

/** Resolves one factual assertion to exactly one outcome. */
function verifyFactual(draft: ClaimDraft, context: VerificationContext): FactualResolution {
  const universal = checkUniversally(draft, context);
  if (universal !== undefined) {
    return { outcome: 'REJECTED_INVALID', evidenceIds: [], refusal: universal };
  }

  const assertion = draft.assertion;
  const subject = subjectFor(assertion?.subjectRef ?? '', context) ?? new Set<string>();
  const action: CapabilityAction | undefined = assertion?.action;

  // 6. Rule lookup. Registered checks first, then the matrix. The pair is
  //    matched exactly — a `navigation` claim that also carries an action is an
  //    assertion the matrix has no row for, and saying so is more honest than
  //    quietly checking the action-free rule instead.
  const registration = context.registry?.find(draft.type, action);
  if (registration !== undefined) return runRegisteredVerifier(registration, draft, context);

  const rule = findBuiltInRule(draft.type, action);
  if (rule === undefined) {
    const key = action ?? draft.type;
    // Some gaps are accidents of a small matrix; `import`, `export` and `send`
    // are not. They are absent because no generic graph fact proves them, and
    // saying which kind of gap this is tells a reader whether to expect the
    // matrix to grow or to expect an application to register a verifier.
    const deliberate =
      action !== undefined && UNSUPPORTED_CAPABILITY_ACTIONS.includes(action)
        ? ` The matrix omits ${key} deliberately: no generic graph fact proves it, so an application that can prove it must register a verifier.`
        : '';
    return {
      outcome: 'EXPLICITLY_UNSUPPORTED',
      evidenceIds: [],
      refusal: {
        reason: 'UNSUPPORTED_CLAIM_RULE',
        detail: `No verification rule exists for ${key}. The claim was not checked, and an unchecked claim is not evidence that the application cannot do this.${deliberate}`,
      },
      unsupportedKey: key,
    };
  }

  // 7. Rule evaluation.
  return evaluateRule(rule, draft, subject, context);
}

/**
 * Language claims: grounded, never proven.
 *
 * A purpose asserts nothing about the application, so there is nothing to check
 * it against — but it still may not point at facts that do not exist, or at
 * another feature's facts. It carries no `outcome`, because outcomes describe
 * how an assertion resolved and there is no assertion here.
 *
 * A language claim citing **nothing** is refused rather than grounded. The
 * response schema defaults `targets` to an empty array, so this is reachable,
 * and `semantically_grounded` is documented as "points at evidence that exists"
 * — a status a claim pointing at nothing cannot honestly carry. The docs page
 * says the same thing in words ("checked only for pointing at evidence that
 * exists"), and a page saying that over a row that pointed at nothing is the
 * kind of quiet overstatement this package exists to avoid.
 */
function verifyLanguage(draft: ClaimDraft, context: VerificationContext): Refusal | undefined {
  if (draft.targets.length === 0) {
    return {
      reason: 'NO_SUPPORTING_EVIDENCE',
      detail:
        'The interpretation cites no graph facts at all. It is grounded in nothing, and "grounded in nothing" is not a status this pipeline records.',
    };
  }
  for (const target of draft.targets) {
    if (!context.index.nodes.has(target) && !context.index.relationships.has(target)) {
      return {
        reason: 'UNKNOWN_GRAPH_REFERENCE',
        detail: `${quote(target)} does not exist in the graph.`,
      };
    }
  }
  for (const target of draft.targets) {
    if (!context.packNodes.has(target) && !context.packRelationships.has(target)) {
      return {
        reason: 'NO_SUPPORTING_EVIDENCE',
        detail: `${quote(target)} exists, but not in this feature's evidence.`,
      };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * What is left of a piece of generated prose once redaction has run.
 *
 * A title that was entirely a credential comes back as the placeholder and
 * nothing else, and a placeholder is not a name — presenting a feature under it
 * would be presenting a feature with no name at all.
 *
 * Exported for `./enrich.ts`, which has to apply exactly this rule to the title
 * it keeps and to the description a renderer returns. Two implementations of
 * "what survived" would eventually disagree, and the one that disagreed would
 * be the one that let something through.
 */
export function survivingProse(text: string): string {
  return redactSecrets(text).split(REDACTION_PLACEHOLDER).join(' ').trim();
}

/** Attaches an outcome to a claim built by `./claims.ts`. */
function withOutcome(claim: ProductClaim, outcome: ClaimVerificationOutcome): ProductClaim {
  return { ...claim, outcome };
}

/** Builds the summary object with its keys in a stable, sorted order. */
function sortedCounts(counts: ReadonlyMap<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const key of [...counts.keys()].sort(compareStrings)) {
    result[key] = counts.get(key) ?? 0;
  }
  return result;
}

/**
 * Verifies one feature enrichment against the graph.
 *
 * Every claim the model returned comes back — the upheld ones with their
 * outcome, the refused ones with their reason — because a rejection that is
 * simply dropped is an absence nobody can audit, and the list of things a model
 * tried to say that we would not let it is the single most useful signal this
 * pipeline produces.
 */
export function verifyEnrichment(input: VerifyEnrichmentInput): SemanticVerificationResult {
  const { candidate, pack, graph, enrichment, attribution, provenance } = input;

  const outgoing = new Map<string, Relationship[]>();
  for (const relationship of pack.relationships) {
    const existing = outgoing.get(relationship.source);
    if (existing) existing.push(relationship);
    else outgoing.set(relationship.source, [relationship]);
  }

  const context: VerificationContext = {
    candidate,
    knownFeatureIds: input.knownFeatureIds,
    pack,
    graph,
    index: indexGraph(graph),
    packNodes: new Map(pack.nodes.map((node) => [node.id, node])),
    packRelationships: new Map(pack.relationships.map((r) => [r.id, r])),
    outgoing,
    subjects: new Map<string, ReadonlySet<string> | undefined>(),
    registry: input.registry,
  };

  const claims: ProductClaim[] = [];
  const rejectedClaims: RejectedClaim[] = [];
  const unsupported = new Map<string, number>();
  const registeredPairs = new Set<string>();
  /** Accepted claims, with the draft they came from, for the prose gate below. */
  const upheld: { draft: ClaimDraft; position: number }[] = [];

  let factualClaims = 0;
  let structurallyVerified = 0;
  let languageClaims = 0;
  let semanticallyGrounded = 0;

  for (const draft of draftClaims(candidate.id, enrichment)) {
    if (draft.assertion !== undefined) {
      factualClaims += 1;
      const resolution = verifyFactual(draft, context);
      if (resolution.registered !== undefined) registeredPairs.add(resolution.registered);
      if (resolution.unsupportedKey !== undefined) {
        const key = resolution.unsupportedKey;
        unsupported.set(key, (unsupported.get(key) ?? 0) + 1);
      }

      if (resolution.outcome === 'SUPPORTED_VERIFICATION_RULE') {
        structurallyVerified += 1;
        const evidence = buildEvidence(
          [...draft.targets, ...resolution.evidenceIds],
          context.index,
        );
        upheld.push({ draft, position: claims.length });
        claims.push(
          withOutcome(acceptedClaim(draft, evidence, attribution, provenance), resolution.outcome),
        );
        continue;
      }

      const refusal = resolution.refusal ?? {
        reason: 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM' as const,
        detail: 'The assertion was not upheld.',
      };
      // A refused claim keeps whatever evidence it managed to resolve, so a
      // reader can see what it was reaching for.
      const evidence = buildEvidence(draft.targets, context.index);
      claims.push(
        withOutcome(
          rejectedClaim(draft, evidence, refusal.reason, refusal.detail, attribution, provenance),
          resolution.outcome,
        ),
      );
      rejectedClaims.push({
        claim: draft.id,
        type: draft.type,
        reason: refusal.reason,
        detail: refusal.detail,
      });
      continue;
    }

    languageClaims += 1;
    const refusal = verifyLanguage(draft, context);
    const evidence = buildEvidence(draft.targets, context.index);
    if (refusal === undefined) {
      semanticallyGrounded += 1;
      upheld.push({ draft, position: claims.length });
      claims.push(acceptedClaim(draft, evidence, attribution, provenance));
      continue;
    }
    claims.push(
      rejectedClaim(draft, evidence, refusal.reason, refusal.detail, attribution, provenance),
    );
    rejectedClaims.push({
      claim: draft.id,
      type: draft.type,
      reason: refusal.reason,
      detail: refusal.detail,
    });
  }

  // --- The prose gate. Everything above checked an *assertion*; this is the
  // only place the *sentence* beside it is examined at all, and it is examined
  // narrowly: for capability and effect words nothing accepted supports. The
  // backing set is computed once, from the claims accepted above, so the result
  // does not depend on the order claims are gated in — and it never includes a
  // claim's own text, or a rejected claim, either of which would make the check
  // license whatever it was asked to catch.
  const gateWarnings: string[] = [];
  const backing = claims.filter((claim) => claim.status !== 'rejected');
  const featureLanguage: string[] = [];
  for (const entry of upheld) {
    featureLanguage.push(...evidenceLanguageOf(entry.draft.targets, context));
  }

  for (const entry of upheld) {
    const claim = claims[entry.position];
    /* c8 ignore next -- every recorded position was just written to `claims`. */
    if (claim === undefined) continue;
    const introduced = unsupportedWording(
      claim.text,
      backing,
      evidenceLanguageOf(entry.draft.targets, context),
    );
    if (introduced.length === 0) continue;

    const detail = `The wording asserts ${introduced.map(quote).join(', ')}, which no accepted claim and no cited fact supports. The assertion may well hold; the sentence beside it says more than the assertion does, and the sentence is what a reader acts on.`;
    const refused = rejectedClaim(
      entry.draft,
      claim.evidence,
      'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
      detail,
      attribution,
      provenance,
    );
    // A factual claim keeps exactly one outcome whatever refused it: the
    // contract in `shared/src/semantic.ts` says every one of them lands on one,
    // and a claim that reached this far had a rule and failed it.
    claims[entry.position] =
      entry.draft.assertion === undefined ? refused : withOutcome(refused, 'REJECTED_INVALID');
    rejectedClaims.push({
      claim: entry.draft.id,
      type: entry.draft.type,
      reason: 'EVIDENCE_DOES_NOT_SUPPORT_CLAIM',
      detail,
    });
    if (entry.draft.assertion === undefined) semanticallyGrounded -= 1;
    else structurallyVerified -= 1;
  }

  const claimSummary: FeatureClaimSummary = {
    factualClaims,
    structurallyVerified,
    factualRejected: factualClaims - structurallyVerified,
    languageClaims,
    semanticallyGrounded,
    languageRejected: languageClaims - semanticallyGrounded,
    unsupportedActions: sortedCounts(unsupported),
  };

  const accepted = claims.filter((claim) => claim.status !== 'rejected');
  const withEvidence = accepted.filter((claim) => claim.evidence.length > 0);
  const evidenceCoverage = accepted.length === 0 ? 0 : withEvidence.length / accepted.length;

  const redactedTitle = survivingProse(enrichment.title);
  const description = survivingProse(enrichment.description);

  // The title is the page's H1, the workflow's name, the index row and, in a
  // consuming runtime, weighted search text. It is generated language backed by
  // no claim at all, so it goes through the same gate the claims did; a title
  // that reaches past the evidence is replaced by one built from the feature id
  // rather than being allowed to name a capability nobody proved.
  const titleWords =
    redactedTitle === ''
      ? []
      : unsupportedWording(redactedTitle, accepted, [
          ...featureLanguage,
          ...candidate.rootNodes,
          candidate.id,
        ]);
  const title = titleWords.length === 0 ? redactedTitle : featureTitleFromId(candidate.id);
  if (titleWords.length > 0) {
    gateWarnings.push(
      `The generated title asserted ${titleWords.join(', ')}, which nothing accepted supports. The feature is named from its identifier instead.`,
    );
  }

  const warnings: string[] = [...gateWarnings];
  if (redactedTitle === '' || description === '') {
    warnings.push(
      'The feature was refused: its title or description did not survive redaction, so there is nothing to present.',
    );
  }
  if (pack.truncated) {
    warnings.push(
      'The evidence pack was truncated, so these claims were checked against a partial neighbourhood.',
    );
  }
  const unsupportedTotal = [...unsupported.values()].reduce((sum, count) => sum + count, 0);
  if (unsupportedTotal > 0) {
    const actions = [...unsupported.keys()].sort(compareStrings).join(', ');
    warnings.push(
      `${unsupportedTotal} assertion(s) had no verification rule (${actions}). They were not checked — that is not the same as being disproved.`,
    );
  }
  if (registeredPairs.size > 0) {
    const pairs = [...registeredPairs].sort(compareStrings).join(', ');
    warnings.push(
      `Registered verifiers, rather than the built-in matrix, decided ${pairs}. The universal evidence checks still applied.`,
    );
  }

  return {
    accepted: title !== '' && description !== '' && accepted.length > 0,
    title,
    claims,
    rejectedClaims,
    warnings,
    evidenceCoverage,
    claimSummary,
  };
}

/**
 * The confidence a feature earned, in `[0, 1]`.
 *
 * **Factual claims only.** Language claims are excluded from both halves of the
 * fraction on purpose: counting them would let a feature with three verified
 * facts and ten pleasant sentences outscore one with three verified facts alone,
 * which is exactly backwards — the sentences are the part that was never
 * checked.
 *
 * A feature with no factual claims scores zero. It may be well written; nothing
 * about it was proven, and the summary is where a reader sees the difference.
 */
export function featureConfidence(summary: FeatureClaimSummary): number {
  if (summary.factualClaims === 0) return 0;
  return summary.structurallyVerified / summary.factualClaims;
}
