/**
 * What an observation is allowed to prove.
 *
 * The Round 7 diagnostic ended with a number: fifteen of twenty-one benchmark
 * features could verify no meaningful capability *even if a claim were
 * proposed*, because the static chain from a control to an endpoint breaks in
 * ways the fixture deliberately makes unresolvable — a service that takes its
 * HTTP verb as a parameter, a handler passed through a prop, a dispatch table
 * keyed by a string that resolves to nothing.
 *
 * A running application does not have that problem. The request either happened
 * or it did not; the dialog either appeared or it did not. This module turns
 * those observations into capability candidates, and then refuses most of them.
 *
 * Four rules run through every verifier below.
 *
 * **An effect, not an intention.** Every rule requires something to have
 * *changed*. A click with no observed effect proves a click.
 *
 * **The effect must be causally bounded.** Only effects inside the interaction's
 * own window count. "A POST happened later" is how a background refresh becomes
 * a create capability.
 *
 * **Ownership still applies.** A runtime observation about a node the feature's
 * scope does not own is not that feature's evidence. A browser makes this
 * temptation worse, not better: everything on a page really is there together.
 *
 * **Vision never appears here.** A `VisionProposal` can raise what is worth
 * probing and can reach no rule. `visionOnly` candidates are constructed so they
 * always fail, and a gate asserts the count of accepted ones is zero.
 *
 * @packageDocumentation
 */

import { capabilityDefinition } from '@statewavedev/guide-shared';
import type { ObservedEffect, InteractionTrace } from './interaction.js';

/**
 * What kind of thing a runtime fact is.
 *
 * Written as four *kinds* rather than four rungs, and the distinction is not
 * cosmetic. Listing them in one union invites reading them as a ladder with
 * `VISION_PROPOSED` at the top, which is the exact inversion of the
 * architecture: a model's hypothesis is not a stronger form of an observed
 * effect, it is a different category that never becomes one.
 *
 * So eligibility is a predicate — {@link supportsFactualClaim} — rather than a
 * comparison, and there is no ordering to interpolate across or accidentally
 * invert.
 */
export type RuntimeEvidenceKind =
  /** Seen in a snapshot. An element exists and has this name. */
  | 'OBSERVED'
  /** Tied to a graph node through a semantic id the application declares. */
  | 'CORRELATED'
  /** An interaction produced an effect, inside its window, under a known context. */
  | 'BEHAVIOR_VERIFIED'
  /** A model's hypothesis. Never crosses into fact. */
  | 'VISION_PROPOSED';

/** @deprecated The old name, kept so nothing outside this package breaks. */
export type RuntimeEvidenceAuthority = RuntimeEvidenceKind;

/**
 * Whether a kind of runtime evidence may support a factual claim.
 *
 * Exactly one may. Written as a set membership so that adding a kind does not
 * silently widen the answer, and so that no `>=` can ever be typed here.
 */
const FACTUAL_EVIDENCE_KINDS: ReadonlySet<RuntimeEvidenceKind> = new Set(['BEHAVIOR_VERIFIED']);

/** True only for evidence that may support a factual claim. */
export function supportsFactualClaim(kind: RuntimeEvidenceKind): boolean {
  return FACTUAL_EVIDENCE_KINDS.has(kind);
}

/**
 * The capability kinds a runtime observation can establish.
 *
 * Small on purpose, and every member is here because a fixture proves it. Two
 * are new and deliberately narrow: `filter` says *the visible membership of one
 * collection changed while the collection stayed*, which is what a search box
 * demonstrably does — it does not say "search", still less "full-text search",
 * and Closed Loop #7's refusal of `capability/search` stands untouched.
 */
export type RuntimeCapabilityKind =
  | 'navigate'
  | 'open'
  | 'reveal'
  | 'hide'
  | 'create'
  | 'update'
  | 'delete'
  | 'submit'
  | 'filter'
  | 'select'
  | 'clear_selection';

/** A capability somebody might claim, before anything has checked it. */
export interface RuntimeCapabilityCandidate {
  kind: RuntimeCapabilityKind;
  featureId?: string;
  /** The graph node the acting control correlates to. */
  subjectRef: string;
  runtimeEvidence: readonly ObservedEffect[];
  staticEvidence: readonly string[];
  visualProposals: readonly string[];
  /** The trace this came from. */
  traceId: string;
}

/** What a verifier decided, and why. */
export type RuntimeVerification =
  | {
      status: 'verified';
      authority: 'BEHAVIOR_VERIFIED';
      evidence: readonly string[];
      detail: string;
    }
  | { status: 'rejected'; reason: string; detail: string }
  | { status: 'ambiguous'; detail: string };

const has = <K extends ObservedEffect['kind']>(
  effects: readonly ObservedEffect[],
  kind: K,
): Extract<ObservedEffect, { kind: K }> | undefined =>
  effects.find((effect) => effect.kind === kind) as
    Extract<ObservedEffect, { kind: K }> | undefined;

const describe = (effect: ObservedEffect): string => JSON.stringify(effect);

