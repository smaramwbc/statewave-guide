/**
 * What a feature *could* truthfully be said to do.
 *
 * Round 1 asked a model to read a graph and invent factual claims about it. It
 * was good at finding the right evidence — 89% of the facts the gold set wanted
 * — and bad at turning that into something provable: 20% of its factual claims
 * survived verification. The dominant failure was not fabrication. It was
 * citing a real fact without citing the *relationship* that proved the claim,
 * ninety-four times.
 *
 * That is deterministic work. The graph knows which assertions its own
 * verification rules would uphold; asking a model to rediscover them from prose
 * is asking it to re-derive a decision procedure we already have, and then
 * grading it on the parts it got wrong.
 *
 * So the division of labour changes:
 *
 * > Deterministic code proposes what is *provable*. The model decides what is
 * > *worth saying*. The verifier still decides what survives.
 *
 * Every opportunity here has already been run through the real verifier and
 * come back SUPPORTED. There is no second rule engine: the planner enumerates
 * from {@link BUILT_IN_VERIFICATION_RULES} and proves through
 * {@link createAssertionProbe}, the same code path that will judge the model's
 * answer. A planner with its own copy of the matrix would drift from it, and
 * the drift would show up as opportunities the verifier refuses — the pipeline
 * blaming the model for its own disagreement.
 *
 * What this does **not** do is widen what may be claimed. An action with no
 * rule gets no opportunity, and `import`, `export`, `search` and `send` have no
 * rule deliberately. The planner cannot offer what the verifier cannot prove,
 * because the only way it learns an assertion is possible is by the verifier
 * saying so.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph } from '@statewavedev/guide-indexer';
import type { CapabilityAction, ProductClaimType } from '@statewavedev/guide-shared';
import { BUILT_IN_VERIFICATION_RULES, FACTUAL_CLAIM_TYPES } from '@statewavedev/guide-shared';
import type { FeatureCandidate } from './candidates.js';
import type { ClaimDraft } from './claims.js';
import { compareStrings } from './compare.js';
import type { EvidencePack } from './evidence-pack.js';
import type { ClaimOpportunityRegistry } from './opportunity-registry.js';
import type { ClaimVerifierRegistry } from './registry.js';
import type { FeatureScope, OwnershipStep } from './scope.js';
import { describeOwnershipPath } from './scope.js';
import { FEATURE_SUBJECT_PREFIX, createAssertionProbe } from './verifier.js';
import type { FactualResolution } from './verifier.js';

/**
 * One factual claim this feature could truthfully make.
 *
 * Everything a model may not decide is fixed here: the subject's identity, the
 * rule that will judge it, the action, and the graph facts that prove it. What
 * the model contributes is the part deterministic code cannot — whether a user
 * would recognise this as something the product does, and how to say it.
 */
export interface ClaimOpportunity {
  /**
   * Stable across runs and derived from content, so the same graph offers the
   * same opportunity under the same id and a stored decision can be replayed.
   */
  id: string;
  featureId: string;
  type: ProductClaimType;
  action?: CapabilityAction;
  /** The identity this claim would be about. Not the model's to change. */
  subjectRef: string;
  /** Graph facts that proved it — the verifier's own witnesses, not a guess. */
  targets: readonly string[];
  /** A route this assertion names, when the rule established one. */
  route?: string;
  /** A permission this assertion names, when the rule established one. */
  permission?: string;
  /** Why the subject belongs to this feature, for the inspector and for review. */
  ownershipPath: readonly OwnershipStep[];
  /** How the ownership path reads. */
  ownershipSummary: string;
  /**
   * What proved this opportunity was available.
   *
   * Optional so every existing opportunity keeps its shape and its id; absent
   * means `static`, which is what every opportunity was before Closed Loop #10.
   * Recorded rather than inferred, because "the graph shows this is possible"
   * and "a browser watched it happen" are different guarantees and a reader
   * looking at an accepted claim is entitled to know which one they have.
   */
  evidenceSource?: ClaimEvidenceSource;
}

/** Where the evidence behind an opportunity came from. */
export type ClaimEvidenceSource =
  /** The ApplicationGraph. True of every run, because the code cannot do otherwise. */
  | 'static'
  /** An observed interaction, under a recorded `RuntimeContext`. */
  | 'runtime';

/** A model's answer to one opportunity. */
export type ClaimDecision =
  | { opportunityId: string; decision: 'accept'; text: string; subjectLabel?: string }
  | { opportunityId: string; decision: 'decline'; reason?: string };

