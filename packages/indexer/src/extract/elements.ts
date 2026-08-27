/**
 * Guide element extraction — the join key between source code and the runtime.
 *
 * An element enters the graph only when its identifier is a literal in the
 * source and survives the shared validator. Both halves matter: a computed id
 * cannot be proven, and an id that fails validation must never be recorded,
 * because everything downstream trusts that a graph element is addressable at
 * runtime.
 *
 * A repeated id is where that trust runs out. One semantic id is one node, and
 * two tags carrying it are two different controls: the node keeps the first
 * sighting's provenance, and *behaviour* is read from that sighting only. Both
 * tags still count as contained by the components that render them — that much
 * is true of each independently — but a handler on the second one is not read.
 * Reading it would put two `invokes` edges on one element, each at full
 * confidence, naming two different functions, and a consumer asking what the
 * element does would get both answers with no way to choose. The duplicate is
 * reported so the ambiguity is visible rather than silently resolved.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
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
import type { SymbolResolver } from '../resolve/symbols.js';
import { resolveElementLabel } from './labels.js';
import type { ResolvedLabel } from './labels.js';
import { elementId as toElementId } from '../node-id.js';
import { bindingNames } from '../resolve/symbols.js';
import { nodeProvenance } from '../provenance.js';
import {
  getJsxAttribute,
  getJsxTagNodes,
  getSingleTextChild,
  getStringAttributeValue,
  getTagName,
  readStringLiteral,
} from './jsx.js';
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

/**
 * What the full label rules need, when the caller can supply it.
 *
 * Optional so the extractor stays usable from a test with nothing but a source
 * file. Without it the three attribute-and-text sources still apply; with it a
 * wrapping `<label>`, an `aria-labelledby` and a proven prop become readable
 * too.
 */
export interface LabelResolution {
  resolver: SymbolResolver;
  filesByPath: ReadonlyMap<string, SourceFile>;
}

/** Mutable state threaded across files so duplicate ids can be detected. */
export interface ElementIdRegistry {
  /** First location each id was seen at, in sorted-file order. */
  firstSeen: Map<string, ProvenanceReference>;
}

/**
 * One sighting of a guide element.
 *
 * The node and the component that renders it are kept apart because the v2
 * graph expresses containment as a `contains` relationship rather than as a
 * field: the same semantic id may legitimately be rendered by two components,
 * and a single `componentId` field could only ever record one of them.
 */
export interface ExtractedElement {
  node: UIElementNode;
  /** Canonical id of the component that renders it, when there is one. */
  componentId?: string;
  /**
   * True when this tag repeats an id already seen, so it is not the sighting
   * the node was built from.
   */
  duplicate?: true;
  /** The JSX tag, for evidence on the `contains` edge. */
  tag: JsxTagNode;
}

/** Result of scanning one file. */
export interface ExtractedElements {
  elements: ExtractedElement[];
  diagnostics: IndexerDiagnostic[];
}

/** Creates the cross-file registry {@link extractElements} needs. */
export function createElementIdRegistry(): ElementIdRegistry {
  return { firstSeen: new Map() };
}

/**
 * True when `expression` names props this component's own caller supplied.
 *
 * `({ label, ...rest }: Props) => <Button {...rest} />` forwards everything the
 * caller passed and did not name — a bag whose contents are decided at every
 * call site, and which may perfectly well contain a guide attribute. A spread of
 * anything else (`{...register('name')}`, `{...{ 'data-guide': 'x' }}`) is a
 * value produced here, whose shape belongs to this file.
 *
 * A local binding that shadows a parameter of the same name is read as the
 * parameter, which costs an element rather than inventing one.
 */
function namesCallerSuppliedProps(expression: Node): boolean {
  if (!Node.isIdentifier(expression)) return false;
  const name = expression.getText();
  for (const ancestor of expression.getAncestors()) {
    if (Node.isSourceFile(ancestor)) return false;
    if (!Node.isFunctionLikeDeclaration(ancestor)) continue;
    for (const parameter of ancestor.getParameters()) {
      if (bindingNames(parameter.getNameNode()).includes(name)) return true;
    }
  }
  return false;
}

/**
 * Start offset of the first spread of caller-supplied props on a tag.
 *
 * JSX props are applied left to right, so a literal written before such a spread
 * is only a default: `<Button data-guide="toolbar.action" {...rest}>` renders
 * with whatever `data-guide` the caller passed. An id a caller can overwrite
 * names no element at runtime — which is where the graph has to be right — so it
 * is not recorded, rather than recorded as an id that may never reach the DOM.
 */
