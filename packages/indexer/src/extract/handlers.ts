/**
 * UI behaviour: what a control does when a user operates it.
 *
 * Two edges come out of this module and they answer the same question at two
 * granularities. `element --invokes--> function` says which function a click
 * runs; `element --submits_to--> function` says which function a form submit
 * runs. They are separate relationship types because a form is the one control
 * whose handler is named on the container rather than on the thing pressed, and
 * collapsing them would make "what does this button do?" and "where does this
 * form go?" the same query.
 *
 * The module is mostly a list of shapes it refuses.
 *
 * A handler prop is only resolved when the syntax at the call site names the
 * function that runs. `onClick={onCancel}` names a *prop*, and which function
 * that prop holds is decided by whichever parent renders the component — a fact
 * that is not in this file and may differ per call site. `action={actions.save}`
 * reads a member off an object that may be assembled anywhere. An arrow whose
 * body does several things names no single handler. Each of those becomes an
 * `UNRESOLVED_DYNAMIC_CALL`, so the gap is visible rather than silently absent.
 *
 * ## Why these edges carry a rule
 *
 * Every edge here is justified by combining two source facts — the JSX
 * attribute, and the binding the attribute's expression names — so the evidence
 * is `static-inference` and names the rule that combined them. The confidence
 * is a separate axis: it stays at `DIRECT_SYNTAX` when both facts are written in
 * one module, drops to `RESOLVED_SYMBOL` when reaching the declaration crossed
 * an import, and drops again to `STATIC_INFERENCE` when a memo wrapper had to be
 * opened to find the call.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { CallExpression, JsxAttribute, SourceFile } from 'ts-morph';
import { CONFIDENCE } from '../evidence.js';
import type { Confidence, InferenceRule } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { functionId } from '../node-id.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver, SymbolTarget } from '../resolve/symbols.js';
import { confidenceForVia, unwrapExpression } from '../resolve/symbols.js';
import { findOwnerId, inferenceEvidence, lineOf, symbolOfNodeId } from './context.js';
import { getJsxAttribute, getJsxTagNodes, getTagName } from './jsx.js';
import type { JsxTagNode } from './jsx.js';

/** A prop whose name marks it as an event handler. */
const HANDLER_PROP_PATTERN = /^on[A-Z]/;

/** Memo wrappers whose function argument is the handler. */
const MEMO_WRAPPERS: ReadonlySet<string> = new Set(['useCallback', 'useMemo', 'useEvent']);

/** Methods called on the event object, which never name the handler. */
const EVENT_METHODS: ReadonlySet<string> = new Set([
  'preventDefault',
  'stopPropagation',
  'stopImmediatePropagation',
  'persist',
]);

/** What one file's handler props produced. */
export interface ExtractedHandlers {
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
}

/** Inputs {@link extractHandlers} needs beyond the file itself. */
export interface HandlerExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  /** Node id of the declaration owning each function-like body. */
  owners: ReadonlyMap<number, string>;
  /** Every node id in the graph, so a resolution can be checked to land. */
  nodeIds: ReadonlySet<string>;
  /** Node id of each function declared in this file, keyed by its start offset. */
  declarationIds: ReadonlyMap<number, string>;
  /** Element node ids keyed by the start offset of the JSX tag declaring them. */
  elementIdsByTagStart: ReadonlyMap<number, string>;
}

/** A handler prop that named a function the graph holds. */
interface Resolved {
  kind: 'resolved';
  targetId: string;
  confidence: Confidence;
  rule: InferenceRule;
  /** The expression that justified it. */
  at: Node;
}

/** A handler prop whose meaning is not in this file. */
interface Refused {
  kind: 'refused';
  reason: string;
}

/** A handler prop that names nothing this graph models, and no gap either. */
interface Ignored {
  kind: 'ignored';
}

type HandlerOutcome = Resolved | Refused | Ignored;

function refuse(reason: string): Refused {
  return { kind: 'refused', reason };
}

/**
 * Strips the operators that wrap a call without changing which call it is.
 *
 * `void save()`, `await save()` and `(save())` all run `save`; treating any of
 * them as an opaque expression would lose a handler for the sake of a keyword.
 */
function unwrapCallHost(node: Node): Node {
  let current = unwrapExpression(node);
  for (;;) {
    if (Node.isVoidExpression(current) || Node.isAwaitExpression(current)) {
      current = unwrapExpression(current.getExpression());
      continue;
    }
    return current;
  }
}

/** A function node a handler expression was traced to. */
interface Named {
  kind: 'named';
  id: string;
  confidence: Confidence;
}

type NamedOutcome = Named | Refused | Ignored;

