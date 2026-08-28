/**
 * Which feature a question is about.
 *
 * The signals allowed here are all things the application or the user actually
 * supplied: what is focused, what is selected, what is on screen, what route
 * they are on, and names the interface displays. What is *not* allowed is the
 * tempting half of the list — component names, function names, normalised
 * identifiers, fuzzy symbol matches — because every one of them reads as a
 * confident answer and none of them is evidence about the product.
 *
 * `clients.search` is the case that keeps this honest. A question about
 * filtering clients resolves to it through a verified capability. A question
 * mentioning the word *search* must not, because nothing the user can see says
 * "search" — the word exists only in the identifier.
 *
 * @packageDocumentation
 */

import type { GuideKnowledgeBundle, GuideFeatureEntry } from './bundle.js';
import { featureOwning, routeMatches } from './bundle.js';
import type { GuideQueryAmbiguity, GuideQueryContext } from './contract.js';

/** What resolution decided, and how. */
export interface Resolution {
  feature?: GuideFeatureEntry;
  semanticId?: string;
  path: string;
  ambiguity?: GuideQueryAmbiguity;
}

/** Words that carry no signal and would otherwise match everything. */
const STOP = new Set([
  'the',
  'a',
  'an',
  'i',
  'do',
  'how',
  'what',
  'where',
  'why',
  'can',
  'cannot',
  'see',
  'is',
  'are',
  'to',
  'me',
  'show',
  'my',
  'this',
  'that',
  'it',
  'in',
  'on',
  'of',
  'for',
  'and',
  'or',
  'with',
  'does',
  'get',
  'find',
  'use',
  'there',
  'here',
  'then',
  'now',
  'you',
  'your',
  'please',
  'help',
]);

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/["'?.,!]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP.has(word));

/**
 * Every user-visible name a feature offers, and nothing else.
 *
 * The feature id is deliberately absent. `clients.search` would otherwise match
 * a question containing "search" — a word that exists nowhere a user can read
 * it — and the system would answer confidently using vocabulary it invented.
 */
function speakableTerms(feature: GuideFeatureEntry): string[] {
  const terms: string[] = [];
  const guidance = feature.guidance;
  if (guidance.title?.text !== undefined) terms.push(guidance.title.text);
  for (const control of feature.controls) {
    if (control.nameable && control.label !== undefined) terms.push(control.label);
  }
  // Compiled sentences are supported language: they are made of propositions
  // that each carry evidence, so matching against them is matching against
  // things the system has already earned the right to say.
  if (guidance.purpose?.text !== undefined) terms.push(guidance.purpose.text);
  if (guidance.summary?.text !== undefined) terms.push(guidance.summary.text);
  for (const question of guidance.questions) terms.push(question.text);
  return terms;
}

/** How well a feature's supported vocabulary covers the question. */
function score(feature: GuideFeatureEntry, queryWords: readonly string[]): number {
  if (queryWords.length === 0) return 0;
  const haystack = words(speakableTerms(feature).join(' '));
  if (haystack.length === 0) return 0;
  const bag = new Set(haystack);
  let hits = 0;
  for (const word of queryWords) if (bag.has(word)) hits += 1;
  return hits / queryWords.length;
}

/**
 * The feature a question is about.
 *
 * Context first, and in a fixed order: what the user has focused beats what is
 * selected, which beats what is merely on screen. A person asking "what does
 * this do?" means the thing they are pointing at, and the wording of the
 * question contains no information about which thing that is.
 */
export function resolveFeature(
  bundle: GuideKnowledgeBundle,
  query: string,
  context: GuideQueryContext = {},
  options: { preferContext?: boolean } = {},
): Resolution {
  const preferContext = options.preferContext ?? false;

  for (const [signal, semanticId] of [
    ['focus', context.focusedSemanticId],
    ['selection', context.selectedSemanticId],
  ] as const) {
    if (semanticId === undefined) continue;
    const feature = featureOwning(bundle, semanticId);
    if (feature === undefined) {
      return {
        path: `${signal}:unmapped`,
        ambiguity: {
          reason: 'NO_TARGET',
          candidates: [],
          message: 'That element is not part of anything this guide knows about.',
        },
      };
    }
    return { feature, semanticId, path: `${signal}:${semanticId}` };
  }

  const queryWords = words(query);
  const scored = bundle.features
    .map((feature) => ({ feature, value: score(feature, queryWords) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);

  if (preferContext && scored.length === 0) {
    // "What does this do?" with nothing focused. The honest answer is a
    // question back, not the most plausible feature on the screen.
    const visible = (context.visibleSemanticIds ?? [])
      .map((id) => ({ id, feature: featureOwning(bundle, id) }))
      .filter((entry) => entry.feature !== undefined);
    if (visible.length === 1) {
      const only = visible[0]!;
      return { feature: only.feature, semanticId: only.id, path: `visible:${only.id}` };
    }
    // Nothing focused, nothing selected, nothing on screen that this knows
    // about, and no supported vocabulary matched. There is no question here to
    // be ambiguous about — the honest status is that it is not supported.
    if (visible.length === 0) return { path: 'context:none' };
    return {
      path: 'context:none',
      ambiguity: {
        reason: 'NO_TARGET',
        candidates: visible.slice(0, 5).map((entry) => ({
          featureId: entry.feature!.featureId,
          ...(entry.feature!.guidance.title?.text === undefined
            ? {}
            : { title: entry.feature!.guidance.title.text }),
          semanticId: entry.id,
        })),
        message: 'More than one thing here could be meant. Choose which one.',
      },
    };
  }

  if (scored.length === 0) return { path: 'no-match' };

  const best = scored[0]!;
  // A question must be more than half recognised before it resolves to
  // anything. *"How do I open an invoice?"* shares exactly one content word with
  // the feature that raises invoices, and answering it with "Lets you create a
  // new invoice." would be a confident answer to a different question. The
  // control that opens one carries no supported name at all — which is a true
  // thing to say nothing about, and the threshold is what makes saying nothing
  // the outcome.
  if (best.value < 0.6) {
    return { path: `below-threshold:${best.value.toFixed(2)}` };
  }

  let tied = scored.filter((entry) => entry.value === best.value);

  // Where the user already is breaks a tie, and only a tie. Two controls read
  // "Delete" — one in the client table, one on the client's own screen — and a
  // person on `/clients/:clientId` asking about Delete means the one in front of
  // them. This is context disambiguating between candidates the question
  // already narrowed, never context choosing a feature on its own.
  if (tied.length > 1 && context.route !== undefined) {
    const here = tied.filter((entry) =>
      entry.feature.routes.some((route) => routeMatches(route, context.route!)),
    );
    if (here.length === 1)
      return { feature: here[0]!.feature, path: `lexical+route:${context.route}` };
    if (here.length > 1) tied = here;
  }

  if (tied.length > 1) {
    return {
      path: 'ambiguous',
      ambiguity: {
        reason: 'MULTIPLE_FEATURES',
        candidates: tied.slice(0, 5).map((entry) => ({
          featureId: entry.feature.featureId,
          ...(entry.feature.guidance.title?.text === undefined
            ? {}
            : { title: entry.feature.guidance.title.text }),
        })),
        message: 'More than one part of the application matches that. Choose which one you mean.',
      },
    };
  }
  return { feature: best.feature, path: `lexical:${best.value.toFixed(2)}` };
}
