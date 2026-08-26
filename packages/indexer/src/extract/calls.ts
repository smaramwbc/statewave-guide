/**
 * The call graph.
 *
 * One `calls` edge per call site whose callee can be named. The interesting
 * half of this module is everything it refuses to do.
 *
 * A call is only ever discovered by walking `CallExpression` nodes, which is
 * what makes the string-literal, comment, type-position and JSX-text traps
 * impossible to fall into: none of those ever parse as a call expression, so a
 * function name written in prose cannot become an edge no matter how exactly it
 * matches a declaration.
 *
 * Failure is graded rather than uniform:
 *
 * - a callee that resolves to a project declaration becomes an edge;
 * - a callee that resolves outside the project (`react`, `axios`) or to nothing
 *   we can see (`fetch`, `setTimeout`) is skipped in silence, because a
 *   diagnostic per `console.log` would bury the ones that matter;
 * - a callee whose *shape* defeats resolution — a computed member `api[verb]()`,
 *   a parameter `onSave()`, a value assembled by an expression `getHandler()()`
 *   — becomes an `UNRESOLVED_DYNAMIC_CALL`, because that is a gap a developer
 *   can act on.
 *
 * "A call on a parameter" means the *callee* is the parameter. An unresolvable
 * member call on one — `clients.map(…)`, `value.toUpperCase()` — is in the
 * silent group instead: those are library methods, and one diagnostic per array
 * iteration would drown every gap that describes something real.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { CallExpression, SourceFile } from 'ts-morph';
import type { Confidence, Evidence } from '../evidence.js';
import type { IndexerDiagnostic } from '../graph.js';
import { componentId, functionId } from '../node-id.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { DeclarationRef, SymbolResolver, SymbolTarget } from '../resolve/symbols.js';
import { confidenceForVia, viaNeedsRule } from '../resolve/symbols.js';
import {
  findOwnerId,
  inferenceEvidence,
  lineOf,
  sourceEvidence,
  symbolOfNodeId,
} from './context.js';

/** What one file's call sites produced. */
export interface ExtractedCalls {
  relationships: Relationship[];
  diagnostics: IndexerDiagnostic[];
  /** Call sites that became an edge. */
  resolvedCalls: number;
  /** Call sites that became an `UNRESOLVED_DYNAMIC_CALL`. */
  unresolvedCalls: number;
}

/** Inputs {@link extractCalls} needs beyond the file itself. */
export interface CallExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  /** Node id of the declaration owning each function-like body. */
  owners: ReadonlyMap<number, string>;
  /** Every node id in the graph, so a resolution can be checked to land. */
  nodeIds: ReadonlySet<string>;
  /** Node id of each function declared in this file, keyed by its start offset. */
  declarationIds: ReadonlyMap<number, string>;
  /** Service node id, keyed by the function node id of one of its members. */
  serviceIdByFunction: ReadonlyMap<string, string>;
}

/** The node id a resolved declaration is addressed by, when it has one. */
export function nodeIdForDeclaration(
  ref: DeclarationRef,
  nodeIds: ReadonlySet<string>,
): string | undefined {
  const asFunction = functionId(ref.file, ref.name);
  if (nodeIds.has(asFunction)) return asFunction;
  const asComponent = componentId(ref.file, ref.name);
  if (nodeIds.has(asComponent)) return asComponent;
  return undefined;
}

/**
 * The node id a resolution denotes, preferring the declaration over the name.
 *
 * For anything reached in this file, the declaration-keyed map is the authority:
 * a name may be claimed by a different declaration than the one the resolver
 * arrived at, and building the id from the name would then address that other
 * one. Everything else — an import, a class method reached through `this` — has
 * no entry in the map and falls back to the name, which is unambiguous once the
 * file is known.
 */
function nodeIdForResolution(
  ref: DeclarationRef,
  options: CallExtractionOptions,
): string | undefined {
  if (ref.file === options.relativePath) {
    const byDeclaration = options.declarationIds.get(ref.declaration.getStart());
    if (byDeclaration !== undefined) return byDeclaration;
  }
  return nodeIdForDeclaration(ref, options.nodeIds);
}

/** The evidence and confidence appropriate to how a reference resolved. */
export function evidenceForResolution(
  ref: DeclarationRef,
  node: Node,
  file: string,
  symbol: string | undefined,
): { confidence: Confidence; evidence: Evidence[] } {
  const confidence = confidenceForVia(ref.via);
  const evidence = viaNeedsRule(ref.via)
    ? [inferenceEvidence(node, file, 'import-symbol-resolution', symbol)]
    : [sourceEvidence(node, file, symbol)];
  return { confidence, evidence };
}

/** The class a `this.member()` call sits inside, when there is one. */
function enclosingClassName(node: Node): string | undefined {
  for (const ancestor of node.getAncestors()) {
    if (Node.isClassDeclaration(ancestor)) return ancestor.getName();
  }
  return undefined;
}

/** How a call site was classified. */
type CallOutcome =
  | { kind: 'edge'; ref: DeclarationRef; at: Node }
  | { kind: 'silent' }
  | { kind: 'dynamic'; reason: string };