/** The function node a resolved symbol denotes, or why it does not name one. */
function fromTarget(target: SymbolTarget, options: HandlerExtractionOptions): NamedOutcome {
  switch (target.kind) {
    case 'declaration': {
      const id = functionId(target.ref.file, target.ref.name);
      if (!options.nodeIds.has(id)) {
        return refuse('it resolves to a declaration that is not a function in this graph');
      }
      return { kind: 'named', id, confidence: confidenceForVia(target.ref.via) };
    }
    case 'local': {
      if (target.isParameter) {
        return refuse(
          'the handler is a prop of this component, so its value is chosen by whichever parent renders it',
        );
      }
      if (target.isDestructured) {
        return refuse('the handler is destructured out of a value this file does not declare');
      }
      if (!target.isFunction || target.name === undefined) {
        return refuse('the binding it names does not hold a function');
      }
      // The id comes from the declaration the resolver reached, never from its
      // name. A nested handler yields its id to a module-scope function of the
      // same name, and asking whether *some* node holds that id would point the
      // click at the other function.
      const id = options.declarationIds.get(target.declaration.getStart());
      if (id === undefined) {
        return refuse('the function it names is not addressable in this graph');
      }
      return { kind: 'named', id, confidence: CONFIDENCE.DIRECT_SYNTAX };
    }
    // A handler imported from outside the project is not a gap in the graph;
    // there is simply nothing in the application for the edge to point at.
    case 'external':
      return { kind: 'ignored' };
    default:
      return refuse('its callee could not be resolved to a declaration');
  }
}

/** The single call an inline handler body performs, when there is exactly one. */
function dominantCall(fn: Node): { kind: 'call'; call: CallExpression } | Refused {
  if (!Node.isArrowFunction(fn) && !Node.isFunctionExpression(fn)) {
    return refuse('the handler is not a function written in place');
  }

  const parameterNames = new Set<string>();
  for (const parameter of fn.getParameters()) {
    const nameNode = parameter.getNameNode();
    if (Node.isIdentifier(nameNode)) parameterNames.add(nameNode.getText());
  }

  /** `event.preventDefault()` is ceremony, not the action the handler names. */
  const isEventCeremony = (call: CallExpression): boolean => {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return false;
    if (!EVENT_METHODS.has(callee.getName())) return false;
    const object = callee.getExpression();
    return Node.isIdentifier(object) && parameterNames.has(object.getText());
  };

  const body = fn.getBody();
  if (!Node.isBlock(body)) {
    const expression = unwrapCallHost(body);
    if (!Node.isCallExpression(expression)) {
      return refuse('its body is an expression rather than a single call');
    }
    return { kind: 'call', call: expression };
  }

  /** Every call the body makes at its own level, ceremony excluded. */
  const candidates: CallExpression[] = [];
  const consider = (expression: Node | undefined): void => {
    if (expression === undefined) return;
    const call = unwrapCallHost(expression);
    if (!Node.isCallExpression(call)) return;
    if (isEventCeremony(call)) return;
    candidates.push(call);
  };

  for (const statement of body.getStatements()) {
    if (Node.isExpressionStatement(statement) || Node.isReturnStatement(statement)) {
      consider(statement.getExpression());
      continue;
    }
    // A call bound to a name counts too. `const id = openDialog(); track(id);`
    // does two things, and picking the second because the first was assigned to
    // something would attribute the action to the wrong function.
    if (Node.isVariableStatement(statement)) {
      for (const declaration of statement.getDeclarations()) consider(declaration.getInitializer());
    }
  }

  const [only] = candidates;
  if (only === undefined) return refuse('its body performs no call this graph can name');
  if (candidates.length > 1) {
    return refuse('its body performs several calls, so no single one is the handler');
  }
  return { kind: 'call', call: only };
}

/** The callee of a call, resolved to a function node. */
function resolveCallee(
  call: CallExpression,
  options: HandlerExtractionOptions,
): (Named & { at: Node }) | Refused | Ignored {
  const callee = call.getExpression();
  if (Node.isElementAccessExpression(callee)) {
    return refuse('the member it calls is computed at runtime');
  }
  if (Node.isCallExpression(callee)) {
    return refuse('the callee is the result of another call');
  }
  if (!Node.isIdentifier(callee) && !Node.isPropertyAccessExpression(callee)) {
    return refuse('the callee is an expression rather than a name');
  }
  const resolved = fromTarget(
    options.resolver.resolveExpression(options.relativePath, callee),
    options,
  );
  return resolved.kind === 'named' ? { ...resolved, at: callee } : resolved;
}

