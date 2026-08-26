/**
 * Relationships: how the application's parts connect.
 *
 * A relationship is a typed, directed edge carrying at least one {@link Evidence}
 * record. There is no constructor that lets you make one without evidence — that
 * is enforced by {@link createRelationship}, which throws on an empty list.
 *
 * @packageDocumentation
 */

import type { Confidence, Evidence } from './evidence.js';

/**
 * The relationship vocabulary.
 *
 * Each member answers a specific question a user might ask about a product, and
 * each has exactly one extraction path. When two rules would produce the same
 * edge, they produce the same edge — evidence is merged, not duplicated.
 */
export type RelationshipType =
  /** A component renders another component. `ClientsPage renders NewClientDialog`. */
  | 'renders'
  /** A container holds a UI element. `ClientsPage contains element:clients.create`. */
  | 'contains'
  /** A UI element's handler prop references a function. `clients.create invokes openCreateClient`. */
  | 'invokes'
  /** A function causes a dialog or modal component to become visible. */
  | 'opens'
  /** An element or function navigates to a route. */
  | 'navigates_to'
  /** A function calls another function. */
  | 'calls'
  /** A form submits through a handler function. */
  | 'submits_to'
  /** A component or function uses a React hook. */
  | 'uses_hook'
  /** A function uses a service object. */
  | 'uses_service'
  /** A function performs an HTTP request against an API endpoint. */
  | 'calls_api'
  /** An element, route or function is gated by a permission. */
  | 'requires_permission'
  /** A form or endpoint validates its input with a schema. */
  | 'validates_with';

/** Every relationship type, for iteration and reporting. */
export const RELATIONSHIP_TYPES: readonly RelationshipType[] = [
  'renders',
  'contains',
  'invokes',
  'opens',
  'navigates_to',
  'calls',
  'submits_to',
  'uses_hook',
  'uses_service',
  'calls_api',
  'requires_permission',
  'validates_with',
];

/**
 * A directed, evidence-bearing edge.
 *
 * `id` is derived from the triple so the same relationship discovered twice
 * merges rather than duplicating.
 */
export interface Relationship {
  /** `${source}|${type}|${target}` */
  id: string;
  type: RelationshipType;
  /** Canonical id of the source node. */
  source: string;
  /** Canonical id of the target node. */
  target: string;
  /** A value from the fixed {@link CONFIDENCE} scale. Never arbitrary. */
  confidence: Confidence;
  /** Why we believe this. Never empty. */
  evidence: Evidence[];
}

/** Builds the canonical id for a relationship triple. */
export function relationshipId(source: string, type: RelationshipType, target: string): string {
  return `${source}|${type}|${target}`;
}

/**
 * Creates a relationship.
 *
 * @throws when `evidence` is empty. That is the "no evidence, no relationship"
 * rule made unbypassable rather than merely documented.
 */
export function createRelationship(
  type: RelationshipType,
  source: string,
  target: string,
  confidence: Confidence,
  evidence: Evidence[],
): Relationship {
  if (evidence.length === 0) {
    throw new Error(
      `Refusing to create ${type} ${source} -> ${target} with no evidence. ` +
        `Every relationship must name the file and line that justified it.`,
    );
  }
  return { id: relationshipId(source, type, target), type, source, target, confidence, evidence };
}
