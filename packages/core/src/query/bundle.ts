/**
 * Compiled product knowledge, as the query layer receives it.
 *
 * The analysis packages produce this; core consumes it. That direction matters:
 * if core imported the semantic package for real, every application shipping a
 * guide would pull an indexer, a graph and a verifier into its bundle, and the
 * boundary Closed Loop #12 exists to draw would be a comment rather than a
 * fact. The only thing crossing here is data, plus a handful of `import type`s
 * that vanish at compile time.
 *
 * GuidanceIR travels **unchanged**. There is no `QueryGuidanceIR`, no
 * `ChatGuidance`, no second representation of what a user may be told — the
 * query layer selects and contextualises the guidance that already exists, and a
 * layer that could rewrite it would be a second place where product truth is
 * decided.
 *
 * @packageDocumentation
 */

import type { GuidanceDocument } from '@statewavedev/guide-semantic';

/**
 * Where a screen's name is allowed to come from.
 *
 * Not `route-title`. Every one of the seventeen entry steps in the benchmark
 * says "Open <Screen>" with a name derived from a route identifier, and four of
 * them say **"Client Detail"** — words no surface of the application has ever
 * displayed. Closed Loop #8 removed identifier-derived names from titles; this
 * is the same rule applied to the one place it had not reached.
 */
export type ScreenNameOrigin =
  /** A heading the running application displayed for this screen. */
  | 'runtime-heading'
  /** Text a control displays, read statically. */
  | 'ui-label'
  /** An accessible name — `aria-label`, `title`, `alt`. */
  | 'accessible-name'
  /** A navigation control that unambiguously names its destination. */
  | 'navigation-label';

/** A screen, and what a user may be told it is called. */
export interface GuideScreen {
  route: string;
  /**
   * The name, when something a user can see supplies one.
   *
   * Absent is a normal outcome, not a gap to fill. `/clients/:clientId` has no
   * name here because nothing in the application writes one, and
   * `/invoices` has none because two different visible labels — "Invoices" and
   * "All invoices" — navigate to it and neither is more authoritative than the
   * other. Guessing between them would be arbitrary, and arbitrary is how
   * "Client Detail" got in.
   */
  name?: string;
  nameOrigin?: ScreenNameOrigin;
}

/** A control a UI can be pointed at. */
export interface GuideControl {
  semanticId: string;
  /** What the interface calls it, when the interface calls it anything. */
  label?: string;
  /**
   * Whether the name may be spoken in prose.
   *
   * The distinction Closed Loop #12 turns on: `clients.search` is a real,
   * addressable, highlightable input that the interface never names. An action
   * can point at it; a sentence cannot name it. Those are different permissions
   * and this is where they separate.
   */
  nameable: boolean;
}

/**
 * One instruction, already phrased.
 *
 * Phrased by the semantic layer at build time, because a second implementation
 * of "turn a proposition into a sentence" was incomplete and dropped every
 * terminal step in the benchmark without saying so.
 */
export interface GuideBundledStep {
  index: number;
  kind: string;
  role: string;
  origin: string;
  text: string;
  /** A control this feature owns that the step acts on. */
  semanticId?: string;
  /** For an entry step: the route it names, and the name the compiler gave it. */
  screenRoute?: string;
  screenName?: string;
}

/** Everything known about one feature, ready to answer with. */
export interface GuideFeatureEntry {
  featureId: string;
  /** The realised steps, in order. */
  steps: readonly GuideBundledStep[];
  /**
   * Object nouns this feature's supported language uses, each evidence-backed.
   *
   * The vocabulary a runtime instance may be offered against. A word absent from
   * every feature's list is a word this product has not earned.
   */
  conceptNouns: readonly string[];
  /** The compiled guidance, exactly as the semantic layer produced it. */
  guidance: GuidanceDocument;
  /**
   * The route the stored entry step was compiled against.
   *
   * Carried rather than re-derived: the screen-name check has to ask about the
   * same route the step names, and deriving it twice is how two answers to one
   * question get into a system.
   */
  entryRoute?: string;
  /** Routes this feature is reachable on, verified. */
  routes: readonly string[];
  /** Controls this feature owns. */
  controls: readonly GuideControl[];
  /** Permissions a verified condition requires. */
  requiredPermissions: readonly string[];
}

/** The compiled knowledge a guide runs on. */
export interface GuideKnowledgeBundle {
  version: 1;
  /**
   * The application build this was compiled from.
   *
   * Freshness is decided against this and against the route, never against a
   * clock: a snapshot is not stale because it is old, it is stale because it
   * describes something else.
   */
  applicationVersion: string;
  features: readonly GuideFeatureEntry[];
  screens: readonly GuideScreen[];
}

/** The feature entry for an id. */
export function featureEntry(
  bundle: GuideKnowledgeBundle,
  featureId: string,
): GuideFeatureEntry | undefined {
  return bundle.features.find((entry) => entry.featureId === featureId);
}

/** The screen for a route. */
export function screenFor(
  bundle: GuideKnowledgeBundle,
  route: string | undefined,
): GuideScreen | undefined {
  if (route === undefined) return undefined;
  return bundle.screens.find((screen) => screen.route === route);
}

/** Every control in the bundle, by semantic id. */
export function controlIndex(bundle: GuideKnowledgeBundle): Map<string, GuideControl> {
  const index = new Map<string, GuideControl>();
  for (const feature of bundle.features) {
    for (const control of feature.controls) {
      if (!index.has(control.semanticId)) index.set(control.semanticId, control);
    }
  }
  return index;
}

/** Which feature owns a control. */
export function featureOwning(
  bundle: GuideKnowledgeBundle,
  semanticId: string,
): GuideFeatureEntry | undefined {
  return bundle.features.find((feature) =>
    feature.controls.some((control) => control.semanticId === semanticId),
  );
}

/**
 * Whether a concrete route is an instance of a verified route pattern.
 *
 * An application reports `/clients/c1`; the bundle knows `/clients/:clientId`.
 * Matching them is a structural comparison of segments, not a regular
 * expression built from user input — a parameter matches exactly one segment
 * and nothing else, so no pattern can be made to match more than it names.
 */
export function routeMatches(pattern: string, actual: string): boolean {
  if (pattern === actual) return true;
  const left = pattern.split('/');
  const right = actual.split('/');
  if (left.length !== right.length) return false;
  return left.every((segment, index) => segment.startsWith(':') || segment === right[index]);
}

/** The screen whose pattern the current route is an instance of. */
export function screenMatching(
  bundle: GuideKnowledgeBundle,
  route: string | undefined,
): GuideScreen | undefined {
  if (route === undefined) return undefined;
  return bundle.screens.find((screen) => routeMatches(screen.route, route));
}
