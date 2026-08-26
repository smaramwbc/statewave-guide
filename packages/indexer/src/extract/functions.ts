/**
 * Function extraction.
 *
 * Closed Loop #1 recorded only *exported* functions, on the grounds that the
 * graph describes an application's surface. The call graph changes that: a
 * route handler or a click handler is usually module-private, and a call graph
 * that stops at the module boundary answers none of the questions it exists to
 * answer. So every module-scope function is a node now, exported or not.
 *
 * Two representation decisions are worth stating out loud.
 *
 * **A component is not also a function.** A PascalCase function containing JSX
 * is already a {@link ComponentNode}; emitting a second node for it would let a
 * consumer double-count it, or treat a screen as a piece of callable logic.
 *
 * **A hook is both.** `useClients` gets a {@link HookNode} *and* a
 * {@link FunctionNode}, at two different ids. They answer different questions:
 * `uses_hook` edges point at the hook node, because "which components use this
 * hook?" is a question about a React concept, while `calls` edges point at the
 * function node, because a hook is also just a function that other functions
 * call. Collapsing the two would make one of those queries impossible.
 *
 * **A nested function is a node only when its name is unambiguous.** A click
 * handler declared inside a component is exactly what a feature chain needs to
 * point at, but its id would be `function:file#handleSubmit` — the same id a
 * module-scope declaration, or a second component's handler in the same file,
 * would claim. So a nested declaration becomes a node when nothing else in its
 * file shares its name, and is dropped when something does. Two different
 * functions at one address is the one failure this package must never produce,
 * and a missing node is recoverable in a way that a wrong one is not.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { FunctionForm, FunctionNode, HookNode } from '../graph.js';
import { componentId, functionId, hookId } from '../node-id.js';
import { nodeProvenance } from '../provenance.js';
import type { ModuleInfo } from '../resolve/symbols.js';
import type { ApplicationSide } from './side.js';
import { objectMembers } from './services.js';

/** A React hook is a function whose name starts `use` followed by a capital. */
export const HOOK_NAME_PATTERN = /^use[A-Z]/;

/** What one file's functions look like. */
export interface ExtractedFunctions {
  functions: FunctionNode[];
  hooks: HookNode[];
  /**
   * Node id of the declaration owning each function-like body, keyed by that
   * body's start offset. Call sites walk their ancestors through this to find
   * the node a call should be attributed to.
   */
  owners: Map<number, string>;
  /**
   * Node id keyed by the start offset of the *declaration* that earned it.
   *
   * A resolver answers a reference with a declaration node, and the id that
   * declaration would have is not proof that the id belongs to it: a nested
   * `refresh` yields its id to a module-scope `refresh` of the same name, so
   * `function:file#refresh` addresses the module-scope one and a reference to
   * the nested binding must find nothing here rather than find that. This map
   * is the only honest way back from a declaration to its node.
   */
  declarationIds: Map<number, string>;
}

/** Inputs {@link extractFunctions} needs beyond the file itself. */
export interface FunctionExtractionOptions {
  side: ApplicationSide;
  /** Canonical ids of components declared in this file. */
  componentIds: ReadonlySet<string>;
  module: ModuleInfo;
  /** Service node id, keyed by owning binding name. */
  serviceIdByOwner: ReadonlyMap<string, string>;
}

function formOfInitializer(node: Node): FunctionForm {
  if (Node.isArrowFunction(node)) return 'arrow';
  if (Node.isFunctionExpression(node)) return 'expression';
  if (Node.isMethodDeclaration(node)) return 'method';
  return 'declaration';
}

/** One function-like value, however it is written. */
interface FunctionValue {
  form: FunctionForm;
  isAsync: boolean;
  parameterCount: number;
  body: Node;
}

/**
 * The function an initialiser holds, seeing through one wrapper call.
 *
 * `useCallback(() => …)` and `forwardRef(function X() {})` are the same
 * declaration as the bare form as far as the graph is concerned: the memo
 * wrapper changes when the function is rebuilt, not what it is.
 */
function readFunctionValue(initializer: Node | undefined): FunctionValue | undefined {
  if (!initializer) return undefined;
  if (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) {
    return {
      form: formOfInitializer(initializer),
      isAsync: initializer.isAsync(),
      parameterCount: initializer.getParameters().length,
      body: initializer,
    };
  }
  if (!Node.isCallExpression(initializer)) return undefined;
  for (const argument of initializer.getArguments()) {
    if (!Node.isArrowFunction(argument) && !Node.isFunctionExpression(argument)) continue;
    return {
      form: formOfInitializer(argument),
      isAsync: argument.isAsync(),
      parameterCount: argument.getParameters().length,
      body: argument,
    };
  }
  return undefined;
}

/** True when `node` sits inside some other function. */
function isNested(node: Node): boolean {
  return node
    .getAncestors()
    .some(
      (ancestor) => Node.isFunctionLikeDeclaration(ancestor) || Node.isClassDeclaration(ancestor),
    );
}

