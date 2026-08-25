/**
 * Shared JSX syntax helpers.
 *
 * Everything the extractors need from a JSX tag — its name, its attributes, its
 * text content — is read from the syntax tree, never from the type checker and
 * never with a regular expression over source text. That is what lets the
 * indexer run on a project whose dependencies are not installed and still be
 * correct.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, SourceFile } from 'ts-morph';
import { decodeCharacterReferences } from './entities.js';

/** Either shape a JSX tag can take: `<a href="">…</a>` or `<img />`. */
export type JsxTagNode = JsxOpeningElement | JsxSelfClosingElement;

/** The JSX node kinds that count as "this file renders UI". */
const JSX_KINDS = [
  SyntaxKind.JsxElement,
  SyntaxKind.JsxSelfClosingElement,
  SyntaxKind.JsxFragment,
] as const;

/**
 * Every JSX tag in the file, in document order.
 *
 * A single traversal is used rather than one `getDescendantsOfKind` call per
 * kind, because concatenating two per-kind lists would interleave them by kind
 * instead of by position — and "the first occurrence of a duplicate id" has to
 * mean the first one a reader would see.
 */
export function getJsxTagNodes(sourceFile: SourceFile): JsxTagNode[] {
  const nodes: JsxTagNode[] = [];
  sourceFile.forEachDescendant((node) => {
    if (Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node)) nodes.push(node);
  });
  return nodes;
}

/** `true` when `node` has any JSX inside it. */
export function containsJsx(node: Node): boolean {
  return JSX_KINDS.some((kind) => node.getFirstDescendantByKind(kind) !== undefined);
}

/** The tag exactly as written, e.g. `button`, `Dialog` or `Router.Route`. */
export function getTagName(node: JsxTagNode): string {
  return node.getTagNameNode().getText();
}

/** Looks up an attribute by its literal name, e.g. `data-guide`. */
export function getJsxAttribute(node: JsxTagNode, name: string): JsxAttribute | undefined {
  for (const attribute of node.getAttributes()) {
    if (!Node.isJsxAttribute(attribute)) continue;
    if (attribute.getNameNode().getText() === name) return attribute;
  }
  return undefined;
}

/**
 * Reads a node as a plain string literal, or returns `undefined`.
 *
 * Accepts `"literal"` and `{'literal'}`. Deliberately rejects template
 * literals, variables and anything else that would require evaluating code:
 * a value the indexer cannot prove is not a fact it may record.
 *
 * Only the bare form is entity-decoded, which is exactly what the JSX
 * transform does: `c="a&amp;b"` reaches the DOM as `a&b`, while `c={'a&amp;b'}`
 * is an ordinary JavaScript string and reaches it unchanged.
 */
export function readStringLiteral(node: Node | undefined): string | undefined {
  if (!node) return undefined;
  if (Node.isStringLiteral(node)) return decodeCharacterReferences(node.getLiteralValue());
  if (Node.isJsxExpression(node)) {
    const expression = node.getExpression();
    if (expression && Node.isStringLiteral(expression)) return expression.getLiteralValue();
  }
  return undefined;
}

/** String-literal value of an attribute, or `undefined` when it is not one. */
export function getStringAttributeValue(node: JsxTagNode, name: string): string | undefined {
  const attribute = getJsxAttribute(node, name);
  return attribute ? readStringLiteral(attribute.getInitializer()) : undefined;
}

/** Collapses runs of whitespace to single spaces and trims the result. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * The element's text content, when its only child is text.
 *
 * `<button data-guide="x">New Client</button>` yields `New Client`. Anything
 * with an expression child, several children, or no children yields
 * `undefined` — an interpolated label is not a static fact.
 *
 * Character references are decoded before whitespace is collapsed, so
 * `Save&nbsp;&amp;&nbsp;close` yields `Save & close`: the string a reader sees
 * on screen, and therefore the string an agent searching the graph will look
 * for, rather than the string the file happens to spell it with.
 */
export function getSingleTextChild(node: JsxTagNode): string | undefined {
  if (!Node.isJsxOpeningElement(node)) return undefined;
  const parent = node.getParent();
  if (!Node.isJsxElement(parent)) return undefined;

  const children = parent
    .getJsxChildren()
    .filter((child) => !(Node.isJsxText(child) && child.containsOnlyTriviaWhiteSpaces()));

  const only = children[0];
  if (children.length !== 1 || only === undefined || !Node.isJsxText(only)) return undefined;

  const text = collapseWhitespace(decodeCharacterReferences(only.getText()));
  return text.length > 0 ? text : undefined;
}
