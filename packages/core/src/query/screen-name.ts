/**
 * Whether a screen may be named, and what by.
 *
 * The last identifier-derived name in the system. Every entry step compiled by
 * the semantic layer reads *"Open <Screen>."* with the screen name taken from a
 * route identifier — `origin: 'route-title'` — and four of the seventeen say
 * **"Client Detail"**, which no surface of the application displays. Closed Loop
 * #8 established that identifiers identify and do not name; the entry step was
 * the one place that rule had not reached.
 *
 * It is enforced *here*, at the query boundary, rather than by rewriting the
 * compiler. The stored GuidanceIR is history — it is what several scored
 * benchmark rounds were produced from, and quietly changing it to make an old
 * artefact look better is the falsification `artifact-integrity` exists to
 * prevent. So the guidance keeps its route-derived label, and nothing that
 * reaches a user is allowed to use it.
 *
 * @packageDocumentation
 */

import type { GuideKnowledgeBundle, GuideScreen } from './bundle.js';
import { screenFor } from './bundle.js';

/** A name a user may be shown, with where it came from. */
export interface AuthorisedScreenName {
  route: string;
  name: string;
  origin: NonNullable<GuideScreen['nameOrigin']>;
}

/**
 * The name for a route, when a user-visible source supplies one.
 *
 * Returns nothing rather than a fallback. A step that cannot name its
 * destination is rendered against the route instead — *"Go to /clients/:id"* is
 * poor copy and true, where *"Open Client Detail"* is good copy about a screen
 * that does not exist under that name.
 */
export function authorisedScreenName(
  bundle: GuideKnowledgeBundle,
  route: string | undefined,
): AuthorisedScreenName | undefined {
  const screen = screenFor(bundle, route);
  if (screen?.name === undefined || screen.nameOrigin === undefined) return undefined;
  return { route: screen.route, name: screen.name, origin: screen.nameOrigin };
}

/**
 * Whether a name that appears in stored guidance may be spoken.
 *
 * Compares against the authorised set rather than trusting the label's own
 * `origin` field, because the label in the guidance says `route-title` and that
 * is exactly the claim under review. A name matches only if a user-visible
 * source produced the same words.
 */
export function isSpeakableScreenName(
  bundle: GuideKnowledgeBundle,
  route: string | undefined,
  name: string,
): boolean {
  const authorised = authorisedScreenName(bundle, route);
  if (authorised !== undefined) return authorised.name === name;
  // No route to check against: the name is speakable only if some screen in the
  // bundle is authorised under exactly those words.
  return bundle.screens.some((screen) => screen.name === name && screen.nameOrigin !== undefined);
}
