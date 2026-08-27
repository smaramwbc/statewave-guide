/**
 * What to call a feature, when the interface is allowed to decide.
 *
 * Round 6 measured what happens when it is not. Nine of twenty-one features
 * carried a title built by `normaliseIdentifier(feature.id)` — `Search`,
 * `Table`, `Danger zone`, `New key`, `Error`, `Partial clients` — and the corpus
 * split on that one variable:
 *
 *   title is a real visible label   n=12   mean usefulness 2.25   correctness 1.92
 *   title derived from the id       n= 9   mean usefulness 0.67   correctness 1.25
 *
 * Six of the seven items still scoring correctness 1 were the title, and the
 * reviewer wrote the reason five times in different words: *"the Search title is
 * more specific than the supplied facts"*, *"the title's meaning is not
 * independently supported"*.
 *
 * They were right, and the mistake was categorical rather than a matter of
 * degree. **A semantic id is an address.** `clients.search` identifies a control
 * for a runtime that has to find it again; it is not the product's word for
 * anything, and nobody chose it for a reader. Spacing it out and capitalising it
 * does not turn an address into a name — it disguises one as a name, which is
 * worse, because the result is indistinguishable from text somebody wrote.
 *
 * So identifiers are identity and never language. A title comes from evidence
 * that a user could see the words, or there is no title.
 *
 * **A title is not a purpose.** A button reading `Upgrade` proves the control is
 * called Upgrade. It proves nothing about plan tiers, roles, or what pressing it
 * changes — the whole of Closed Loop #7 stays exactly where it was, and this
 * module may not become a side door into it.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode } from '@statewavedev/guide-indexer';
import type { ProductFeature } from '@statewavedev/guide-shared';
import { compareStrings } from '../compare.js';
import type { FeatureScope } from '../scope.js';
import type { HumanLabel } from './labels.js';
import { labelForNode } from './labels.js';

/** Where a title may come from, strongest first. */
export type TitleOrigin =
  /** Text a user reads on the control itself. */
  | 'ui-label'
  /** An accessibility name: `aria-label`, or `aria-labelledby` resolved. */
  | 'accessible-name';

/** A name the interface supplies, and the thing that supplies it. */
export interface TitleCandidate {
  text: string;
  origin: TitleOrigin;
  /** The node whose visible text this is. */
  evidence: string;
  /** How the feature classifies that node. Always `OWNED`. */
  ownership: 'OWNED';
}

/** What a title decision produced, including the decision to produce none. */
export type TitleOutcome =
  | { status: 'resolved'; candidate: TitleCandidate }
  /** Several owned controls carry text and nothing says which names the feature. */
  | { status: 'ambiguous'; candidates: readonly string[]; detail: string }
  /** Nothing the feature owns carries text a user can read. */
  | { status: 'withheld'; detail: string };

/** What {@link resolveTitle} needs. */
export interface ResolveTitleInput {
  feature: ProductFeature;
  scope: FeatureScope;
  graph: ApplicationGraph;
}

/**
 * Origins that mean a user could read the words.
 *
 * `route-title` and `component-name` are absent deliberately. Both are
 * `screenNameFrom(<a code identifier>)` — `ClientDetailPage` with its suffix
 * stripped and its camel case split — which is the same derivation this module
 * exists to refuse, wearing a name that suggests somebody wrote a title. Nothing
 * in the fixture's interface says *Client Detail*: the page's only heading is
 * `{client.name}`, a runtime value.
 */
const VISIBLE_ORIGINS = new Set<string>(['ui-label', 'accessible-name']);

/** True when a label is text a user can actually find on screen. */
export function isUserVisible(label: HumanLabel | undefined): boolean {
  return label !== undefined && VISIBLE_ORIGINS.has(label.origin);
}

/**
 * The feature's name, taken from the interface or not taken at all.
 *
 * Searched over the controls the feature **owns**, in the order discovery
 * recorded them, so a feature is named by its own control rather than by
 * something nearby. Where several owned controls carry visible text and none is
 * an entry point, the choice is refused: `clients.create` owns *New client*,
 * *Cancel* and *Create client*, and picking by sort order is how this project
 * has gone wrong before.
 */
export function resolveTitle(input: ResolveTitleInput): TitleOutcome {
  const nodeById = new Map(input.graph.nodes.map((node) => [node.id, node]));

  const named = (id: string): TitleCandidate | undefined => {
    if (input.scope.classify(id) !== 'OWNED') return undefined;
    const label = labelForNode(nodeById.get(id));
    if (!isUserVisible(label) || label === undefined) return undefined;
    return {
      text: label.text,
      origin: label.origin as TitleOrigin,
      evidence: id,
      ownership: 'OWNED',
    };
  };

  // An entry point first: it is the control discovery recorded as *being* the
  // feature, so where it carries text that text is the feature's name.
  for (const entry of input.feature.entryPoints ?? []) {
    const candidate = named(entry);
    if (candidate !== undefined) return { status: 'resolved', candidate };
  }

  const others: TitleCandidate[] = [];
  for (const elementId of [...(input.feature.elements ?? [])].sort(compareStrings)) {
    const candidate = named(`element:${elementId}`);
    if (candidate !== undefined) others.push(candidate);
  }

  if (others.length === 1) return { status: 'resolved', candidate: others[0]! };
  if (others.length > 1) {
    return {
      status: 'ambiguous',
      candidates: others.map((entry) => entry.evidence),
      detail: `${others.length} controls this feature owns carry visible text (${others
        .map((entry) => `"${entry.text}"`)
        .join(', ')}), and nothing establishes which one names the feature.`,
    };
  }

  return {
    status: 'withheld',
    detail:
      'Nothing this feature owns carries text a user can read, so it has no name the interface supplies. A title built from the identifier would be an address wearing the costume of a name.',
  };
}

/** The graph node a title candidate was read from. For provenance. */
export function titleEvidenceNode(
  candidate: TitleCandidate,
  graph: ApplicationGraph,
): ApplicationNode | undefined {
  return graph.nodes.find((node) => node.id === candidate.evidence);
}
