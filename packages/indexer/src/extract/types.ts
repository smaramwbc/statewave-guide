/**
 * Exported type extraction: interfaces, type aliases and enums.
 *
 * Like functions, only exported declarations are recorded — an unexported
 * interface cannot be referenced from outside its module, so it is not part of
 * the shape the graph describes. `exported` is therefore always `true` today;
 * the field exists so the contract can widen without a breaking change.
 *
 * @packageDocumentation
 */

import type { Node, SourceFile } from 'ts-morph';
import type { TypeNode } from '../graph.js';
import { nodeProvenance } from '../provenance.js';

/** Every exported type declaration in `sourceFile`. */
export function extractTypes(sourceFile: SourceFile, relativePath: string): TypeNode[] {
  const types: TypeNode[] = [];
  const seen = new Set<string>();

  const add = (name: string, typeKind: TypeNode['typeKind'], declaration: Node): void => {
    const id = `${relativePath}#${name}`;
    if (seen.has(id)) return;
    seen.add(id);
    types.push({
      kind: 'type',
      id,
      name,
      typeKind,
      exported: true,
      provenance: nodeProvenance(declaration, relativePath, name),
    });
  };

  for (const declaration of sourceFile.getInterfaces()) {
    if (declaration.isExported()) add(declaration.getName(), 'interface', declaration);
  }
  for (const declaration of sourceFile.getTypeAliases()) {
    if (declaration.isExported()) add(declaration.getName(), 'type-alias', declaration);
  }
  for (const declaration of sourceFile.getEnums()) {
    if (declaration.isExported()) add(declaration.getName(), 'enum', declaration);
  }

  return types;
}
