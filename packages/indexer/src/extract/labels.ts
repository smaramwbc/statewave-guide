/**
 * What a control is called, according to the interface rather than to us.
 *
 * Round 6 measured the cost of not having this. Nine of twenty-one features
 * carried a title manufactured from their semantic id, and split on that one
 * variable the corpus reads:
 *
 *   title is a real visible label   n=12   mean usefulness 2.25   correctness 1.92
 *   title derived from the id       n= 9   mean usefulness 0.67   correctness 1.25
 *
 * Six of the seven items still scoring correctness 1 were the title, and the
 * reviewer said so almost verbatim five times — *"the title's meaning is not
 * independently supported"*.
 *
 * The worst single case was not a title. `invoices.list.open` emitted the step
 * **"Choose Open."** for
 *
 * ```jsx
 * <button data-guide="invoices.list.open" onClick={() => selectRow(invoice)}>
 *   {invoice.number}
 * </button>
 * ```
 *
 * The button's text is an invoice number at runtime. Nothing in that interface
 * says *Open*; the word is the last segment of the id. A user was going to be
 * sent looking for a control that does not exist under that name.
 *
 * Meanwhile the fixture contains eight visible labels the indexer was not
 * reading: `Organisation`, `Email me when an invoice is paid` and `Plan` sit in
 * wrapping `<label>` elements, and `Name`, `Billing email`, `New client`,
 * `All clients` and `Invoices` are passed as props to components that render
 * them. The evidence was there; nothing looked for it.
 *
 * So this module answers one question, and refuses to guess at it: **what text
 * does a user actually see for this control?**
 *
 * Five sources, each with an origin recorded so a consumer can weigh them, and
 * a sixth answer that is not a name at all — `dynamic`, for a control whose text
 * is computed. Knowing that we do not know is worth more than a plausible noun,
 * because it is the difference between withholding a step and inventing one.
 *
 * **A prop is never assumed to be a name.** `label`, `title`, `caption` and
 * `name` are conventions, and a convention is not evidence. Every string-literal
 * attribute is tested the same way: resolve the component, and look for that
 * prop being rendered *in a text position*. `<Field label="Billing email" />` is
 * a visible label only because `Field` puts `{label}` between tags.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { SymbolResolver } from '../resolve/symbols.js';
import {
  collapseWhitespace,
  getJsxAttribute,
  getStringAttributeValue,
  getTagName,
  readStringLiteral,
} from './jsx.js';
import type { JsxTagNode } from './jsx.js';
import { decodeCharacterReferences } from './entities.js';

/** Where a visible name came from. Recorded so a reader can weigh it. */
export type LabelOrigin =
  /** `data-guide-label`, an author stating it outright. */
  | 'guide-label'
  /** `aria-label`. */
  | 'aria-label'
  /** The tag's own text, when its only child is text. */
  | 'text-child'
  /** A `<label>` element wrapping the control. */
  | 'wrapping-label'
  /** `aria-labelledby`, resolved to statically known text in the same file. */
  | 'aria-labelledby'
  /** A prop proven to reach a text position in the component it is passed to. */
  | 'label-prop';

/**
 * Whether the control's visible text is knowable at all.
 *
 * `dynamic` is the answer that matters. A `<button>{invoice.number}</button>`
 * has a name; we simply cannot know it, and that is a different fact from
 * having none. Recording it lets a compiler refuse to name the control instead
 * of falling back on an identifier, which is exactly the refusal Round 6 shows
 * was missing.
 */
export type LabelKind = 'static' | 'dynamic' | 'none';

/** What a control is called, and how we know. */
export interface ResolvedLabel {
  kind: LabelKind;
  text?: string;
  origin?: LabelOrigin;
}

const NONE: ResolvedLabel = { kind: 'none' };

/** What {@link resolveElementLabel} needs beyond the tag. */
export interface LabelContext {
  sourceFile: SourceFile;
  relativePath: string;
  resolver: SymbolResolver;
  /** Every source file in the project, by relative path. */
  filesByPath: ReadonlyMap<string, SourceFile>;
}

/**
 * The visible name of a control, or an honest statement that there is none.
 *
 * Ordered by how directly a user meets the text. An author's explicit
 * `data-guide-label` outranks an accessibility attribute, which outranks the
 * tag's own text, which outranks a name supplied from outside the tag.
 */
