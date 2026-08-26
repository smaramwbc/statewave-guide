/**
 * The behaviour spine: which relationships describe what a feature *does*.
 *
 * A neighbourhood almost always exceeds what may be sent to a model, so
 * something has to be cut. The spine decides what survives. It is the chain a
 * user would recognise — press this, a handler runs, a dialog opens, a form
 * submits, a service calls an endpoint, a controller answers — and preferring
 * it means a truncated pack keeps the UI→handler→form→service→API path rather
 * than a random slice of type declarations.
 *
 * The order matters as much as the membership. `contains` comes first because
 * without it an element has no home; `invokes` next because "what does pressing
 * this do?" is the question a feature exists to answer.
 *
 * @packageDocumentation
 */

import type { RelationshipType } from '@statewavedev/guide-indexer';

/**
 * Relationship types that carry behaviour, in the order a pack prefers them.
 *
 * Types absent from this list are still packed when there is room; they simply
 * lose every tie-break against a spine edge.
 */
export const BEHAVIOUR_SPINE: readonly RelationshipType[] = [
  'contains',
  'invokes',
  'opens',
  'renders',
  'submits_to',
  'calls',
  'calls_api',
  'requires_permission',
  'navigates_to',
];

/**
 * Sort rank of a relationship type: lower is packed first.
 *
 * Everything off the spine shares one rank, so ordering within that group falls
 * through to the relationship id and stays stable.
 */
export function spineRank(type: RelationshipType): number {
  const index = BEHAVIOUR_SPINE.indexOf(type);
  return index === -1 ? BEHAVIOUR_SPINE.length : index;
}
