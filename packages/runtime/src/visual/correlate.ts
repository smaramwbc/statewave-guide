/**
 * Checking a visual hypothesis against evidence that owns the answer.
 *
 * A proposal arrives saying the screen looks like a client list, or that a
 * button is visible, or that three controls form a toolbar. This layer asks what
 * the DOM, the runtime and the ProductModel already say, and records one of
 * three outcomes. It never *upgrades* anything: `SUPPORTED` means the other
 * evidence agreed, not that a claim now exists.
 *
 * `CONTRADICTED` is the load-bearing case. When a model reports a Delete button
 * on a screen where the DOM has none, the disagreement is written down and the
 * DOM wins — silently preferring vision is how a screenshot becomes a source of
 * truth, and silently discarding it loses the signal that something is wrong.
 *
 * @packageDocumentation
 */

import type { TypedVisualProposal } from './proposals.js';
import type { VisualEvidencePack } from './evidence-pack.js';
import { hostElements, spatialRelation } from './evidence-pack.js';

/** What the non-visual evidence made of a proposal. */
export type CorrelationStatus = 'SUPPORTED' | 'CONTRADICTED' | 'UNRESOLVED';

/** One checked hypothesis. */
export interface VisualCorrelation {
  proposalId: string;
  type: TypedVisualProposal['type'];
  status: CorrelationStatus;
  /** Semantic ids the proposal was matched to, after checking they exist. */
  correlatedSemanticIds: readonly string[];
  supportingEvidence: readonly string[];
  contradictionEvidence: readonly string[];
  /**
   * Reasons the evidence cannot settle the question either way.
   *
   * Distinct from contradiction on purpose. "The guide is covering it" is not
   * the model being wrong; it is this system having removed the thing the model
   * was asked about, and the two deserve different words.
   */
  unresolvedEvidence: readonly string[];
  /**
   * Whether anything downstream may use this.
   *
   * `SUPPORTED` is necessary and not sufficient: a supported grouping may inform
   * a contextual descriptor, and no correlation of any status may contribute to
   * a ProductClaim, a title, a synonym or a safe action.
   */
  eligibleForContextualPresentation: boolean;
}

/** What {@link correlateVisualProposals} checks against. */
export interface CorrelationInput {
  pack: VisualEvidencePack;
  proposals: readonly TypedVisualProposal[];
  /** Semantic ids the runtime reports mounted right now. */
  mountedSemanticIds: readonly string[];
  /** Concept nouns the ProductModel establishes on this route. */
  establishedConcepts?: readonly string[];
}

/**
 * Every proposal, checked.
 *
 * The order of the checks matters: a proposal referencing an element nobody can
 * find is contradicted before anything else is considered, because a hypothesis
 * about a thing that is not there cannot be about anything.
 */