function firstSpreadStart(node: JsxTagNode): number | undefined {
  for (const attribute of node.getAttributes()) {
    if (!Node.isJsxSpreadAttribute(attribute)) continue;
    if (namesCallerSuppliedProps(attribute.getExpression())) return attribute.getStart();
  }
  return undefined;
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
  const spread = firstSpreadStart(node);
  for (const found of GUIDE_ATTRIBUTES) {
    const attribute = getJsxAttribute(node, found);
    if (attribute === undefined) continue;
    if (spread !== undefined && attribute.getStart() < spread) continue;
    const id = readStringLiteral(attribute.getInitializer());
    if (id !== undefined) return { attribute: found, id };
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
/**
 * Kept for the case where no label context is supplied.
 *
 * The three original sources and no more. A caller that can resolve components
 * — which is every caller inside the indexer — gets the full set from
 * {@link resolveElementLabel} instead, including wrapping `<label>` elements,
 * `aria-labelledby` and props proven to reach a text position. The Round 6
 * review measured eight visible labels this narrower version was missing.
 */
function legacyLabel(node: JsxTagNode): ResolvedLabel {
  const text = resolveLabel(node);
  return text === undefined ? { kind: 'none' } : { kind: 'static', text };
}

function resolveLabel(node: JsxTagNode): string | undefined {
  return (
    getStringAttributeValue(node, LABEL_ATTRIBUTE) ??
    getStringAttributeValue(node, ARIA_LABEL_ATTRIBUTE) ??
    getSingleTextChild(node)
  );
}

/**
 * The component's name from its `component:${file}#${name}` id.
 *
 * Read from the last `#` rather than the first: `#` is a legal character in a
 * file name, so `component:src/we#ird.tsx#Widget` has to resolve to `Widget`.
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
  labels?: LabelResolution,
): ExtractedElements {
  const elements: ExtractedElement[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  for (const node of getJsxTagNodes(sourceFile)) {
    const found = findGuideAttribute(node);
    if (!found) continue;

    const tagName = getTagName(node);
    const componentId = findComponentId(node, lookup);
    const provenance = nodeProvenance(node, relativePath, componentSymbol(componentId));

    if (!isValidGuideElementId(found.id)) {
      diagnostics.push({
        code: 'INVALID_ELEMENT_ID',
        severity: 'warning',
        message:
          `"${found.id}" is not a valid guide element id. ` +
          `Use dot-separated lowercase segments, e.g. "clients.create".`,
        file: relativePath,
        line: provenance.line ?? 1,
      });
      continue;
    }

    const first = registry.firstSeen.get(found.id);
    if (first !== undefined) {
      diagnostics.push({
        code: 'DUPLICATE_ELEMENT_ID',
        severity: 'warning',
        message: `"${found.id}" is declared more than once; first seen at ${formatLocation(first)}.`,
        file: relativePath,
        line: provenance.line ?? 1,
      });
    }
    const duplicate = first !== undefined;
    if (!duplicate) registry.firstSeen.set(found.id, provenance);

    // Key order is fixed by this literal, and optional keys are spread in
    // conditionally so an absent value is an absent key rather than
    // `"label": undefined` — same meaning, different bytes.
    const resolved =
      labels === undefined
        ? legacyLabel(node)
        : resolveElementLabel(node, {
            sourceFile,
            relativePath,
            resolver: labels.resolver,
            filesByPath: labels.filesByPath,
          });
    const label = resolved.text;
    elements.push({
      node: {
        kind: 'element',
        id: toElementId(found.id),
        elementId: found.id,
        type: resolveType(node, tagName),
        ...(label !== undefined ? { label } : {}),
        ...(resolved.origin !== undefined ? { labelOrigin: resolved.origin } : {}),
        // Recorded even when it is `none`, because "this control has no readable
        // name" and "nobody looked" are different facts and a consumer must be
        // able to tell them apart. `dynamic` is the one that stops a compiler
        // inventing "Choose Open." for a button showing an invoice number.
        labelKind: resolved.kind,
        attribute: found.attribute,
        tagName,
        featureId: guideElementNamespace(found.id),
        provenance,
      },
      ...(componentId !== undefined ? { componentId } : {}),
      ...(duplicate ? { duplicate: true } : {}),
      tag: node,
    });
  }

  return { elements, diagnostics };
}