/** Every function, method and arrow function declared at module scope. */
export function extractFunctions(
  sourceFile: SourceFile,
  relativePath: string,
  options: FunctionExtractionOptions,
): ExtractedFunctions {
  const functions: FunctionNode[] = [];
  const hooks: HookNode[] = [];
  const owners = new Map<number, string>();
  const declarationIds = new Map<number, string>();
  const seen = new Set<string>();

  const add = (
    name: string,
    form: FunctionForm,
    exported: boolean,
    isAsync: boolean,
    parameterCount: number,
    declaration: Node,
    body: Node,
    ownerId?: string,
  ): void => {
    const id = functionId(relativePath, name);
    if (seen.has(id)) return;
    seen.add(id);
    owners.set(body.getStart(), id);
    declarationIds.set(declaration.getStart(), id);
    functions.push({
      kind: 'function',
      id,
      name,
      form,
      exported,
      isAsync,
      parameterCount,
      ...(ownerId !== undefined ? { ownerId } : {}),
      side: options.side,
      provenance: nodeProvenance(declaration, relativePath, name),
    });

    if (HOOK_NAME_PATTERN.test(name)) {
      hooks.push({
        kind: 'hook',
        id: hookId(relativePath, name),
        name,
        builtin: false,
        provenance: nodeProvenance(declaration, relativePath, name),
      });
    }
  };

  // `function createClient() {}` — exported or not.
  for (const declaration of sourceFile.getFunctions()) {
    const name = declaration.getName();
    if (name === undefined) continue;
    if (options.componentIds.has(componentId(relativePath, name))) continue;
    add(
      name,
      'declaration',
      declaration.isExported(),
      declaration.isAsync(),
      declaration.getParameters().length,
      declaration,
      declaration,
    );
  }

  // `const createClient = () => {}` and `const createClient = function () {}`.
  for (const declaration of sourceFile.getVariableDeclarations()) {
    const nameNode = declaration.getNameNode();
    if (!Node.isIdentifier(nameNode)) continue;
    const name = nameNode.getText();
    const initializer = declaration.getInitializer();
    if (!initializer) continue;

    const value = readFunctionValue(initializer);
    if (value) {
      if (options.componentIds.has(componentId(relativePath, name))) continue;
      add(
        name,
        value.form,
        declaration.isExported(),
        value.isAsync,
        value.parameterCount,
        declaration,
        value.body,
      );
      continue;
    }

    // `const clientService = { create() {}, list() {} }` — one node per member,
    // named `owner.member`, whether or not the object is a service.
    if (!Node.isObjectLiteralExpression(initializer)) continue;
    const ownerId = options.serviceIdByOwner.get(name);
    for (const member of objectMembers(initializer, options.module)) {
      if (member.referencesLocal !== undefined) continue;
      add(
        `${name}.${member.member}`,
        member.form,
        declaration.isExported(),
        member.isAsync,
        member.parameterCount,
        member.declaration,
        member.declaration,
        ownerId,
      );
    }
  }

  // `class ClientService { async list() {} }` — one node per method.
  for (const declaration of sourceFile.getClasses()) {
    const className = declaration.getName();
    if (className === undefined) continue;
    const ownerId = options.serviceIdByOwner.get(className);
    for (const method of declaration.getMethods()) {
      add(
        `${className}.${method.getName()}`,
        'method',
        declaration.isExported(),
        method.isAsync(),
        method.getParameters().length,
        method,
        method,
        ownerId,
      );
    }
  }

  addNestedFunctions(sourceFile, relativePath, seen, add);

  return { functions, hooks, owners, declarationIds };
}

/** One nested declaration, before the name-ambiguity test has been applied. */
interface NestedCandidate {
  name: string;
  value: FunctionValue;
  declaration: Node;
}

function readNestedCandidate(node: Node): NestedCandidate | undefined {
  if (Node.isFunctionDeclaration(node)) {
    const name = node.getName();
    if (name === undefined || !isNested(node)) return undefined;
    return {
      name,
      value: {
        form: 'declaration',
        isAsync: node.isAsync(),
        parameterCount: node.getParameters().length,
        body: node,
      },
      declaration: node,
    };
  }

  if (!Node.isVariableDeclaration(node)) return undefined;
  const nameNode = node.getNameNode();
  if (!Node.isIdentifier(nameNode) || !isNested(node)) return undefined;
  const value = readFunctionValue(node.getInitializer());
  return value ? { name: nameNode.getText(), value, declaration: node } : undefined;
}

/**
 * Adds the handlers declared inside components and other functions.
 *
 * A name declared twice in one file is dropped entirely rather than resolved by
 * position: there is exactly one id available and no basis for deciding which
 * declaration deserves it.
 */
function addNestedFunctions(
  sourceFile: SourceFile,
  relativePath: string,
  taken: ReadonlySet<string>,
  add: (
    name: string,
    form: FunctionForm,
    exported: boolean,
    isAsync: boolean,
    parameterCount: number,
    declaration: Node,
    body: Node,
  ) => void,
): void {
  const candidates: NestedCandidate[] = [];
  const counts = new Map<string, number>();

  sourceFile.forEachDescendant((node) => {
    const candidate = readNestedCandidate(node);
    if (!candidate) return;
    candidates.push(candidate);
    counts.set(candidate.name, (counts.get(candidate.name) ?? 0) + 1);
  });

  for (const candidate of candidates) {
    if (counts.get(candidate.name) !== 1) continue;
    // A module-scope declaration owns the id; the nested one yields to it.
    if (taken.has(functionId(relativePath, candidate.name))) continue;
    add(
      candidate.name,
      candidate.value.form,
      false,
      candidate.value.isAsync,
      candidate.value.parameterCount,
      candidate.declaration,
      candidate.value.body,
    );
  }
}