/**
 * Whether the observations actually establish the candidate.
 *
 * There is no generic fallback. A kind with no rule is rejected by name, so a
 * later addition has to be written down rather than inherited.
 */
export function verifyRuntimeCapability(
  candidate: RuntimeCapabilityCandidate,
  trace: InteractionTrace,
): RuntimeVerification {
  const effects = candidate.runtimeEvidence;

  // A candidate whose only support is a model's opinion. Constructed by the
  // vision path so that the refusal is exercised rather than assumed.
  if (effects.length === 0 && candidate.visualProposals.length > 0) {
    return {
      status: 'rejected',
      reason: 'VISION_ONLY',
      detail:
        'The only support is a visual proposal. A proposal raises what is worth probing and establishes nothing; the interaction produced no observed effect.',
    };
  }

  if (trace.action.kind === 'focus') {
    return {
      status: 'rejected',
      reason: 'NO_USER_ACTION',
      detail: 'Focus is not an action a capability can rest on.',
    };
  }

  // --- The registry decides first -----------------------------------------
  //
  // Everything declarative about a capability — the effects it needs, the
  // effects that refuse it, the interactions it may be claimed from — is
  // answered once, in `shared`, and read here. The switch below adds only what
  // a table cannot express: which effect is the witness, and how to describe it.
  //
  // This is the fix for the defect Closed Loop #10 shipped twice. `select` was
  // defined independently in this file and in the integration layer, both said
  // a route change was enough, and tightening it required finding both. A
  // capability with no registry entry is refused by name rather than falling
  // through to a default.
  const definition = capabilityDefinition(candidate.kind);
  if (definition === undefined) {
    return {
      status: 'rejected',
      reason: 'NO_VERIFICATION_RULE',
      detail: `No canonical definition exists for "${candidate.kind}", so nothing establishes it.`,
    };
  }
  if (definition.actionKinds.length > 0 && !definition.actionKinds.includes(trace.action.kind)) {
    return {
      status: 'rejected',
      reason: 'WRONG_INTERACTION_KIND',
      detail: `A ${candidate.kind} capability is established by ${definition.actionKinds.join(' or ')}, and this interaction was a ${trace.action.kind}.`,
    };
  }
  for (const excluded of definition.refusedWhen) {
    if (has(effects, excluded) === undefined) continue;
    return {
      status: 'rejected',
      reason: definition.refusalWhenExcluded,
      detail: `${definition.requirement}. ${excluded} was observed, which is not that.`,
    };
  }
  for (const required of definition.requires) {
    if (has(effects, required) !== undefined) continue;
    return {
      status: 'rejected',
      reason: definition.refusal,
      detail: `A ${candidate.kind} capability requires ${definition.requirement}. No ${required} was observed.`,
    };
  }

  switch (candidate.kind) {
    case 'navigate': {
      const route = has(effects, 'ROUTE_CHANGED');
      if (route === undefined) {
        return {
          status: 'rejected',
          reason: 'NO_ROUTE_TRANSITION',
          detail: 'Navigation requires the route to have changed within this interaction.',
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(route)],
        detail: `Activating ${candidate.subjectRef} moved from ${route.from} to ${route.to}.`,
      };
    }

    case 'open': {
      const region = has(effects, 'REGION_APPEARED');
      const element = has(effects, 'ELEMENT_APPEARED');
      if (region === undefined && element === undefined) {
        return {
          status: 'rejected',
          reason: 'NOTHING_APPEARED',
          detail: 'Opening requires a region or element to have appeared.',
        };
      }
      if (has(effects, 'ROUTE_CHANGED') !== undefined) {
        return {
          status: 'ambiguous',
          detail:
            'Something appeared and the route also changed. Which of the two the control did is not decidable from this observation.',
        };
      }
      const witness = region ?? element;
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(witness as ObservedEffect)],
        detail: `Activating ${candidate.subjectRef} made ${region !== undefined ? `a ${region.role}` : element?.semanticId} appear.`,
      };
    }

    case 'reveal': {
      const appeared = has(effects, 'ELEMENT_APPEARED');
      if (appeared === undefined) {
        return {
          status: 'rejected',
          reason: 'NOTHING_APPEARED',
          detail: 'Revealing requires an element to have appeared.',
        };
      }
      if (has(effects, 'ROUTE_CHANGED') !== undefined) {
        return {
          status: 'ambiguous',
          detail:
            'Something appeared and the route also changed. An element present on a new screen was not necessarily revealed by this control.',
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(appeared)],
        detail: `Activating ${candidate.subjectRef} made ${appeared.semanticId} appear. What it contains is not established by its appearing.`,
      };
    }

    case 'hide': {
      const gone = has(effects, 'ELEMENT_DISAPPEARED') ?? has(effects, 'REGION_DISAPPEARED');
      if (gone === undefined) {
        return {
          status: 'rejected',
          reason: 'NOTHING_DISAPPEARED',
          detail: 'Hiding requires something to have disappeared.',
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(gone)],
        detail: `Activating ${candidate.subjectRef} removed it from the screen.`,
      };
    }

    case 'create':
    case 'update':
    case 'delete': {
      // A write is proved by the request the application made, not by anything
      // that vanished from a screen. A row disappearing is a render.
      const wanted = { create: 'POST', update: 'PUT', delete: 'DELETE' }[candidate.kind];
      const alternates = candidate.kind === 'update' ? ['PUT', 'PATCH'] : [wanted];
      const request = effects.find(
        (effect): effect is Extract<ObservedEffect, { kind: 'NETWORK_REQUEST' }> =>
          effect.kind === 'NETWORK_REQUEST' && alternates.includes(effect.method),
      );
      if (request === undefined) {
        return {
          status: 'rejected',
          reason: 'NO_WRITE_OBSERVED',
          detail: `A ${candidate.kind} capability requires a ${alternates.join(' or ')} request inside this interaction. Nothing disappearing from a screen is a write.`,
        };
      }
      if (request.statusCategory !== '2xx') {
        return {
          status: 'rejected',
          reason: 'WRITE_DID_NOT_SUCCEED',
          detail: `The ${request.method} to ${request.path} answered ${request.statusCategory}. An attempted write is not a capability.`,
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(request)],
        detail: `Activating ${candidate.subjectRef} sent ${request.method} ${request.path}, which succeeded.`,
      };
    }

    case 'submit': {
      const request = has(effects, 'NETWORK_REQUEST');
      if (request === undefined || trace.action.kind !== 'submit') {
        return {
          status: 'rejected',
          reason: 'NO_SUBMISSION_OBSERVED',
          detail: 'Submitting requires a submit action that produced a request.',
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(request)],
        detail: `Submitting sent ${request.method} ${request.path}.`,
      };
    }

    case 'filter': {
      // The narrowest thing a search box demonstrably does. The registry has
      // already established that this was an input change, that a typed
      // collection's member set differs, and that nothing navigated. What is
      // left is naming the witness.
      //
      // It is not "search", and it says nothing about where the filtering
      // happened — `search` is absent from the registry and stays absent.
      const collection = has(effects, 'COLLECTION_MEMBERS_CHANGED') as Extract<
        ObservedEffect,
        { kind: 'COLLECTION_MEMBERS_CHANGED' }
      >;
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(collection)],
        detail: `Entering a value changed ${collection.containerSemanticId} from ${collection.before} to ${collection.after} ${collection.memberRole} members, with no navigation.`,
      };
    }

    case 'select': {
      // Selection, asked as selection.
      //
      // This rule has been wrong twice. It first read "something appeared, or
      // the route changed", which almost every click satisfies, and shipped
      // "Lets you select an invoice." about a control that navigates to a
      // client. Closed Loop #10 narrowed it to a collection membership change —
      // better, and still the wrong dimension: a page section gaining a dialog
      // counted as membership, so clicking "New client" verified as a
      // selection.
      //
      // Membership and selection are different facts. A row being added is not
      // a row being picked. The registry now requires SELECTION_CHANGED, which
      // exists only when a member of a *typed* collection changed what it
      // declares about being selected — and the observer reads that from ARIA
      // and native form state, never from a label, an identifier or a class.
      const selection = has(effects, 'SELECTION_CHANGED') as Extract<
        ObservedEffect,
        { kind: 'SELECTION_CHANGED' }
      >;
      if (selection.selected.length === 0) {
        return {
          status: 'rejected',
          reason: 'NO_SELECTION_GAINED',
          detail:
            'Selection state changed, but nothing became selected. Losing a selection is clearing one, which is a different capability.',
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(selection)],
        detail: `Activating ${candidate.subjectRef} made ${selection.selected.join(', ')} declare itself selected inside ${selection.containerSemanticId}, with no navigation.`,
      };
    }

    case 'clear_selection': {
      // The label reads "Clear selection". That is naming, never proof — the
      // fixture's control calls a local function that routes nowhere and marks
      // nothing, and it was refused for a whole loop on the strength of what it
      // did rather than what it is called.
      //
      // Clearing requires a selection to have existed and to be gone.
      const selection = has(effects, 'SELECTION_CHANGED') as Extract<
        ObservedEffect,
        { kind: 'SELECTION_CHANGED' }
      >;
      if (selection.deselected.length === 0 || selection.selectedBefore === 0) {
        return {
          status: 'rejected',
          reason: 'NO_SELECTION_CLEARED',
          detail:
            'Clearing a selection requires something to have been selected before the interaction and unselected after it.',
        };
      }
      if (selection.selectedAfter > 0) {
        return {
          status: 'rejected',
          reason: 'SELECTION_REPLACED_NOT_CLEARED',
          detail: `${selection.selectedAfter} member(s) are still selected, so the selection moved rather than cleared.`,
        };
      }
      return {
        status: 'verified',
        authority: 'BEHAVIOR_VERIFIED',
        evidence: [describe(selection)],
        detail: `Activating ${candidate.subjectRef} left nothing selected inside ${selection.containerSemanticId}.`,
      };
    }
  }
}