/** `useCallback(() => …)` — the memo wrapper, when the expression is one. */
function memoisedFunction(call: CallExpression): Node | undefined {
  const callee = call.getExpression();
  const name = Node.isIdentifier(callee)
    ? callee.getText()
    : Node.isPropertyAccessExpression(callee)
      ? callee.getName()
      : undefined;
  if (name === undefined || !MEMO_WRAPPERS.has(name)) return undefined;
  for (const argument of call.getArguments()) {
    if (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument)) return argument;
  }
  return undefined;
}

/**
 * The function a handler prop's value names.
 *
 * `at` is deliberately the expression that carried the proof — the identifier,
 * not the whole attribute — so the Inspector can highlight the exact text a
 * developer would point at when asked why the edge exists.
 */
export function resolveHandlerExpression(
  expression: Node,
  options: HandlerExtractionOptions,
  rule: InferenceRule = 'jsx-handler-identifier',
): HandlerOutcome {
  const value = unwrapExpression(expression);

  // `onClick={actions.createClient}` reads a member off an object, and which
  // function that member holds is decided wherever the object is assembled —
  // possibly in another module, possibly after this line ran. The member may be
  // provable *today*, which is exactly what makes the shape dangerous: the edge
  // would look identical to one that is true by construction.
  if (Node.isPropertyAccessExpression(value)) {
    const target = options.resolver.resolveExpression(options.relativePath, value);
    // A handler from outside the project is not a gap: there is nothing in the
    // application for an edge to point at either way.
    if (target.kind === 'external') return { kind: 'ignored' };
    return refuse(
      'the handler arrives through an object, so which function it holds is decided ' +
        'wherever that object is assembled',
    );
  }

  if (Node.isIdentifier(value)) {
    const target = options.resolver.resolveExpression(options.relativePath, value);
    const resolved = fromTarget(target, options);
    if (resolved.kind === 'named') {
      return {
        kind: 'resolved',
        targetId: resolved.id,
        confidence: resolved.confidence,
        rule,
        at: value,
      };
    }
    // A memoised handler whose name the graph could not claim — two
    // declarations share it — is still readable through its body.
    if (target.kind === 'local') {
      const declaration = target.declaration;
      const initializer = Node.isVariableDeclaration(declaration)
        ? declaration.getInitializer()
        : undefined;
      const memo =
        initializer !== undefined && Node.isCallExpression(initializer)
          ? memoisedFunction(initializer)
          : undefined;
      if (memo !== undefined) return fromInlineFunction(memo, options, rule, true);
    }
    return resolved;
  }

  if (Node.isArrowFunction(value) || Node.isFunctionExpression(value)) {
    return fromInlineFunction(value, options, rule, false);
  }

  if (Node.isCallExpression(value)) {
    const memo = memoisedFunction(value);
    if (memo !== undefined) return fromInlineFunction(memo, options, rule, true);
    return refuse('the prop holds the result of a call rather than a named function');
  }

  if (Node.isElementAccessExpression(value)) {
    return refuse('the member it names is computed at runtime');
  }

  if (Node.isConditionalExpression(value) || Node.isBinaryExpression(value)) {
    return refuse('the prop may hold either of two values, so it names no one function');
  }

  return { kind: 'ignored' };
}

/** Reads an inline function down to the one call it performs. */
function fromInlineFunction(
  fn: Node,
  options: HandlerExtractionOptions,
  rule: InferenceRule,
  memoised: boolean,
): HandlerOutcome {
  const found = dominantCall(fn);
  if (found.kind !== 'call') return found;
  const resolved = resolveCallee(found.call, options);
  if (resolved.kind !== 'named') return resolved;
  return {
    kind: 'resolved',
    targetId: resolved.id,
    // Opening a memo wrapper is one fact more than reading the call, so the
    // edge is an inference even when everything it touched is in this file.
    confidence: memoised ? CONFIDENCE.STATIC_INFERENCE : resolved.confidence,
    rule,
    at: resolved.at,
  };
}

/**
 * `onSubmit={handleSubmit(submitClient)}` — a form library's wrapper.
 *
 * Only accepted when the wrapper itself is *not* a function this project
 * declares. A project function wrapping a handler returns something we cannot
 * read, so `guard(save)` names no handler; a wrapper that came from a hook or a
 * library — `handleSubmit`, `withFormik` — is the recognised react-hook-form
 * shape, and its single function argument is the handler by construction.
 */
