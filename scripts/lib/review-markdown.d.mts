/**
 * Types for the review item renderer.
 *
 * The renderer is `.mjs` because everything under `scripts/` is — those files
 * run under plain Node with no build step. It is imported by a test that *is*
 * typechecked, so the shape is declared here rather than inferred as `any`.
 */

/** One entry of a review package's `items` array, as the renderer reads it. */
export interface ReviewItem {
  reviewId: string;
  featureId: string;
  userContext: { screen: string; goal: string };
  productOutput: {
    title: string | null;
    summary: string | null;
    purpose: string | null;
    steps: string[];
    conditions: string[];
    questions: string[];
  };
  knownSupportedFacts: string[];
  factsNote: string | null;
}

/** Markdown for a single blinded review item, as lines. */
export function renderReviewItem(item: ReviewItem): string[];
