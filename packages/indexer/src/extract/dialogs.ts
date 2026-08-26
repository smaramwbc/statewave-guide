/**
 * `opens` — which function makes a dialog appear.
 *
 * The most dangerous edge in the graph, because the naive version of it is easy
 * and almost right. `modal.open('create-client')` obviously opens the create
 * client dialog, and `'create-client'` obviously names `CreateClientDialog` —
 * except that the mapping from that string to that component lives in a
 * registry the indexer has not read, and a rename on either side turns an
 * obvious inference into a confident lie. So a string key produces an
 * `UNRESOLVED_MODAL_REGISTRY` and nothing else. Resemblance is not evidence.
 *
 * What is emitted instead is one rule, `state-flag-gates-element`, which
 * requires three facts to be present *in one component* and to name the same
 * binding:
 *
 * 1. `const [isOpen, setIsOpen] = useState(false)` declares the flag;
 * 2. a function in that component calls `setIsOpen(true)`;
 * 3. that same `isOpen` gates a component in the return — `{isOpen && <X/>}`,
 *    `{isOpen ? <X/> : null}` or `<X open={isOpen}/>`.
 *
 * Each of the three is checked by resolving the identifier back to the
 * declaration the `useState` call introduced, so a shadowing binding of the same
 * name cannot stand in for it. Remove any one fact and there is no edge — which
 * is exactly what happens on a page whose flag lives inside a hook, where the
 * behaviour is identical and the proof is not available.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import { CONFIDENCE } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver } from '../resolve/symbols.js';
import { findOwnerId, inferenceEvidence, lineOf, symbolOfNodeId } from './context.js';
import { resolveRenderedComponent } from './renders.js';

/** Props whose value being the flag means "this component is shown". */
const OPEN_PROPS: ReadonlySet<string> = new Set([
  'open',
  'isOpen',
  'opened',
  'show',
  'shown',
  'visible',
]);

/** Members that look like a modal registry rather than a component. */
const MODAL_OPENERS: ReadonlySet<string> = new Set(['open', 'show', 'openModal', 'showModal']);

/** Objects whose `open('key')` call is a registry lookup, not a component. */
const MODAL_OBJECTS = /^(modal|dialog|overlay|sheet|drawer)s?$/i;

/** What one file's dialog flags produced. */
export interface ExtractedDialogs {
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
}

/** Inputs {@link extractDialogs} needs beyond the file itself. */
export interface DialogExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  owners: ReadonlyMap<number, string>;
  nodeIds: ReadonlySet<string>;
  /** Component node id keyed by the start offset of its function-like body. */
  componentIdsByFunctionStart: ReadonlyMap<number, string>;
}

/** A `const [flag, setFlag] = useState(…)` pair inside one component. */
interface StateFlag {
  flag: string;
  setter: string;
  /**
   * The declaration both names come from.
   *
   * Kept so every use of either name can be resolved back to *this* binding: a
   * second component in the same file, or a nested function, may legitimately
   * declare `isOpen` too, and matching on the name alone would let one
   * component's setter open another's dialog.
   */
  declaration: Node;
}

/** Reads the `useState` pairs a component declares. */
function readStateFlags(body: Node): StateFlag[] {
  const flags: StateFlag[] = [];
  body.forEachDescendant((node) => {
    if (!Node.isVariableDeclaration(node)) return;
    const nameNode = node.getNameNode();
    if (!Node.isArrayBindingPattern(nameNode)) return;

    const initializer = node.getInitializer();
    if (initializer === undefined || !Node.isCallExpression(initializer)) return;
    const callee = initializer.getExpression();
    const calleeName = Node.isIdentifier(callee)
      ? callee.getText()
      : Node.isPropertyAccessExpression(callee)
        ? callee.getName()
        : undefined;
    if (calleeName !== 'useState') return;

    const [first, second] = nameNode.getElements();
    if (first === undefined || second === undefined) return;
    if (!Node.isBindingElement(first) || !Node.isBindingElement(second)) return;
    const flagName = first.getNameNode();
    const setterName = second.getNameNode();
    if (!Node.isIdentifier(flagName) || !Node.isIdentifier(setterName)) return;

    flags.push({
      flag: flagName.getText(),
      setter: setterName.getText(),
      declaration: node,
    });
  });
  return flags;
}

/** True when `name`, read at `identifier`, resolves to exactly `declaration`. */
function refersTo(
  identifier: Node,
  declaration: Node,
  name: string,
  options: DialogExtractionOptions,
): boolean {
  const target = options.resolver.resolveIdentifier(options.relativePath, name, identifier);
  return target.kind === 'local' && target.declaration === declaration;
}