function resolveSubmitWrapper(
  call: CallExpression,
  options: HandlerExtractionOptions,
): HandlerOutcome {
  const args = call.getArguments();
  const [only] = args;
  if (args.length !== 1 || only === undefined) {
    return refuse(
      'the wrapper takes more than one argument, so which one is the handler is a guess',
    );
  }

  const callee = call.getExpression();
  if (Node.isIdentifier(callee) || Node.isPropertyAccessExpression(callee)) {
    const wrapper = fromTarget(
      options.resolver.resolveExpression(options.relativePath, callee),
      options,
    );
    if (wrapper.kind === 'named') {
      return refuse(
        'the wrapper is a function this project declares, so what it returns is unknown',
      );
    }
  }

  const inner = resolveHandlerExpression(only, options, 'form-submit-wrapper');
  if (inner.kind !== 'resolved') return inner;
  return { ...inner, confidence: CONFIDENCE.STATIC_INFERENCE, rule: 'form-submit-wrapper' };
}

/** The nearest enclosing component, skipping the handlers declared inside it. */
function findComponentOwner(node: Node, owners: ReadonlyMap<number, string>): string | undefined {
  for (const ancestor of node.getAncestors()) {
    const id = owners.get(ancestor.getStart());
    if (id !== undefined && id.startsWith('component:')) return id;
  }
  return undefined;
}

/** Every handler prop on a tag, in source order, excluding spreads. */
function handlerProps(tag: JsxTagNode): JsxAttribute[] {
  const props: JsxAttribute[] = [];
  for (const attribute of tag.getAttributes()) {
    // A spread carries no prop name, so nothing in it can be recognised as a
    // handler without evaluating the object it spreads.
    if (!Node.isJsxAttribute(attribute)) continue;
    if (!HANDLER_PROP_PATTERN.test(attribute.getNameNode().getText())) continue;
    props.push(attribute);
  }
  return props;
}

/** The expression a JSX attribute holds, when it holds one. */
function attributeExpression(attribute: JsxAttribute): Node | undefined {
  const initializer = attribute.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) return undefined;
  return initializer.getExpression();
}

/** Every provable `invokes` and `submits_to` edge in one file. */
export function extractHandlers(
  sourceFile: SourceFile,
  options: HandlerExtractionOptions,
): ExtractedHandlers {
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];

  const report = (code: IndexerDiagnostic['code'], at: Node, message: string): void => {
    diagnostics.push({
      code,
      severity: 'info',
      message,
      file: options.relativePath,
      line: lineOf(at),
      excerpt: at.getText().replace(/\s+/g, ' ').slice(0, 120),
    });
  };

  for (const tag of getJsxTagNodes(sourceFile)) {
    const elementId = options.elementIdsByTagStart.get(tag.getStart());
    const componentId = findComponentOwner(tag, options.owners);
    const symbol = symbolOfNodeId(componentId ?? findOwnerId(tag, options.owners));
    const isForm = getTagName(tag) === 'form';

    if (isForm) {
      const attribute = getJsxAttribute(tag, 'onSubmit');
      const expression = attribute === undefined ? undefined : attributeExpression(attribute);
      if (attribute !== undefined && expression !== undefined) {
        const value = unwrapExpression(expression);
        let outcome = resolveHandlerExpression(expression, options);
        if (outcome.kind !== 'resolved' && Node.isCallExpression(value)) {
          outcome = resolveSubmitWrapper(value, options);
        }

        if (outcome.kind === 'refused') {
          report(
            'UNSUPPORTED_FORM_PATTERN',
            attribute,
            `This form's submit handler was not traced because ${outcome.reason}.`,
          );
        } else if (outcome.kind === 'resolved') {
          const evidence = inferenceEvidence(
            outcome.at,
            options.relativePath,
            outcome.rule,
            symbol,
          );
          // The element edge answers "where does this form go?"; the component
          // edge keeps a feature path walkable when the form carries no
          // semantic id of its own, which is the common case.
          for (const source of [elementId, componentId]) {
            if (source === undefined || source === outcome.targetId) continue;
            relationships.push(
              createRelationship('submits_to', source, outcome.targetId, outcome.confidence, [
                evidence,
              ]),
            );
          }
        }
      }
    }

    // An element is the only thing a handler edge may leave from: without a
    // semantic id there is nothing a user could have pressed.
    if (elementId === undefined) continue;

    for (const attribute of handlerProps(tag)) {
      if (isForm && attribute.getNameNode().getText() === 'onSubmit') continue;
      const expression = attributeExpression(attribute);
      if (expression === undefined) continue;

      const outcome = resolveHandlerExpression(expression, options);
      if (outcome.kind === 'ignored') continue;
      if (outcome.kind === 'refused') {
        report(
          'UNRESOLVED_DYNAMIC_CALL',
          attribute,
          `This handler prop was not added to the graph because ${outcome.reason}.`,
        );
        continue;
      }
      relationships.push(
        createRelationship('invokes', elementId, outcome.targetId, outcome.confidence, [
          inferenceEvidence(outcome.at, options.relativePath, outcome.rule, symbol),
        ]),
      );
    }
  }

  return { relationships, diagnostics };
}
