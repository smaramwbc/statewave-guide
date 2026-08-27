/**
 * Which control is inside which, as the interface nests them.
 *
 * Until now the graph recorded containment only from a component to an element,
 * so all 62 `contains` edges started at a component and every control on a page
 * was a recorded sibling of every other. `settings.form` and the two inputs it
 * wraps were three peers under `SettingsPage`, which is why Closed Loop #7 had
 * to withhold *"The settings form collects organisation name and notification
 * preferences"* — the graph could not say the fields were in the form, because
 * as far as it knew they were not.
 *
 * The rule here is the smallest one that fixes that: **a control is contained by
 * the nearest guide-bearing element that lexically encloses it in JSX children**.
 * Four refusals keep lexical nesting from being read as render nesting, and each
 * has a shape in the fixture behind it.
 *
 * **A JSX attribute stops the walk.** `<Route element={<p data-guide="app.not-found"/>}/>`
 * puts that paragraph lexically inside `app.shell`, and it renders wherever the
 * router decides. A child passed as a prop is not a child.
 *
 * **A PascalCase ancestor stops the walk.** `PermissionGate` returns `children`
 * *or* `fallback`; a portal renders elsewhere entirely. What a component does
 * with what it is given is that component's business, and containment through
 * one would be an assumption rather than a reading.
 *
 * **A duplicate id emits nothing.** `settings.save` is written twice with
 * different parents. One node with two parents is worse than one node with none:
 * a consumer asking what contains it would get both answers and no way to
 * choose. This deliberately forfeits a real edge.
 *
 * **A file boundary stops the walk**, which follows from the first two but is
 * worth naming: fields rendered by an interposed component live in another file
 * and are simply missed. That is a recall cost, and recall costs are the ones
 * this project accepts.
 *
 * What this does **not** establish is what a container is for. A form containing
 * an input says nothing about what the form saves; that still needs a label, a
 * schema, an endpoint or an accepted claim. Structure is structure.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import { CONFIDENCE } from '../evidence.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import { sourceEvidence } from './context.js';
import type { JsxTagNode } from './jsx.js';

/** One guide element, as the containment walk needs it. */
export interface ContainmentCandidate {
  nodeId: string;
  elementId: string;
  tag: JsxTagNode;
}

/** What {@link extractElementContainment} needs. */
export interface ContainmentOptions {
  relativePath: string;
  /** Node id keyed by tag start offset. Duplicates are already excluded. */
  elementIdsByTagStart: ReadonlyMap<number, string>;
}

/** Why a candidate parent was refused. Reported so the recall cost is visible. */
export type ContainmentRefusal =
  'jsx-attribute-boundary' | 'component-boundary' | 'no-enclosing-element';

/** What the walk found, and what it declined to find. */
export interface ExtractedContainment {
  relationships: Relationship[];
  refusals: { elementId: string; reason: ContainmentRefusal }[];
}

/**
 * `element contains element` for every control whose parent can be read.
 *
 * Walks upward rather than downward, which is what makes "nearest" cheap and
 * unambiguous: the first guide-bearing element above a control is its parent,
 * and anything above that is its grandparent rather than a second parent.
 */
export function extractElementContainment(
  candidates: readonly ContainmentCandidate[],
  options: ContainmentOptions,
): ExtractedContainment {
  const relationships: Relationship[] = [];
  const refusals: { elementId: string; reason: ContainmentRefusal }[] = [];

  for (const candidate of candidates) {
    const found = nearestGuideAncestor(candidate.tag, options.elementIdsByTagStart);
    if (found.parentId === undefined) {
      if (found.reason !== undefined) {
        refusals.push({ elementId: candidate.elementId, reason: found.reason });
      }
      continue;
    }
    if (found.parentId === candidate.nodeId) continue;
    relationships.push(
      createRelationship('contains', found.parentId, candidate.nodeId, CONFIDENCE.DIRECT_SYNTAX, [
        sourceEvidence(candidate.tag, options.relativePath, candidate.elementId),
      ]),
    );
  }

  return { relationships, refusals };
}

function nearestGuideAncestor(
  tag: JsxTagNode,
  elementIdsByTagStart: ReadonlyMap<number, string>,
): { parentId?: string; reason?: ContainmentRefusal } {
  for (const ancestor of tag.getAncestors()) {
    // A control written inside a prop renders wherever the callee puts it.
    if (Node.isJsxAttribute(ancestor)) return { reason: 'jsx-attribute-boundary' };
    if (Node.isSourceFile(ancestor)) return { reason: 'no-enclosing-element' };

    if (!Node.isJsxElement(ancestor)) continue;
    const opening = ancestor.getOpeningElement();
    // The control's own `<tag>…</tag>` is its first JsxElement ancestor. Reading
    // it as the parent would make every element contain itself, and skipping the
    // self-edge afterwards would silently discard the real parent above it.
    if (opening.getStart() === tag.getStart()) continue;
    const name = opening.getTagNameNode().getText();

    const parentId = elementIdsByTagStart.get(opening.getStart());
    if (parentId !== undefined) return { parentId };

    // A component decides what to render, and may render nothing.
    if (/^[A-Z]/.test(name)) return { reason: 'component-boundary' };
  }
  return { reason: 'no-enclosing-element' };
}