export function correlateVisualProposals(input: CorrelationInput): VisualCorrelation[] {
  const mounted = new Set(input.mountedSemanticIds);
  const host = hostElements(input.pack);
  const byId = new Map(
    host.filter((element) => element.semanticId !== undefined).map((e) => [e.semanticId!, e]),
  );
  const concepts = new Set(input.establishedConcepts ?? []);

  return input.proposals.map((proposal) => {
    const supporting: string[] = [];
    const contradicting: string[] = [];
    const unresolvable: string[] = [];
    const referenced = proposal.targetSemanticIds;

    // 1. Does everything it names exist, on the host, right now?
    const missing = referenced.filter((id) => !mounted.has(id));
    const guideOwned = referenced.filter(
      (id) => input.pack.elements.find((e) => e.semanticId === id)?.guideOwned === true,
    );
    for (const id of missing) contradicting.push(`${id} is not mounted`);
    for (const id of guideOwned) {
      // The guide's own controls are not evidence about the application. A
      // proposal reading them back is reading this system's output as input.
      contradicting.push(`${id} belongs to the guide, not the application`);
    }

    // 2. Type-specific checks.
    if (proposal.type === 'VISIBLE_STATE') {
      for (const id of referenced) {
        const element = byId.get(id);
        if (element === undefined) continue;
        // The guide's own panel covers part of the application. An element
        // underneath it is visible to the DOM and absent from the picture, and
        // neither reading is wrong — so a claim about it is unresolvable rather
        // than contradicted. Calling it a contradiction would blame a model for
        // correctly describing a frame this system obscured.
        if (input.pack.occludedSemanticIds.includes(id)) {
          unresolvable.push(`${id} is underneath the guide panel in this frame`);
          continue;
        }
        if (!element.visible) contradicting.push(`${id} is not visible`);
        else supporting.push(`${id} is visible in the current snapshot`);
      }
    }

    if (
      proposal.type === 'VISUAL_GROUP' ||
      proposal.type === 'CONTROL_RELATION' ||
      proposal.type === 'FIELD_RELATION'
    ) {
      // Geometry decides adjacency. Bounding boxes already prove it, so the
      // proposal is checked against arithmetic rather than trusted about it.
      const boxes = referenced.map((id) => byId.get(id)).filter((e) => e !== undefined);
      if (boxes.length >= 2) {
        const relations = boxes
          .slice(1)
          .map((element) => spatialRelation(boxes[0]!.box, element!.box));
        const coherent = relations.every((relation) => relation !== 'overlapping');
        if (coherent)
          supporting.push(
            `geometry places the targets in a consistent arrangement (${relations.join(', ')})`,
          );
        else contradicting.push('the targets overlap, so no arrangement is established');
      }
    }

    if (proposal.type === 'SCREEN_PURPOSE' || proposal.type === 'COLLECTION_RELATION') {
      // A proposal about what a screen or a collection *is* is checked against
      // the concepts the ProductModel earned on this route. It is never allowed
      // to establish one: a screen that looks like a list of invoices where
      // nothing verified says "invoice" stays UNRESOLVED, and the runtime
      // instance path stays refused.
      const words = proposal.statement.toLowerCase();
      const matched = [...concepts].filter((noun) => words.includes(noun));
      if (matched.length > 0)
        supporting.push(`the ProductModel establishes "${matched.join('", "')}" on this route`);
      else
        contradicting.push(
          'no concept in this proposal is established on this route by non-visual evidence',
        );
    }

    if (proposal.type === 'VISUAL_LABEL_CANDIDATE') {
      // A name a model made up. It is diagnostic and nothing else, whatever the
      // other evidence says, so it never reaches SUPPORTED.
      return {
        proposalId: proposal.id,
        type: proposal.type,
        status: 'UNRESOLVED' as const,
        correlatedSemanticIds: referenced.filter((id) => mounted.has(id)),
        supportingEvidence: [],
        contradictionEvidence: ['a proposed name is not user-visible text and cannot become one'],
        unresolvedEvidence: [],
        eligibleForContextualPresentation: false,
      };
    }

    // Unresolvable outranks support. One element that cannot be checked is
    // enough to stop the whole proposal being called correlated, because a
    // partly-checked claim presented as a checked one is the failure mode this
    // layer exists to prevent.
    const status: CorrelationStatus =
      contradicting.length > 0
        ? 'CONTRADICTED'
        : unresolvable.length > 0
          ? 'UNRESOLVED'
          : supporting.length > 0
            ? 'SUPPORTED'
            : 'UNRESOLVED';

    return {
      proposalId: proposal.id,
      type: proposal.type,
      status,
      correlatedSemanticIds: referenced.filter((id) => mounted.has(id)),
      supportingEvidence: supporting,
      contradictionEvidence: contradicting,
      unresolvedEvidence: unresolvable,
      // Only a supported *arrangement* may colour presentation. Nothing about
      // purpose, identity or naming is eligible however well it correlates.
      eligibleForContextualPresentation:
        status === 'SUPPORTED' &&
        ['VISUAL_GROUP', 'CONTROL_RELATION', 'FIELD_RELATION', 'VISIBLE_STATE'].includes(
          proposal.type,
        ),
    };
  });
}
