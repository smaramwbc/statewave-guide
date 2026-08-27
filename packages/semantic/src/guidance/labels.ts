/**
 * What to call a thing when speaking to a user.
 *
 * The Day 2 review found the pipeline saying `update a client detail rename`,
 * `create a new invoices create form`, and `open nav clients`. None of those is
 * a hallucination — every one is a semantic identifier with its punctuation
 * replaced by spaces. The defect is not the words, it is the assumption
 * underneath them: that an identifier is a phrase with the dots taken out.
 *
 * It is not. `clients.create` is an address. It identifies a control uniquely,
 * survives refactoring, and joins a claim to a graph node — and it was never
 * grammar. The application already knows what to call that control, because a
 * user is looking at the word right now: **New client**.
 *
 * So a label is *found*, in a fixed order of preference, and where nothing can
 * be found the answer is a cautious noun rather than an invented verb. This
 * module never manufactures a verb from an identifier. `nav.clients` becomes
 * `Clients`, not `Open nav clients` — the first is a thing that exists and the
 * second is a sentence nobody wrote.
 *
 * @packageDocumentation
 */

import type { ApplicationGraph, ApplicationNode } from '@statewavedev/guide-indexer';

/**
 * Where a label came from, in descending trustworthiness.
 *
 * Recorded rather than discarded because the origin decides how a label may be
 * used. A `ui-label` is a word the user can see on screen and may be quoted
 * back to them in quotation marks; a `normalised-identifier` is our best guess
 * at a noun and must never appear inside quotation marks, because quoting it
 * would tell the user to look for text that is not there.
 */
export type LabelOrigin =
  /** Text the user can read on the control right now. */
  | 'ui-label'
  /** An accessible name — `aria-label`, `title`, `alt`. */
  | 'accessible-name'
  /** The name of the screen a route renders. */
  | 'route-title'
  /** A component's declared name. */
  | 'component-name'
  /** The last resort: a conservative noun derived from an identifier. */
  | 'normalised-identifier';

/** A name for something, and where the name came from. */
export interface HumanLabel {
  text: string;
  origin: LabelOrigin;
  /** The graph node this names, for provenance. */
  nodeId?: string;
}

/** True when the label is text a user can actually see and be pointed at. */
export function isVisibleToUser(label: HumanLabel): boolean {
  return label.origin === 'ui-label' || label.origin === 'accessible-name';
}

/**
 * Turns an identifier into the most cautious noun it can support.
 *
 * Three rules, and all three exist to avoid inventing meaning:
 *
 * - **Take the last segment.** `nav.clients` is the clients link; the useful
 *   noun is `Clients`. Keeping the namespace produces `Nav clients`, which
 *   names nothing a user has heard of.
 * - **Do not verb it.** `clients.create` yields `Create`, never `Create a
 *   client` — the object is not in the identifier, and guessing it is how
 *   `create a new invoices create form` happened.
 * - **Drop a trailing structural word.** `invoices.create-form` is about
 *   invoices, not about a form; `form`, `dialog`, `button` and `page` are how
 *   the interface is built rather than what it is for.
 */