/** An opportunity the model chose not to take, kept so restraint is measurable. */
export interface DeclinedOpportunity {
  opportunityId: string;
  featureId: string;
  type: ProductClaimType;
  action?: CapabilityAction;
  reason?: string;
}

/** What {@link planClaimOpportunities} needs. */
export interface OpportunityPlanInput {
  candidate: FeatureCandidate;
  knownFeatureIds: ReadonlySet<string>;
  pack: EvidencePack;
  graph: ApplicationGraph;
  scope: FeatureScope;
  registry?: ClaimVerifierRegistry;
  /**
   * Application-supplied sources of opportunities.
   *
   * A provider here without a verifier in `registry` for the same pair does
   * nothing: it would propose a claim that is refused the instant a model
   * accepts it, which costs an answer and reads like the model's mistake.
   */
  opportunityRegistry?: ClaimOpportunityRegistry;
}

/**
 * Caps, applied after a deterministic sort so truncation keeps the shortest
 * proofs rather than an arbitrary slice.
 *
 * The planner's cost is subjects × rules, not a cross-product: for each pair it
 * offers the verifier every witness the subject can reach at once and lets the
 * rule pick, rather than enumerating subsets. These bounds exist for graphs far
 * larger than any fixture, where "every owned node" stops being a small number.
 */
export const OPPORTUNITY_LIMITS = {
  maxSubjects: 24,
  maxOpportunities: 40,
  maxTargetsPerOpportunity: 8,
} as const;

/** Node kinds that can plausibly be the subject of a claim about a product. */
const SUBJECT_KINDS = ['element', 'component', 'route', 'api'] as const;

function kindOf(nodeId: string): string {
  return nodeId.slice(0, Math.max(0, nodeId.indexOf(':')));
}

/**
 * A content-derived id, short enough for a model to copy back exactly.
 *
 * Deliberately not a counter: a decision recorded against `#3` becomes a
 * decision about something else the moment an unrelated rule starts matching.
 * Equally deliberately not the subject id spelled out — a component subject
 * carries its whole file path, which put these over the wire schema's length
 * cap and cost a whole feature's answer to a schema violation. The subject is
 * hashed instead, so the id stays stable, stays derived from content, and stays
 * short enough to quote without a mistake.
 */
function opportunityId(
  featureId: string,
  type: ProductClaimType,
  action: CapabilityAction | undefined,
  subjectRef: string,
): string {
  return `${featureId}#${type}${action === undefined ? '' : `:${action}`}#${shortHash(subjectRef)}`;
}

/** A stable 8-character digest. FNV-1a: no dependency, and no cryptography implied. */
function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Every factual claim this feature could truthfully make, in a stable order.
 *
 * The order is `(type, action, subjectRef)`, not discovery order, so two runs
 * over the same graph offer the same list and a model's decisions replay.
 */
export function planClaimOpportunities(input: OpportunityPlanInput): ClaimOpportunity[] {
  const probe = createAssertionProbe({
    candidate: input.candidate,
    knownFeatureIds: input.knownFeatureIds,
    pack: input.pack,
    graph: input.graph,
    // Nothing is recorded from this probe, so the response-shaped fields are
    // placeholders. Only the graph, the pack and the scope decide the answer.
    enrichment: {
      title: 'planner',
      description: 'planner',
      factualClaims: [],
      decisions: [],
      languageClaims: [],
      confidenceReason: 'planner',
    },
    attribution: { provider: 'planner', model: 'planner' },
    provenance: { graphHash: 'planner', dependencyFingerprint: 'planner' },
    scope: input.scope,
    ...(input.registry === undefined ? {} : { registry: input.registry }),
  });

  const subjects = collectSubjects(input.scope, input.candidate.id);
  const found: ClaimOpportunity[] = [];

  for (const rule of orderedRules(input.registry)) {
    for (const subjectRef of subjects) {
      if (found.length >= OPPORTUNITY_LIMITS.maxOpportunities) break;

      const witnesses = witnessesFor(subjectRef, input.scope);
      if (witnesses.length === 0) continue;

      const draft = toDraft(input.candidate.id, rule.type, rule.action, subjectRef, witnesses);
      const resolution = probe(draft);
      if (resolution.outcome !== 'SUPPORTED_VERIFICATION_RULE') continue;

      // The rule reports which facts actually carried it. Narrowing to those
      // keeps the offer honest — an opportunity listing eight targets when two
      // proved it invites a model to believe the other six mattered.
      const proving = resolution.evidenceIds.length > 0 ? resolution.evidenceIds : witnesses;
      const targets = [...new Set(proving)]
        .sort(compareStrings)
        .slice(0, OPPORTUNITY_LIMITS.maxTargetsPerOpportunity);

      if (isSelfOnly(rule.type, subjectRef, targets)) continue;

      const path = input.scope.ownershipPath(subjectRef) ?? [];
      found.push({
        id: opportunityId(input.candidate.id, rule.type, rule.action, subjectRef),
        featureId: input.candidate.id,
        type: rule.type,
        ...(rule.action === undefined ? {} : { action: rule.action }),
        subjectRef,
        targets,
        ownershipPath: path,
        ownershipSummary: describeOwnershipPath(path),
      });
    }
  }

  for (const opportunity of fromProviders(input, probe)) found.push(opportunity);

  return dedupe(found).sort(
    (a, b) =>
      compareStrings(a.type, b.type) ||
      compareStrings(a.action ?? '', b.action ?? '') ||
      compareStrings(a.subjectRef, b.subjectRef),
  );
}

