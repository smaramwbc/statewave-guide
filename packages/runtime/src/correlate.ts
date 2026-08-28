/**
 * Which graph node a rendered control is.
 *
 * The bridge, and the place where a runtime subsystem most easily becomes a
 * second source of truth. It does not get to be one. A runtime element earns a
 * static identity through the semantic id the application already declares —
 * `data-guide`, or `data-ai-id` for compatibility — and through nothing else.
 *
 * **No CSS proximity, no selector heuristics, no text matching.** A button
 * beside a form is not part of that form because it looks like it is, and a
 * control whose accessible name matches a feature's title is not that feature.
 * Every one of those shortcuts has a failure this project has already paid for:
 * ADR 0010 exists because adjacency was read as ownership, ADR 0014 because a
 * shared suffix was read as identity, ADR 0018 because a name was read as a
 * fact.
 *
 * An element with no semantic id is recorded as `UNMAPPED_RUNTIME_ELEMENT` and
 * carries no evidence. That is a measurement — how much of the interface the
 * application has actually named — rather than a failure to work around.
 *
 * @packageDocumentation
 */

import type { ObservedElement } from './snapshot.js';

/** How a runtime element relates to static identity. */
export type CorrelationOutcome =
  | { status: 'correlated'; nodeId: string; semanticId: string }
  /** The element declares no semantic id, so it has no static identity here. */
  | { status: 'unmapped'; reason: 'UNMAPPED_RUNTIME_ELEMENT'; detail: string }
  /** It declares one the graph does not contain. */
  | { status: 'unknown-id'; semanticId: string; detail: string };

/** What {@link correlate} needs. */
export interface CorrelateInput {
  element: ObservedElement;
  /** Every `element:` node id the graph holds. */
  graphElementIds: ReadonlySet<string>;
}

/** The graph node a rendered element is, when the application named it. */
export function correlate(input: CorrelateInput): CorrelationOutcome {
  const semanticId = input.element.semanticId;
  if (semanticId === undefined) {
    return {
      status: 'unmapped',
      reason: 'UNMAPPED_RUNTIME_ELEMENT',
      detail: `A ${input.element.role} the application does not name. Nothing may be attributed to it: a selector or a position is not an identity.`,
    };
  }
  const nodeId = `element:${semanticId}`;
  if (!input.graphElementIds.has(nodeId)) {
    return {
      status: 'unknown-id',
      semanticId,
      detail: `${semanticId} is rendered and the graph has no such element. Either the source was not indexed or the id is computed at runtime.`,
    };
  }
  return { status: 'correlated', nodeId, semanticId };
}

/** Whether a feature may use a runtime observation as its own evidence. */
export interface OwnershipInput {
  nodeId: string;
  featureId: string;
  /** How the feature's `FeatureScope` classifies the node. */
  scopeClass: 'OWNED' | 'REACHABLE' | 'CONTEXTUAL' | 'OUTSIDE';
}

/**
 * Runtime evidence does not bypass `FeatureScope`.
 *
 * A control being visible on the same screen is exactly the thing ADR 0010
 * refuses, and a browser makes it *more* tempting rather than less: everything
 * on a page is genuinely there together. So the same gate applies — a feature
 * may reason from a runtime observation about a node its scope owns, and about
 * nothing else.
 */
export function mayUseAsEvidence(input: OwnershipInput): boolean {
  return input.scopeClass === 'OWNED';
}
