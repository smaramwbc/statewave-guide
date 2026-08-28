/**
 * What a language model is allowed to contribute.
 *
 * Two things, both of them judgements about *language*: which of six intents a
 * sentence expresses, and which of several already-resolved candidates a person
 * probably meant. Everything a provider returns is checked against what the
 * bundle already contains, and anything unrecognised is discarded and recorded.
 *
 * It may not create a claim, a capability, a route, a semantic id, an action, a
 * permission or a title. The interface makes that structural rather than
 * advisory: there is no method through which such a thing could arrive.
 *
 * @packageDocumentation
 */

import type { GuideQueryIntent } from './contract.js';

/** Optional language help. Never a source of truth. */
export interface GuideQueryProvider {
  /** Classify a question into the closed taxonomy. */
  classify?(query: string): GuideQueryIntent | undefined;
  /**
   * Choose among candidates this layer already resolved.
   *
   * Returns one of the ids it was given, or nothing. An id that was not offered
   * is discarded — a provider cannot introduce a feature by naming one.
   */
  chooseCandidate?(query: string, candidateFeatureIds: readonly string[]): string | undefined;
}
