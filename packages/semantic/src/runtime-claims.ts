/**
 * Turning something a browser watched into something the ProductModel holds.
 *
 * Closed Loop #9 built the sensor and stopped at the boundary: eight capabilities
 * were behaviour-verified against the running fixture and not one of them reached
 * a claim. This is the connection, and the whole design question is how to make
 * it without the connection becoming a hole.
 *
 * Four things a runtime observation must survive before it is a claim.
 *
 * **It must be about something the graph knows.** A runtime element earns static
 * identity through the semantic id the application declares, and through nothing
 * else. An unmapped observation produces no claim, ever.
 *
 * **The feature must own it.** `FeatureScope` is not suspended because a browser
 * was involved — if anything a browser makes borrowing more tempting, since
 * everything on a page really is there together.
 *
 * **The behaviour must have a rule.** There is no `if (behaviorVerified) accept`.
 * Each capability action has a contract naming the effects it requires, and an
 * action with no contract is refused by name rather than by omission.
 *
 * **The context travels with it.** One observation happened on one route, under
 * one permission set, in one fixture state. The claim records all three, because
 * a capability that silently became universal would be the most damaging thing
 * this subsystem could produce — it would read exactly like a proof.
 *
 * The claims this produces are `behaviorally_verified`, not
 * `structurally_verified`. Both are verified and they are not the same guarantee:
 * one is a proof about the program, the other a report about a run.
 *
 * @packageDocumentation
 */

import { CAPABILITY_REGISTRY } from '@statewavedev/guide-shared';
import type { CapabilityAction, ProductClaim } from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';
import type { FeatureScope } from './scope.js';

/**
 * One behaviour-verified candidate, as it crosses the package boundary.
 *
 * Serialisable on purpose. The evidence is produced by a DOM harness and
 * consumed by a build script, so it travels as a committed artefact with its own
 * hash rather than as a live object — which is also what makes the claim
 * replayable and lets it go stale when the fixture changes.
 */
export interface RuntimeCapabilityRecord {
  /** The capability the observation supports. */
  action: CapabilityAction;
  featureId: string;
  /** The graph node the acting control correlates to. */
  subjectRef: string;
  /** Graph nodes this observation also names. */
  targets: readonly string[];
  /** The neutral effects observed, already serialised. */
  effects: readonly string[];
  /** The rule that accepted it, by name. */
  rule: string;
  /** What was true of the world when it was observed. */
  context: RuntimeClaimContext;
  traceId: string;
  /** Hash of the normalised evidence this rests on. */
  evidenceHash: string;
  /** The graph the run was correlated against. */
  graphHash: string;
}

/** The circumstances one observation was made under. */
export interface RuntimeClaimContext {
  route: string;
  fixtureState: string;
  permissions: readonly string[];
  featureFlags: Readonly<Record<string, boolean>>;
}

/** Why a runtime record did not become a claim. */
export type RuntimeIntegrationRefusal =
  /** The subject is not a node the graph contains. */
  | 'UNMAPPED_SUBJECT'
  /** The feature's scope does not own the subject. */
  | 'NOT_OWNED'
  /** No integration rule exists for this capability action. */
  | 'NO_RUNTIME_RULE'
  /** The rule exists and the recorded effects do not satisfy it. */
  | 'EFFECTS_DO_NOT_SATISFY_RULE'
  /** A static claim already asserts the opposite. */
  | 'CONTRADICTS_STATIC_CLAIM';

/** What integration made of one record. */
export type RuntimeIntegrationOutcome =
  | { status: 'accepted'; claim: ProductClaim }
  | { status: 'refused'; reason: RuntimeIntegrationRefusal; detail: string }
  | { status: 'contradiction'; detail: string; staticClaimId: string };

/**
 * What each runtime capability action requires — **derived, never restated**.
 *
 * This used to be a hand-written table sitting alongside an equally hand-written
 * one in the runtime verifier, both answering the same semantic question. They
 * diverged exactly as you would expect: both said `select` needed only a route
 * change, and the pair of them put *"Lets you select an invoice."* in front of a
 * reviewer about a control that leaves the invoice list and shows a client.
 * Fixing it meant finding and editing two places, and the second was found by
 * luck.
 *
 * So the table is now a projection of {@link CAPABILITY_REGISTRY}, filtered to
 * the capabilities that may reach the ProductModel. Adding a capability here is
 * impossible; it is added to the registry, or it does not exist. The consistency
 * gate fails if this file grows a private opinion again.
 */
export const RUNTIME_VERIFICATION_RULES: readonly {
  action: CapabilityAction;
  requires: readonly string[];
  refusedWhen: readonly string[];
  requirement: string;
}[] = CAPABILITY_REGISTRY.filter((entry) => entry.integrable).map((entry) => ({
  action: entry.kind as CapabilityAction,
  requires: entry.requires,
  refusedWhen: entry.refusedWhen,
  requirement: entry.requirement,
}));

/** The rule for an action, when one exists. */
export function runtimeRuleFor(
  action: CapabilityAction,
): (typeof RUNTIME_VERIFICATION_RULES)[number] | undefined {
  return RUNTIME_VERIFICATION_RULES.find((rule) => rule.action === action);
}