export function resolveElementLabel(tag: JsxTagNode, context: LabelContext): ResolvedLabel {
  const guideLabel = getStringAttributeValue(tag, 'data-guide-label');
  if (guideLabel !== undefined) return { kind: 'static', text: guideLabel, origin: 'guide-label' };

  const ariaLabel = getStringAttributeValue(tag, 'aria-label');
  if (ariaLabel !== undefined) return { kind: 'static', text: ariaLabel, origin: 'aria-label' };

  const own = ownTextChild(tag);
  if (own !== undefined) return { kind: 'static', text: own, origin: 'text-child' };

  const wrapping = wrappingLabelText(tag);
  if (wrapping !== undefined) return { kind: 'static', text: wrapping, origin: 'wrapping-label' };

  const labelledBy = ariaLabelledByText(tag, context.sourceFile);
  if (labelledBy !== undefined)
    return { kind: 'static', text: labelledBy, origin: 'aria-labelledby' };

  const fromProp = labelPropText(tag, context, 0);
  if (fromProp !== undefined) return { kind: 'static', text: fromProp, origin: 'label-prop' };

  return hasComputedText(tag) ? { kind: 'dynamic' } : NONE;
}

// ---------------------------------------------------------------------------
// The tag's own text
// ---------------------------------------------------------------------------

/**
 * The element's text, when it is text and nothing else.
 *
 * Deliberately narrower than "flatten everything inside": a control containing
 * a `<span>` and an icon and a count is not named by concatenating them, and a
 * control containing an expression is not named at all.
 */
function ownTextChild(tag: JsxTagNode): string | undefined {
  const runs = staticTextRuns(tag, undefined);
  return runs.length === 1 ? runs[0] : undefined;
}

/** True when the tag's content is computed, so it has a name we cannot read. */
function hasComputedText(tag: JsxTagNode): boolean {
  if (!Node.isJsxOpeningElement(tag)) return false;
  const parent = tag.getParent();
  if (!Node.isJsxElement(parent)) return false;
  return parent.getJsxChildren().some((child) => {
    if (!Node.isJsxExpression(child)) return false;
    const expression = child.getExpression();
    // `{' '}` and `{/* comment */}` are not content.
    return expression !== undefined && !Node.isStringLiteral(expression);
  });
}

/**
 * Every statically readable text run inside a tag, in order.
 *
 * Descends through intrinsic elements only, because a `<span>` is markup a user
 * reads through and a `<Component>` is a black box that may render anything.
 * Skips the subtree named by `exclude`, which is how a wrapping `<label>` reads
 * its own text without reading the control's.
 */
function staticTextRuns(tag: JsxTagNode, exclude: Node | undefined): string[] {
  if (!Node.isJsxOpeningElement(tag)) return [];
  const parent = tag.getParent();
  if (!Node.isJsxElement(parent)) return [];
  return runsOfChildren(parent, exclude);
}

function runsOfChildren(container: Node, exclude: Node | undefined): string[] {
  const runs: string[] = [];
  const children = Node.isJsxElement(container)
    ? container.getJsxChildren()
    : Node.isJsxFragment(container)
      ? container.getJsxChildren()
      : [];

  for (const child of children) {
    if (exclude !== undefined && containsNode(child, exclude)) continue;

    if (Node.isJsxText(child)) {
      if (child.containsOnlyTriviaWhiteSpaces()) continue;
      const text = collapseWhitespace(decodeCharacterReferences(child.getText()));
      if (text.length > 0) runs.push(text);
      continue;
    }

    if (Node.isJsxElement(child)) {
      const name = child.getOpeningElement().getTagNameNode().getText();
      // A custom component's rendered text is not in this file. Refuse rather
      // than descend — the whole discipline here is that a name must be read,
      // never assumed.
      if (/^[A-Z]/.test(name)) return [];
      runs.push(...runsOfChildren(child, exclude));
      continue;
    }

    if (Node.isJsxFragment(child)) {
      runs.push(...runsOfChildren(child, exclude));
      continue;
    }

    if (Node.isJsxExpression(child)) {
      const expression = child.getExpression();
      if (expression === undefined) continue;
      const literal = readStringLiteral(child);
      if (literal !== undefined) {
        const text = collapseWhitespace(literal);
        if (text.length > 0) runs.push(text);
        continue;
      }
      // A computed run. Not text we can read, and its presence means any text
      // beside it is only part of the name.
      return [];
    }
  }
  return runs;
}