function classify(call: CallExpression, options: CallExtractionOptions): CallOutcome {
  const { relativePath: file, resolver } = options;
  const callee = call.getExpression();

  if (Node.isElementAccessExpression(callee)) {
    return { kind: 'dynamic', reason: 'the member is computed at runtime' };
  }

  if (Node.isIdentifier(callee)) {
    const target = resolver.resolveIdentifier(file, callee.getText(), callee);
    // A handler declared inside a component is a node when its name was
    // unambiguous within its file. Where it is, calling it is direct syntax.
    //
    // The id is looked up from the declaration the resolver arrived at, never
    // built from its name: a nested `refresh` yields `function:file#refresh` to
    // a module-scope `refresh`, and asking whether *some* node holds that id
    // would attribute the click on a local handler to an exported function that
    // happens to share its name.
    if (target.kind === 'local' && target.isFunction && target.name !== undefined) {
      const id = options.declarationIds.get(target.declaration.getStart());
      if (id !== undefined) {
        return {
          kind: 'edge',
          at: callee,
          ref: {
            file,
            name: target.name,
            kind: 'function',
            via: 'local-declaration',
            declaration: target.declaration,
          },
        };
      }
    }
    return fromTarget(target, callee);
  }

  if (Node.isPropertyAccessExpression(callee)) {
    const object = callee.getExpression();

    if (object.getKind() === SyntaxKind.ThisKeyword) {
      const className = enclosingClassName(call);
      if (className === undefined) return { kind: 'silent' };
      const name = `${className}.${callee.getName()}`;
      if (!options.nodeIds.has(functionId(file, name))) return { kind: 'silent' };
      return {
        kind: 'edge',
        at: callee,
        ref: {
          file,
          name,
          kind: 'function',
          owner: className,
          via: 'local-declaration',
          declaration: callee,
        },
      };
    }

    if (Node.isIdentifier(object)) {
      const target = resolver.resolveMember(file, object.getText(), callee.getName(), callee);
      // A member we cannot name is almost always a library or built-in method —
      // `clients.map(…)`, `response.json()`, `value.toUpperCase()`. Reporting
      // each one as a gap would bury the diagnostics that describe real ones.
      return target.kind === 'declaration'
        ? { kind: 'edge', ref: target.ref, at: callee }
        : { kind: 'silent' };
    }
    // `(await fetch(url)).json()` and friends: the same reasoning applies.
    return { kind: 'silent' };
  }

  if (Node.isCallExpression(callee)) {
    return { kind: 'dynamic', reason: 'the callee is the result of another call' };
  }

  return { kind: 'silent' };
}

function fromTarget(target: SymbolTarget, at: Node): CallOutcome {
  switch (target.kind) {
    case 'declaration':
      return { kind: 'edge', ref: target.ref, at };
    case 'local':
      if (target.isParameter) {
        return { kind: 'dynamic', reason: 'the callee is a parameter' };
      }
      if (target.isFunction) {
        // A function declared inside another function is not a node, by design.
        return { kind: 'silent' };
      }
      if (target.isDestructured) {
        // `const [open, setOpen] = useState(false)` — a member of some other
        // value, wearing a plain name. Same silent group as `response.json()`.
        return { kind: 'silent' };
      }
      return { kind: 'dynamic', reason: 'the callee is a value assembled at runtime' };
    default:
      return { kind: 'silent' };
  }
}

/** Every provable `calls` and `uses_service` edge in one file. */
export function extractCalls(
  sourceFile: SourceFile,
  options: CallExtractionOptions,
): ExtractedCalls {
  const relationships: Relationship[] = [];
  const diagnostics: IndexerDiagnostic[] = [];
  let resolvedCalls = 0;
  let unresolvedCalls = 0;

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const ownerId = findOwnerId(call, options.owners);
    // A call at module scope belongs to no function, so there is nothing for the
    // edge to leave from. Recording it against the file would invent a caller.
    if (ownerId === undefined) continue;

    const outcome = classify(call, options);
    if (outcome.kind === 'silent') continue;

    if (outcome.kind === 'dynamic') {
      unresolvedCalls += 1;
      diagnostics.push({
        code: 'UNRESOLVED_DYNAMIC_CALL',
        severity: 'info',
        message: `This call was not added to the call graph because ${outcome.reason}.`,
        file: options.relativePath,
        line: lineOf(call),
        excerpt: call.getText().replace(/\s+/g, ' ').slice(0, 120),
      });
      continue;
    }

    const targetId = nodeIdForResolution(outcome.ref, options);
    // Resolved, but to something the graph does not model — a plain value, a
    // type, a member of an object we chose not to describe. Not a gap.
    if (targetId === undefined || targetId === ownerId) continue;

    const symbol = symbolOfNodeId(ownerId);
    const { confidence, evidence } = evidenceForResolution(
      outcome.ref,
      outcome.at,
      options.relativePath,
      symbol,
    );
    relationships.push(createRelationship('calls', ownerId, targetId, confidence, evidence));
    resolvedCalls += 1;

    const serviceId = options.serviceIdByFunction.get(targetId);
    if (serviceId !== undefined && serviceId !== ownerId) {
      relationships.push(
        createRelationship('uses_service', ownerId, serviceId, confidence, evidence),
      );
    }
  }

  return { relationships, diagnostics, resolvedCalls, unresolvedCalls };
}
