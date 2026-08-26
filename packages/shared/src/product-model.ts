/**
 * Shared data contracts for describing an application's parts.
 *
 * Plain data, no runtime behaviour. {@link ProvenanceReference} is the backbone:
 * every fact the indexer emits carries one, which is what keeps the whole model
 * auditable.
 *
 * The *semantic* Product Model — features, workflows, claims — lives in
 * `./semantic.ts`. It supersedes the sketch that used to live here: there is one
 * Product Model, and it is the one the enrichment pipeline produces and the
 * runtime consumes.
 *
 * @packageDocumentation
 */

import type { ProductFeature } from './semantic.js';

/**
 * Where a piece of extracted knowledge came from.
 *
 * Every node the indexer emits carries provenance. This is what keeps the
 * Product Model auditable: a claim about the application can always be traced
 * back to the file and line that justified it, and a claim without provenance
 * is by definition not a deterministic fact.
 */
export interface ProvenanceReference {
  /** The kind of artefact the fact was derived from. */
  source: 'source-code' | 'test' | 'openapi' | 'docs' | 'git';
  /** Project-relative POSIX path, e.g. `src/pages/Clients.tsx`. */
  file?: string;
  /** Named symbol within the file, e.g. a component or function name. */
  symbol?: string;
  /** 1-based line number. */
  line?: number;
  /** 1-based column number. */
  column?: number;
  /** Git commit the fact was observed at, when known. */
  commit?: string;
}

/**
 * The semantic kind of a UI element.
 *
 * Kept deliberately coarse. The value describes what the element *is to a
 * user*, not which HTML tag renders it — a `button` may be an `<a>`, and a
 * `dialog` may be a portal-rendered `<div>`.
 */
export type ProductElementType =
  'button' | 'link' | 'tab' | 'input' | 'form' | 'menu' | 'dialog' | 'table' | 'section' | 'other';

/**
 * A single addressable UI element belonging to a feature.
 *
 * The `id` is the semantic identifier that appears as `data-guide` in source
 * code and as a registered element at runtime. It is the join key across the
 * whole system.
 */
export interface ProductElement {
  /** Semantic identifier, e.g. `clients.create`. */
  id: string;
  /** What kind of thing this is to a user. */
  type: ProductElementType;
  /** Short human-readable label, usually the visible text. */
  label?: string;
  /** Longer explanation of what the element does. */
  description?: string;
  /** The feature this element belongs to, when known. */
  featureId?: string;
  /** Where this element was observed. */
  provenance?: ProvenanceReference[];
  /** Adapter-specific extras. Never interpreted by the runtime. */
  metadata?: Record<string, unknown>;
}

/**
 * A single hit from a {@link ProductFeature} search.
 *
 * Providers rank results themselves; the runtime does not re-sort them.
 */
export interface ProductKnowledgeResult {
  /** Identifier of the matched feature. Mirrors `feature.id`. */
  id: string;
  /** The matched feature. */
  feature: ProductFeature;
  /** Provider-defined relevance in `[0, 1]`, higher is better. */
  score: number;
  /**
   * Semantic element ids within the feature that matched the query.
   *
   * Ids rather than element objects: an element's type and label are technical
   * facts owned by the ApplicationGraph, and duplicating them into the semantic
   * layer would create two places for them to disagree.
   */
  matchedElements?: string[];
  /** Short text supporting the match, for display or model grounding. */
  excerpt?: string;
}