export function normaliseIdentifier(identifier: string): string {
  const last = identifier.split('.').pop() ?? identifier;
  const words = last
    .split('-')
    .filter((word) => word.length > 0)
    .filter((word, index, all) => !(index === all.length - 1 && STRUCTURAL_WORDS.has(word)));
  const usable = words.length > 0 ? words : [last];
  const joined = usable.join(' ');
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Words that describe the mechanism rather than the thing. */
const STRUCTURAL_WORDS = new Set(['form', 'dialog', 'modal', 'button', 'page', 'panel', 'section']);

/** Finds the best available name for one graph node. */
export function labelForNode(node: ApplicationNode | undefined): HumanLabel | undefined {
  if (node === undefined) return undefined;

  const record = node as unknown as Record<string, unknown>;
  const visible = typeof record['label'] === 'string' ? record['label'].trim() : '';
  if (visible.length > 0) return { text: visible, origin: 'ui-label', nodeId: node.id };

  const accessible = typeof record['accessibleName'] === 'string' ? record['accessibleName'] : '';
  if (accessible.trim().length > 0) {
    return { text: accessible.trim(), origin: 'accessible-name', nodeId: node.id };
  }

  if (node.kind === 'route') {
    const component = typeof record['componentName'] === 'string' ? record['componentName'] : '';
    if (component.length > 0) {
      return { text: screenNameFrom(component), origin: 'route-title', nodeId: node.id };
    }
    const routePath = typeof record['path'] === 'string' ? record['path'] : '';
    if (routePath.length > 1) {
      return {
        text: normaliseIdentifier(routePath.replace(/^\//, '')),
        origin: 'route-title',
        nodeId: node.id,
      };
    }
  }

  if (node.kind === 'component') {
    const name = typeof record['name'] === 'string' ? record['name'] : '';
    if (name.length > 0) {
      return { text: screenNameFrom(name), origin: 'component-name', nodeId: node.id };
    }
  }

  const elementId = typeof record['elementId'] === 'string' ? record['elementId'] : '';
  if (elementId.length > 0) {
    return {
      text: normaliseIdentifier(elementId),
      origin: 'normalised-identifier',
      nodeId: node.id,
    };
  }

  return undefined;
}

/** `ClientsPage` reads as `Clients` to someone looking at the screen. */
function screenNameFrom(componentName: string): string {
  const trimmed = componentName.replace(/(Page|Screen|View|Dialog)$/, '');
  const spaced = trimmed.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.length > 0 ? spaced : componentName;
}

/** Index of a graph, for label lookup. */
export interface LabelIndex {
  /** The best name for a node id, or `undefined` when nothing is known. */
  label(nodeId: string): HumanLabel | undefined;
  node(nodeId: string): ApplicationNode | undefined;
}

export function createLabelIndex(graph: ApplicationGraph): LabelIndex {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const cache = new Map<string, HumanLabel | undefined>();
  return {
    node: (nodeId) => nodes.get(nodeId),
    label(nodeId) {
      if (cache.has(nodeId)) return cache.get(nodeId);
      const found = labelForNode(nodes.get(nodeId));
      cache.set(nodeId, found);
      return found;
    },
  };
}

/**
 * The subject a feature is *about*, as a noun a user would recognise.
 *
 * Derived from the feature's own namespace rather than from a control, because
 * the control is usually named for the action and the object is what a sentence
 * needs. `clients.create` is about a **client**; its button says *New client*.
 * A plural namespace is singularised only for the trivial cases, since guessing
 * English morphology is exactly the kind of invention this module avoids.
 */
export function entityNoun(featureId: string): string | undefined {
  const head = featureId.split('.')[0];
  if (head === undefined || head.length === 0) return undefined;
  if (NON_ENTITY_NAMESPACES.has(head)) return undefined;

  // A compound namespace names a *place*, and the entity is the thing it is a
  // place for: `client-detail` is the detail screen of a client, so a sentence
  // about it is about the client. Taking the last word instead produced "you
  // can change a client detail", which is not a thing anyone has.
  const first = head.split('-')[0] ?? head;
  return singularise(first);
}

/**
 * Namespaces that are scaffolding rather than subject matter.
 *
 * `nav.clients` is a link, and `nav` is not a noun a user has. Treating it as
 * one produced "You can open a nav." — grammatical, derived entirely from real
 * data, and meaningless.
 */
const NON_ENTITY_NAMESPACES = new Set(['nav', 'app', 'layout', 'shell', 'page', 'menu', 'sidebar']);

/** Only the regular cases. Guessing English morphology is its own kind of invention. */
function singularise(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.endsWith('sses') || word.endsWith('shes')) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** The field's own name, for listing what a user has to fill in. */
export function fieldNoun(nodeId: string): string {
  const last = nodeId.split('.').pop() ?? nodeId;
  return last.split('-').join(' ');
}