function containsNode(container: Node, target: Node): boolean {
  return (
    container === target ||
    (target.getStart() >= container.getStart() && target.getEnd() <= container.getEnd())
  );
}

// ---------------------------------------------------------------------------
// Wrapping <label>
// ---------------------------------------------------------------------------

/**
 * The text of a `<label>` that wraps this control.
 *
 * ```jsx
 * <label className="field">
 *   <span className="field__label">Organisation</span>
 *   <input data-guide="settings.name" />
 * </label>
 * ```
 *
 * Three refusals, and each has a shape in the fixture behind it. The walk stops
 * at a **JSX attribute**, because a control passed as a prop is lexically inside
 * an ancestor and rendered wherever the callee decides. It stops at a
 * **PascalCase component**, because that component decides what to render and
 * may render neither. And it requires **exactly one** text run outside the
 * control's own subtree, because a label containing two candidate strings does
 * not tell us which is the name.
 */
function wrappingLabelText(tag: JsxTagNode): string | undefined {
  let child: Node = tag;
  for (const ancestor of tag.getAncestors()) {
    if (Node.isJsxAttribute(ancestor)) return undefined;
    if (Node.isSourceFile(ancestor)) return undefined;

    if (Node.isJsxElement(ancestor)) {
      const name = ancestor.getOpeningElement().getTagNameNode().getText();
      if (/^[A-Z]/.test(name)) return undefined;
      if (name === 'label') {
        const runs = runsOfChildren(ancestor, child);
        return runs.length === 1 ? runs[0] : undefined;
      }
    }
    child = ancestor;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// aria-labelledby
// ---------------------------------------------------------------------------

/**
 * Text of the elements an `aria-labelledby` names.
 *
 * Resolved only against `id` attributes that are string literals in the same
 * file, and only when **every** referenced id resolves. A partial resolution
 * would produce a fragment of the accessible name and present it as the whole.
 */
function ariaLabelledByText(tag: JsxTagNode, sourceFile: SourceFile): string | undefined {
  const value = getStringAttributeValue(tag, 'aria-labelledby');
  if (value === undefined) return undefined;
  const ids = value.split(/\s+/).filter((entry) => entry.length > 0);
  if (ids.length === 0) return undefined;

  const byId = new Map<string, JsxTagNode>();
  sourceFile.forEachDescendant((node) => {
    if (!Node.isJsxOpeningElement(node) && !Node.isJsxSelfClosingElement(node)) return;
    const id = getStringAttributeValue(node, 'id');
    if (id !== undefined && !byId.has(id)) byId.set(id, node);
  });

  const parts: string[] = [];
  for (const id of ids) {
    const referenced = byId.get(id);
    if (referenced === undefined) return undefined;
    const runs = staticTextRuns(referenced, undefined);
    if (runs.length !== 1) return undefined;
    parts.push(runs[0]!);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// A prop proven to reach a text position
// ---------------------------------------------------------------------------

/** How many component hops a forwarded prop may be followed through. */
const MAX_PROP_HOPS = 2;

/**
 * A string prop that the receiving component renders as text.
 *
 * No prop name is privileged. Every string-literal attribute on the tag is
 * offered to the same test — does the component put *this prop* between tags? —
 * so `label`, `caption` and `heading` all work if the component renders them and
 * none works if it does not. `<Field label="Billing email" />` is a name only
 * because `Field` contains `{label}` in a child position.
 *
 * Ambiguity refuses: two props both rendered as text do not say which is the
 * control's name.
 */
function labelPropText(tag: JsxTagNode, context: LabelContext, hop: number): string | undefined {
  if (hop >= MAX_PROP_HOPS) return undefined;
  const tagName = getTagName(tag);
  if (!/^[A-Z]/.test(tagName)) return undefined;

  const component = resolveComponentBody(tagName, tag, context);
  if (component === undefined) return undefined;

  const found: string[] = [];
  for (const attribute of tag.getAttributes()) {
    if (!Node.isJsxAttribute(attribute)) continue;
    const propName = attribute.getNameNode().getText();
    const value = readStringLiteral(attribute.getInitializer());
    if (value === undefined) continue;
    const text = collapseWhitespace(value);
    if (text.length === 0) continue;
    if (!rendersPropAsText(component.body, propName, component.context, hop)) continue;
    found.push(text);
  }
  return found.length === 1 ? found[0] : undefined;
}

interface ResolvedComponent {
  body: Node;
  context: LabelContext;
}

/** The declaration a PascalCase tag names, when the project holds one. */
function resolveComponentBody(
  name: string,
  tag: JsxTagNode,
  context: LabelContext,
): ResolvedComponent | undefined {
  const target = context.resolver.resolveIdentifier(
    context.relativePath,
    name,
    tag.getTagNameNode(),
  );
  if (target.kind !== 'declaration') return undefined;

  const file = context.filesByPath.get(target.ref.file);
  if (file === undefined) return undefined;

  const body = declarationNamed(file, target.ref.name);
  if (body === undefined) return undefined;
  return { body, context: { ...context, sourceFile: file, relativePath: target.ref.file } };
}

/**
 * The function-like body declared under a name in a file.
 *
 * Handles the three shapes the fixture uses: a function declaration, a variable
 * initialised to an arrow, and a variable initialised to a call that wraps a
 * function — `forwardRef(function TextField(…) {…})`.
 */
function declarationNamed(file: SourceFile, name: string): Node | undefined {
  for (const declaration of file.getFunctions()) {
    if (declaration.getName() === name) return declaration;
  }
  for (const statement of file.getVariableDeclarations()) {
    if (statement.getName() !== name) continue;
    const initialiser = statement.getInitializer();
    if (initialiser === undefined) continue;
    if (Node.isArrowFunction(initialiser) || Node.isFunctionExpression(initialiser)) {
      return initialiser;
    }
    if (Node.isCallExpression(initialiser)) {
      for (const argument of initialiser.getArguments()) {
        if (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument)) return argument;
      }
    }
  }
  return undefined;
}

/**
 * Whether a component renders one of its props as visible text.
 *
 * The prop must arrive by destructuring — `{ label }` or `{ label: caption }` —
 * because a `props.label` read is the same fact and the fixture does not use it;
 * adding it later is a widening rather than a correction.
 *
 * Two ways to satisfy the test. Either the identifier appears as a **JSX child
 * expression**, which is a text position by definition, or it is **forwarded**
 * to another component that does the same one hop further in. Forwarding is
 * bounded at {@link MAX_PROP_HOPS} because an unbounded search is a program
 * analysis, and this is meant to be a rule somebody can check by hand.
 */
function rendersPropAsText(
  body: Node,
  propName: string,
  context: LabelContext,
  hop: number,
): boolean {
  const local = destructuredLocalName(body, propName);
  if (local === undefined) return false;

  let rendered = false;
  body.forEachDescendant((node, traversal) => {
    if (!Node.isJsxExpression(node)) return;
    const expression = node.getExpression();
    if (expression === undefined || !Node.isIdentifier(expression)) return;
    if (expression.getText() !== local) return;

    const parent = node.getParent();
    // A child position renders; an attribute initialiser does not.
    if (Node.isJsxElement(parent) || Node.isJsxFragment(parent)) {
      rendered = true;
      traversal.stop();
      return;
    }
    if (Node.isJsxAttribute(parent)) {
      const owner = parent.getFirstAncestor(
        (candidate) =>
          Node.isJsxOpeningElement(candidate) || Node.isJsxSelfClosingElement(candidate),
      );
      if (owner === undefined) return;
      const forwardedName = parent.getNameNode().getText();
      const inner = resolveComponentBody(
        getTagName(owner as JsxTagNode),
        owner as JsxTagNode,
        context,
      );
      if (inner === undefined) return;
      if (rendersPropAsText(inner.body, forwardedName, inner.context, hop + 1)) {
        rendered = true;
        traversal.stop();
      }
    }
  });
  return rendered;
}

/** The local name a prop arrives under, when it arrives by destructuring. */
function destructuredLocalName(body: Node, propName: string): string | undefined {
  if (
    !Node.isFunctionDeclaration(body) &&
    !Node.isArrowFunction(body) &&
    !Node.isFunctionExpression(body)
  ) {
    return undefined;
  }
  const first = body.getParameters()[0];
  if (first === undefined) return undefined;
  const pattern = first.getNameNode();
  if (!Node.isObjectBindingPattern(pattern)) return undefined;

  for (const element of pattern.getElements()) {
    const property = element.getPropertyNameNode();
    const source = property === undefined ? element.getNameNode().getText() : property.getText();
    if (source === propName) return element.getNameNode().getText();
  }
  return undefined;
}

/** Exposed for the containment extractor, which needs the same refusals. */
export { getJsxAttribute };
