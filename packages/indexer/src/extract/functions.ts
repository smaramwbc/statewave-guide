/**
 * Exported-function extraction.
 *
 * Components are excluded here even though they are also exported functions:
 * they are already in the graph as {@link ComponentNode}s, and listing them
 * twice would let a consumer double-count them or, worse, treat a component as
 * a callable piece of application logic.
 *
 * Only exported declarations are recorded. A module-private helper is an
 * implementation detail, and the graph describes the application's surface.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { FunctionNode } from '../graph.js';
import { nodeProvenance } from '../provenance.js';

/** Exported functions in `sourceFile` that are not already components. */
export function extractFunctions(
  sourceFile: SourceFile,
  relativePath: string,
  componentIds: ReadonlySet<string>,
): FunctionNode[] {
  const functions: FunctionNode[] = [];
  const seen = new Set<string>();

  const add = (name: string, isAsync: boolean, parameterCount: number, declaration: Node): void => {
    const id = `${relativePath}#${name}`;
    if (componentIds.has(id) || seen.has(id)) return;
    seen.add(id);
    functions.push({
      kind: 'function',
      id,
      name,
      exported: true,
      isAsync,
      parameterCount,
      provenance: nodeProvenance(declaration, relativePath, name),
    });
  };

  for (const declaration of sourceFile.getFunctions()) {
    const name = declaration.getName();
    if (name === undefined || !declaration.isExported()) continue;
    add(name, declaration.isAsync(), declaration.getParameters().length, declaration);
  }

  for (const declaration of sourceFile.getVariableDeclarations()) {
    if (!declaration.isExported()) continue;
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    if (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer)) continue;
    add(
      declaration.getName(),
      initializer.isAsync(),
      initializer.getParameters().length,
      declaration,
    );
  }

  return functions;
}
