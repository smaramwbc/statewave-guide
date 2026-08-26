/**
 * React hook usage.
 *
 * A hook has two nodes in the graph and this module explains why. `useClients`
 * is a {@link FunctionNode} because other functions call it, and a
 * {@link HookNode} because "which components use this hook?" is a different
 * question from "what calls this function?" and deserves an edge type of its
 * own. The two ids never collide: `function:src/hooks/useClients.ts#useClients`
 * and `hook:src/hooks/useClients.ts#useClients`.
 *
 * React's own hooks have no declaration in the project, so they are recorded as
 * `builtin` and addressed by the module they came from —
 * `hook:react#useState`. Using the specifier rather than a file keeps one node
 * per hook however many files import it, and keeps the id free of any path. The
 * name in that id is the one the *package* exports: an aliased import binds
 * `useNavigate` to `useNav` locally, and addressing the node by the local alias
 * would invent a hook `react-router-dom` does not export and split one hook
 * across as many nodes as there are spellings of it.
 *
 * @packageDocumentation
 */

import { Node, SyntaxKind } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import { CONFIDENCE } from '../evidence.js';
import type { HookNode } from '../graph.js';
import { hookId } from '../node-id.js';
import { createProvenance } from '../provenance.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver } from '../resolve/symbols.js';
import { confidenceForVia, viaNeedsRule } from '../resolve/symbols.js';
import { findOwnerId, inferenceEvidence, sourceEvidence, symbolOfNodeId } from './context.js';
import { HOOK_NAME_PATTERN } from './functions.js';

/** What one file's hook usage produced. */
export interface ExtractedHookUsage {
  /** Hook nodes for hooks declared outside the project. */
  hooks: HookNode[];
  relationships: Relationship[];
}

/** Inputs {@link extractHookUsage} needs beyond the file itself. */
export interface HookExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  owners: ReadonlyMap<number, string>;
  /** Hook node ids declared anywhere in the project. */
  hookIds: ReadonlySet<string>;
  /**
   * Hook node id keyed by the function node id of the same declaration.
   *
   * A hook that calls another hook is recorded hook-to-hook: the hook node is
   * what `uses_hook` edges are for, and sourcing the edge from the function
   * half of the pair would split "what uses this hook?" across two ids.
   */
  hookIdByFunctionId: ReadonlyMap<string, string>;
}

/** Every provable `uses_hook` edge in one file. */
export function extractHookUsage(
  sourceFile: SourceFile,
  options: HookExtractionOptions,
): ExtractedHookUsage {
  const hooks: HookNode[] = [];
  const relationships: Relationship[] = [];

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const callee = call.getExpression();
    const name = Node.isIdentifier(callee)
      ? callee.getText()
      : Node.isPropertyAccessExpression(callee)
        ? callee.getName()
        : undefined;
    if (name === undefined || !HOOK_NAME_PATTERN.test(name)) continue;

    const owner = findOwnerId(call, options.owners);
    if (owner === undefined) continue;
    const ownerId = options.hookIdByFunctionId.get(owner) ?? owner;
    const symbol = symbolOfNodeId(ownerId);

    const target = Node.isIdentifier(callee)
      ? options.resolver.resolveIdentifier(options.relativePath, name, callee)
      : options.resolver.resolveExpression(options.relativePath, callee);

    if (target.kind === 'declaration') {
      const id = hookId(target.ref.file, target.ref.name);
      if (!options.hookIds.has(id)) continue;
      const confidence = confidenceForVia(target.ref.via);
      const evidence = viaNeedsRule(target.ref.via)
        ? [inferenceEvidence(callee, options.relativePath, 'import-symbol-resolution', symbol)]
        : [sourceEvidence(callee, options.relativePath, symbol)];
      relationships.push(createRelationship('uses_hook', ownerId, id, confidence, evidence));
      continue;
    }

    if (target.kind !== 'external') continue;

    // The name the *package* exports, not the one this file bound it to.
    // `import { useNavigate as useNav }` would otherwise create
    // `hook:react-router-dom#useNav` — a hook that package does not export —
    // and two files aliasing differently would produce two nodes for one hook.
    const exported =
      target.imported === 'default' || target.imported === '*' ? name : target.imported;
    const id = hookId(target.specifier, exported);
    const { line, column } = call.getSourceFile().getLineAndColumnAtPos(call.getStart());
    hooks.push({
      kind: 'hook',
      id,
      name: exported,
      builtin: true,
      provenance: createProvenance({ file: options.relativePath, symbol: name, line, column }),
    });
    relationships.push(
      createRelationship('uses_hook', ownerId, id, CONFIDENCE.RESOLVED_SYMBOL, [
        inferenceEvidence(callee, options.relativePath, 'import-symbol-resolution', symbol),
      ]),
    );
  }

  return { hooks, relationships };
}