/** The JSX tag a flag gates, for every gate written in one component. */
function gatedTags(body: Node, flag: StateFlag, options: DialogExtractionOptions): Node[] {
  const tags: Node[] = [];

  const isFlag = (node: Node | undefined): boolean =>
    node !== undefined &&
    Node.isIdentifier(node) &&
    node.getText() === flag.flag &&
    refersTo(node, flag.declaration, flag.flag, options);

  /** `<X/>` or `<X>…</X>` written where a value is expected. */
  const tagOf = (node: Node | undefined): Node | undefined => {
    if (node === undefined) return undefined;
    if (Node.isJsxSelfClosingElement(node)) return node.getTagNameNode();
    if (Node.isJsxElement(node)) return node.getOpeningElement().getTagNameNode();
    return undefined;
  };

  body.forEachDescendant((node) => {
    // `{isOpen && <NewClientDialog/>}`
    if (Node.isBinaryExpression(node)) {
      if (node.getOperatorToken().getKind() !== SyntaxKind.AmpersandAmpersandToken) return;
      if (!isFlag(node.getLeft())) return;
      const tag = tagOf(node.getRight());
      if (tag !== undefined) tags.push(tag);
      return;
    }

    // `{isOpen ? <NewClientDialog/> : null}`
    if (Node.isConditionalExpression(node)) {
      if (!isFlag(node.getCondition())) return;
      const tag = tagOf(node.getWhenTrue());
      if (tag !== undefined) tags.push(tag);
      return;
    }

    // `<NewClientDialog open={isOpen}/>`
    if (Node.isJsxAttribute(node)) {
      if (!OPEN_PROPS.has(node.getNameNode().getText())) return;
      const initializer = node.getInitializer();
      if (initializer === undefined || !Node.isJsxExpression(initializer)) return;
      if (!isFlag(initializer.getExpression())) return;
      const parent = node.getParent().getParent();
      if (parent === undefined) return;
      if (Node.isJsxSelfClosingElement(parent) || Node.isJsxOpeningElement(parent)) {
        tags.push(parent.getTagNameNode());
      }
    }
  });

  return tags;
}

/** Every `setFlag(true)` call inside one component, with the function running it. */
function openingCalls(
  body: Node,
  flag: StateFlag,
  options: DialogExtractionOptions,
): { ownerId: string; at: Node }[] {
  const calls: { ownerId: string; at: Node }[] = [];
  for (const call of body.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isIdentifier(callee) || callee.getText() !== flag.setter) continue;

    const [argument] = call.getArguments();
    if (argument === undefined || argument.getKind() !== SyntaxKind.TrueKeyword) continue;
    if (!refersTo(callee, flag.declaration, flag.setter, options)) continue;

    // The edge leaves the *handler*, not the component: "pressing this runs
    // openCreateClient, which opens the dialog" is the chain a user walks.
    const ownerId = findOwnerId(call, options.owners);
    if (ownerId === undefined || !ownerId.startsWith('function:')) continue;
    calls.push({ ownerId, at: call });
  }
  return calls;
}

/** Reports `modal.open('create-client')` rather than guessing what it opens. */
function reportModalRegistry(
  sourceFile: SourceFile,
  options: DialogExtractionOptions,
  diagnostics: IndexerDiagnostic[],
): void {
  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) continue;
    if (!MODAL_OPENERS.has(callee.getName())) continue;

    const object = callee.getExpression();
    if (!Node.isIdentifier(object) || !MODAL_OBJECTS.test(object.getText())) continue;

    const [argument] = call.getArguments();
    if (argument === undefined || !Node.isStringLiteral(argument)) continue;

    diagnostics.push({
      code: 'UNRESOLVED_MODAL_REGISTRY',
      severity: 'info',
      message:
        `"${argument.getLiteralValue()}" names a modal through a registry this indexer has ` +
        `not read, so no component was linked. A string that resembles a component name is ` +
        `not evidence that it is one.`,
      file: options.relativePath,
      line: lineOf(call),
      excerpt: call.getText().replace(/\s+/g, ' ').slice(0, 120),
    });
  }
}

/** Every provable `opens` edge in one file. */
export function extractDialogs(
  sourceFile: SourceFile,
  options: DialogExtractionOptions,
): ExtractedDialogs {
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  reportModalRegistry(sourceFile, options, diagnostics);

  // Only function-like nodes, because several nodes can begin at one offset —
  // a modifier list starts where its declaration does — and a keyword standing
  // in for a component body would silently find no state at all.
  const bodies = new Map<number, Node>();
  sourceFile.forEachDescendant((node) => {
    if (!Node.isFunctionLikeDeclaration(node)) return;
    if (options.componentIdsByFunctionStart.has(node.getStart())) bodies.set(node.getStart(), node);
  });

  for (const [start, body] of [...bodies].sort((a, b) => a[0] - b[0])) {
    const componentId = options.componentIdsByFunctionStart.get(start);
    if (componentId === undefined) continue;

    for (const flag of readStateFlags(body)) {
      const tags = gatedTags(body, flag, options);
      if (tags.length === 0) continue;
      const opens = openingCalls(body, flag, options);
      if (opens.length === 0) continue;

      for (const tagNameNode of tags) {
        const resolved = resolveRenderedComponent(tagNameNode, {
          relativePath: options.relativePath,
          resolver: options.resolver,
          owners: options.owners,
          nodeIds: options.nodeIds,
        });
        if (!resolved || resolved.id === componentId) continue;

        for (const { ownerId, at } of opens) {
          relationships.push(
            createRelationship('opens', ownerId, resolved.id, CONFIDENCE.STATIC_INFERENCE, [
              inferenceEvidence(
                at,
                options.relativePath,
                'state-flag-gates-element',
                symbolOfNodeId(ownerId),
              ),
              inferenceEvidence(
                tagNameNode,
                options.relativePath,
                'state-flag-gates-element',
                symbolOfNodeId(componentId),
              ),
            ]),
          );
        }
      }
    }
  }

  return { relationships, diagnostics };
}
