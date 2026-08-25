/**
 * Guide element extraction — the join key between source code and the runtime.
 *
 * An element enters the graph only when its identifier is a literal in the
 * source and survives the shared validator. Both halves matter: a computed id
 * cannot be proven, and an id that fails validation must never be recorded,
 * because everything downstream trusts that a graph element is addressable at
 * runtime.
 *
 * @packageDocumentation
 */

import type { SourceFile } from 'ts-morph';
import {
  GUIDE_ATTRIBUTES,
  guideElementNamespace,
  isValidGuideElementId,
  productElementTypeSchema,
} from '@statewavedev/guide-shared';
import type {
  GuideAttribute,
  ProductElementType,
  ProvenanceReference,
} from '@statewavedev/guide-shared';
import type { IndexerDiagnostic, UIElementNode } from '../graph.js';
import { nodeProvenance } from '../provenance.js';
import { getJsxTagNodes, getSingleTextChild, getStringAttributeValue, getTagName } from './jsx.js';
import type { JsxTagNode } from './jsx.js';

/** Attribute carrying an explicit element type override. */
const TYPE_ATTRIBUTE = 'data-guide-type';
/** Attribute carrying an explicit human-readable label. */
const LABEL_ATTRIBUTE = 'data-guide-label';
/** Accessibility label, used as the second-choice label source. */
const ARIA_LABEL_ATTRIBUTE = 'aria-label';

/**
 * Lowercase HTML tag names that imply a semantic element type.
 *
 * Custom (PascalCase) components are absent on purpose: `<Dialog />` may render
 * anything at all, so it falls through to `other` unless the author states the
 * type with `data-guide-type`.
 *
 * A `Map` rather than an object literal, because the key is a tag name read out
 * of someone else's source. `<constructor>` and `<toString>` are legal JSX, and
 * an object lookup would answer those with an inherited function rather than
 * falling through to `other` — which `JSON.stringify` then drops, leaving the
 * element with no `type` at all.
 */
const TAG_TYPES: ReadonlyMap<string, ProductElementType> = new Map([
  ['button', 'button'],
  ['a', 'link'],
  ['input', 'input'],
  ['textarea', 'input'],
  ['select', 'input'],
  ['form', 'form'],
  ['dialog', 'dialog'],
  ['table', 'table'],
  ['nav', 'menu'],
  ['menu', 'menu'],
  ['section', 'section'],
  ['article', 'section'],
  ['aside', 'section'],
  ['header', 'section'],
  ['footer', 'section'],
  ['main', 'section'],
]);

/** Where a component id can be looked up from an element's ancestors. */
export interface ComponentLookup {
  /** Component id keyed by the start offset of its function-like body. */
  byFunctionStart: ReadonlyMap<number, string>;
}

/** Mutable state threaded across files so duplicate ids can be detected. */
export interface ElementIdRegistry {
  /** First location each id was seen at, in sorted-file order. */
  firstSeen: Map<string, ProvenanceReference>;
}

/** Result of scanning one file. */
export interface ExtractedElements {
  elements: UIElementNode[];
  diagnostics: IndexerDiagnostic[];
}

/** Creates the cross-file registry {@link extractElements} needs. */
export function createElementIdRegistry(): ElementIdRegistry {
  return { firstSeen: new Map() };
}

/**
 * Finds the guide identifier on a tag.
 *
 * {@link GUIDE_ATTRIBUTES} is in precedence order, so `data-guide` wins over
 * the legacy `data-ai-id`. An attribute whose value is not a string literal is
 * skipped rather than failing the whole tag, which lets a file mix a computed
 * `data-guide` with a static `data-ai-id` without losing the fact it can prove.
 */
function findGuideAttribute(
  node: JsxTagNode,
): { attribute: GuideAttribute; id: string } | undefined {
  for (const attribute of GUIDE_ATTRIBUTES) {
    const id = getStringAttributeValue(node, attribute);
    if (id !== undefined) return { attribute, id };
  }
  return undefined;
}

/**
 * Resolves the semantic type: an explicit, valid `data-guide-type` first, then
 * the tag-name mapping, then `other`.
 */
function resolveType(node: JsxTagNode, tagName: string): ProductElementType {
  const declared = getStringAttributeValue(node, TYPE_ATTRIBUTE);
  if (declared !== undefined) {
    const parsed = productElementTypeSchema.safeParse(declared);
    if (parsed.success) return parsed.data;
  }
  return TAG_TYPES.get(tagName) ?? 'other';
}

/** Resolves the label: `data-guide-label`, then `aria-label`, then text. */
function resolveLabel(node: JsxTagNode): string | undefined {
  return (
    getStringAttributeValue(node, LABEL_ATTRIBUTE) ??
    getStringAttributeValue(node, ARIA_LABEL_ATTRIBUTE) ??
    getSingleTextChild(node)
  );
}

/**
 * The component's name from its `${file}#${name}` id.
 *
 * Read from the last `#` rather than the first: `#` is a legal character in a
 * file name, so `src/we#ird.tsx#Widget` has to resolve to `Widget`.
 */
function componentSymbol(componentId: string | undefined): string | undefined {
  if (componentId === undefined) return undefined;
  const separator = componentId.lastIndexOf('#');
  return separator === -1 ? undefined : componentId.slice(separator + 1);
}

/** Walks up from an element to the component that renders it, if any. */
function findComponentId(node: JsxTagNode, lookup: ComponentLookup): string | undefined {
  for (const ancestor of node.getAncestors()) {
    const id = lookup.byFunctionStart.get(ancestor.getStart());
    if (id !== undefined) return id;
  }
  return undefined;
}

function formatLocation(provenance: ProvenanceReference): string {
  return `${provenance.file ?? '<unknown>'}:${provenance.line ?? 0}`;
}

/** Extracts every guide element declared in `sourceFile`. */
export function extractElements(
  sourceFile: SourceFile,
  relativePath: string,
  lookup: ComponentLookup,
  registry: ElementIdRegistry,
): ExtractedElements {
  const elements: UIElementNode[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  for (const node of getJsxTagNodes(sourceFile)) {
    const found = findGuideAttribute(node);
    if (!found) continue;

    const tagName = getTagName(node);
    const componentId = findComponentId(node, lookup);
    const provenance = nodeProvenance(node, relativePath, componentSymbol(componentId));

    if (!isValidGuideElementId(found.id)) {
      diagnostics.push({
        code: 'invalid-element-id',
        message:
          `"${found.id}" is not a valid guide element id. ` +
          `Use dot-separated lowercase segments, e.g. "clients.create".`,
        file: relativePath,
        line: provenance.line ?? 1,
      });
      continue;
    }

    const first = registry.firstSeen.get(found.id);
    if (first === undefined) {
      registry.firstSeen.set(found.id, provenance);
    } else {
      diagnostics.push({
        code: 'duplicate-element-id',
        message: `"${found.id}" is declared more than once; first seen at ${formatLocation(first)}.`,
        file: relativePath,
        line: provenance.line ?? 1,
      });
    }

    // Key order is fixed by this literal, and optional keys are spread in
    // conditionally so an absent value is an absent key rather than
    // `"label": undefined` — same meaning, different bytes.
    const label = resolveLabel(node);
    elements.push({
      kind: 'ui-element',
      id: found.id,
      type: resolveType(node, tagName),
      ...(label !== undefined ? { label } : {}),
      attribute: found.attribute,
      tagName,
      ...(componentId !== undefined ? { componentId } : {}),
      featureId: guideElementNamespace(found.id),
      provenance,
    });
  }

  return { elements, diagnostics };
}