/**
 * Opportunities an application's own providers proposed, each one proved first.
 *
 * A provider is a source of *candidates*, never of conclusions. Its drafts go
 * through the same probe as everything the built-in planner enumerates, so a
 * provider cannot mint a claim the verifier would refuse, cite a sibling's
 * evidence, or reach outside the feature's scope.
 */
function fromProviders(
  input: OpportunityPlanInput,
  probe: (draft: ClaimDraft) => FactualResolution,
): ClaimOpportunity[] {
  const providers = input.opportunityRegistry?.list() ?? [];
  if (providers.length === 0) return [];

  const found: ClaimOpportunity[] = [];
  for (const provider of providers) {
    // Both halves or neither. A proposal nothing can judge is worse than no
    // proposal: the model spends an answer on it and the reader sees a refusal.
    if (input.registry?.find(provider.type, provider.action) === undefined) continue;

    const drafts = provider.discover({
      featureId: input.candidate.id,
      scope: input.scope,
      pack: input.pack,
      graph: input.graph,
    });

    for (const draft of drafts) {
      // The registered pair is the pair. A provider registered for
      // `capability/view` returning `create` drafts would have them judged by
      // the built-in create rule, which is not what anyone registered.
      const targets = [...new Set(draft.targets)]
        .filter((target) => input.scope.canWitness(target))
        .sort(compareStrings)
        .slice(0, OPPORTUNITY_LIMITS.maxTargetsPerOpportunity);
      if (targets.length === 0) continue;
      if (input.scope.classify(draft.subjectRef) !== 'OWNED') continue;

      const probed = probe(
        toDraft(input.candidate.id, provider.type, provider.action, draft.subjectRef, targets),
      );
      if (probed.outcome !== 'SUPPORTED_VERIFICATION_RULE') continue;

      const path = input.scope.ownershipPath(draft.subjectRef) ?? [];
      found.push({
        id: opportunityId(input.candidate.id, provider.type, provider.action, draft.subjectRef),
        featureId: input.candidate.id,
        type: provider.type,
        ...(provider.action === undefined ? {} : { action: provider.action }),
        subjectRef: draft.subjectRef,
        targets,
        ownershipPath: path,
        ownershipSummary: describeOwnershipPath(path),
      });
    }
  }
  return found;
}

/**
 * One offer per assertion, spoken by the thing closest to the feature.
 *
 * A feature's create capability is usually provable from several subjects at
 * once — the button, the feature itself, the dialog, the endpoint — and every
 * one of them yields the same sentence. Offering all six is not six choices; it
 * is one choice asked six times, and a cooperative model accepts each of them,
 * which turns a single fact into six claims and a coverage metric into a lie.
 *
 * The survivor is the subject with the shortest ownership path, which is the
 * one nearest the feature's root: the control a user presses, rather than the
 * endpoint it eventually reaches. Ties break on the id so the choice is stable.
 *
 * `workflow_step` is exempt. Its subjects are genuinely different steps, and
 * collapsing them would leave a one-step workflow for every feature.
 */
function dedupe(found: readonly ClaimOpportunity[]): ClaimOpportunity[] {
  const best = new Map<string, ClaimOpportunity>();
  const kept: ClaimOpportunity[] = [];
  for (const opportunity of found) {
    if (opportunity.type === 'workflow_step') {
      kept.push(opportunity);
      continue;
    }
    const key = `${opportunity.type}|${opportunity.action ?? ''}`;
    const existing = best.get(key);
    if (existing === undefined || isCloser(opportunity, existing)) best.set(key, opportunity);
  }
  return [...kept, ...best.values()];
}