/** What {@link integrateRuntimeCapability} needs. */
export interface IntegrateInput {
  record: RuntimeCapabilityRecord;
  scope: FeatureScope;
  /** Every node id the graph holds. */
  graphNodeIds: ReadonlySet<string>;
  /** Claims the ProductModel already holds for this feature. */
  existingClaims: readonly ProductClaim[];
  /** Ordinal for the claim id, so ids stay deterministic. */
  ordinal: number;
}

/**
 * One record, checked and either turned into a claim or refused with a reason.
 *
 * Every refusal is named. A record that silently produced nothing would be
 * indistinguishable from a record that was never offered, which is the failure
 * mode Closed Loop #5 spent a whole round on.
 */
export function integrateRuntimeCapability(input: IntegrateInput): RuntimeIntegrationOutcome {
  const { record } = input;

  if (!input.graphNodeIds.has(record.subjectRef)) {
    return {
      status: 'refused',
      reason: 'UNMAPPED_SUBJECT',
      detail: `${record.subjectRef} is not a node the graph contains, so nothing may be attributed to it.`,
    };
  }

  const scopeClass = input.scope.classify(record.subjectRef);
  if (scopeClass !== 'OWNED') {
    return {
      status: 'refused',
      reason: 'NOT_OWNED',
      detail: `${record.featureId} classifies ${record.subjectRef} as ${scopeClass}. A control being on the same screen is not the same as belonging to the feature.`,
    };
  }

  const rule = runtimeRuleFor(record.action);
  if (rule === undefined) {
    return {
      status: 'refused',
      reason: 'NO_RUNTIME_RULE',
      detail: `No runtime rule establishes "${record.action}". A capability with no contract is refused rather than inherited from a default.`,
    };
  }

  const kinds = new Set(record.effects.map((effect) => effect.split('|')[0]));
  const missing = rule.requires.filter((required) => !kinds.has(required));
  if (missing.length > 0) {
    return {
      status: 'refused',
      reason: 'EFFECTS_DO_NOT_SATISFY_RULE',
      detail: `The rule requires ${rule.requirement}; the observation is missing ${missing.join(', ')}.`,
    };
  }
  const forbidden = rule.refusedWhen.filter((banned) => kinds.has(banned));
  if (forbidden.length > 0) {
    return {
      status: 'refused',
      reason: 'EFFECTS_DO_NOT_SATISFY_RULE',
      detail: `The rule refuses this when ${forbidden.join(', ')} is also observed, because the change may simply be a different screen.`,
    };
  }

  // Static and runtime disagreeing is a finding, not a tie to be broken here.
  const contradiction = input.existingClaims.find(
    (claim) =>
      claim.status === 'structurally_verified' &&
      claim.type === 'capability' &&
      claim.assertion?.subjectRef === record.subjectRef &&
      claim.assertion.action !== undefined &&
      claim.assertion.action !== record.action &&
      OPPOSED.some(
        (pair) =>
          (pair[0] === claim.assertion?.action && pair[1] === record.action) ||
          (pair[1] === claim.assertion?.action && pair[0] === record.action),
      ),
  );
  if (contradiction !== undefined) {
    return {
      status: 'contradiction',
      staticClaimId: contradiction.id,
      detail: `The graph proves ${contradiction.assertion?.action} for ${record.subjectRef} and the run observed ${record.action}. Neither is discarded here; the disagreement is reported so somebody decides.`,
    };
  }

  return {
    status: 'accepted',
    claim: {
      id: `${record.featureId}#capability:runtime:${input.ordinal}`,
      featureId: record.featureId,
      type: 'capability',
      // A rendering of the assertion, not the claim. The guidance compiler never
      // reads this; it reads the assertion.
      text: describeRuntimeCapability(record),
      assertion: {
        subjectRef: record.subjectRef,
        action: record.action,
        targets: [...record.targets].sort(compareStrings),
      },
      provenance: { graphHash: record.graphHash, dependencyFingerprint: record.evidenceHash },
      evidence: record.effects.map((effect) => ({ ref: effect, kind: 'runtime' as const })),
      status: 'behaviorally_verified',
      outcome: 'SUPPORTED_VERIFICATION_RULE',
      generatedBy: { provider: 'runtime-observation', model: 'none', version: '1' },
      // The context is the difference between a report and a proof.
      runtimeContext: record.context,
      runtimeTraceId: record.traceId,
    },
  };
}

/**
 * Pairs of actions that cannot both be true of one control.
 *
 * Short on purpose. Two capabilities are only contradictory when one asserts a
 * write and the other asserts that pressing the control does something else
 * entirely; a control that both navigates and reveals is ordinary.
 */
const OPPOSED: readonly (readonly [CapabilityAction, CapabilityAction])[] = [
  ['delete', 'navigate'],
  ['delete', 'open'],
  ['create', 'navigate'],
  ['update', 'navigate'],
];

/** How a runtime capability reads, for the inspector. Never user copy. */
function describeRuntimeCapability(record: RuntimeCapabilityRecord): string {
  return `Observed on ${record.context.route}: ${record.action} at ${record.subjectRef}.`;
}