/** Nearer the feature root, then lexicographically, so the pick never drifts. */
function isCloser(a: ClaimOpportunity, b: ClaimOpportunity): boolean {
  if (a.ownershipPath.length !== b.ownershipPath.length) {
    return a.ownershipPath.length < b.ownershipPath.length;
  }
  return compareStrings(a.subjectRef, b.subjectRef) < 0;
}

/**
 * A `workflow_step` whose only evidence is its own subject says nothing.
 *
 * The rule names no `relationships` and no `httpMethods`, so an element citing
 * itself satisfies it — measured, that made every candidate in the fixture
 * offer at least one content-free step, and a cooperative model accepts them
 * all. "This element is a step" is not product understanding; it is the shape
 * of the schema showing through.
 */
function isSelfOnly(
  type: ProductClaimType,
  subjectRef: string,
  targets: readonly string[],
): boolean {
  if (type !== 'workflow_step') return false;
  return targets.every((target) => target === subjectRef);
}

/** Owned nodes that could plausibly be spoken about, plus the feature itself. */
function collectSubjects(scope: FeatureScope, featureId: string): string[] {
  const owned = scope
    .entries()
    .filter((entry) => entry.scope === 'OWNED')
    .map((entry) => entry.nodeId)
    .filter((nodeId) => (SUBJECT_KINDS as readonly string[]).includes(kindOf(nodeId)))
    .sort(compareStrings)
    .slice(0, OPPORTUNITY_LIMITS.maxSubjects);
  return [`${FEATURE_SUBJECT_PREFIX}${featureId}`, ...owned];
}

/**
 * Everything a subject could prove a claim with.
 *
 * Forward closure rather than ownership-path prefix. A path is the
 * lexicographically least *shortest* route, so a node genuinely downstream of
 * the subject may have been discovered by a shorter one and would fail a prefix
 * test — `permission:clients:create` is one hop from the create button and
 * seven from the endpoint, and the endpoint demonstrably requires it.
 */
function witnessesFor(subjectRef: string, scope: FeatureScope): string[] {
  const reachable = subjectRef.startsWith(FEATURE_SUBJECT_PREFIX)
    ? scope
        .entries()
        .filter((entry) => entry.scope !== 'CONTEXTUAL')
        .map((entry) => entry.nodeId)
    : [subjectRef, ...scope.reachableFrom(subjectRef)];
  return [...new Set(reachable)].filter((nodeId) => scope.canWitness(nodeId)).sort(compareStrings);
}

/** A draft shaped exactly as the model's answer will be, so the probe is honest. */
function toDraft(
  featureId: string,
  type: ProductClaimType,
  action: CapabilityAction | undefined,
  subjectRef: string,
  targets: readonly string[],
): ClaimDraft {
  return {
    id: `${featureId}#plan`,
    featureId,
    type,
    text: 'planner probe',
    assertion: {
      subjectRef,
      ...(action === undefined ? {} : { action }),
      targets: [...targets],
    },
    targets: [...targets],
    ordinal: 1,
  };
}

/**
 * The rules to enumerate, built-ins plus anything an application registered.
 *
 * A registered verifier is what makes an otherwise unsupported action provable,
 * so the planner has to know about it — but it never *invents* the pair. An
 * action with neither a built-in rule nor a registration yields nothing, which
 * is why `import`, `export`, `search` and `send` produce no opportunities here.
 */
function orderedRules(
  registry: ClaimVerifierRegistry | undefined,
): { type: ProductClaimType; action?: CapabilityAction }[] {
  const pairs = new Map<string, { type: ProductClaimType; action?: CapabilityAction }>();
  for (const rule of BUILT_IN_VERIFICATION_RULES) {
    pairs.set(`${rule.type}|${rule.action ?? ''}`, {
      type: rule.type,
      ...(rule.action === undefined ? {} : { action: rule.action }),
    });
  }
  for (const registration of registry?.list() ?? []) {
    if (!(FACTUAL_CLAIM_TYPES as readonly string[]).includes(registration.type)) continue;
    pairs.set(`${registration.type}|${registration.action ?? ''}`, {
      type: registration.type,
      ...(registration.action === undefined ? {} : { action: registration.action }),
    });
  }
  return [...pairs.values()].sort(
    (a, b) => compareStrings(a.type, b.type) || compareStrings(a.action ?? '', b.action ?? ''),
  );
}
