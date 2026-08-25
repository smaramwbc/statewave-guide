/**
 * Component extraction.
 *
 * A component is recognised structurally — a PascalCase function containing
 * JSX — rather than by importing React or consulting the type checker. That
 * keeps the rule honest across React, Preact, Solid and any other library that
 * shares the convention, and it keeps the indexer working on a checkout whose
 * `node_modules` is empty.
 *
 * Only top-level declarations are considered. A component defined inside
 * another function is an implementation detail of its parent, and hoisting it
 * into the graph would give it an id that no import could ever resolve.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import type { ComponentNode } from '../graph.js';
import { nodeProvenance } from '../provenance.js';
import { containsJsx } from './jsx.js';

/** A component plus the syntax position used to attribute nested elements. */
export interface ExtractedComponent {
  node: ComponentNode;
  /**
   * Start offset of the function-like node that forms the component body.
   * Elements look this up while walking their ancestors, which is cheaper and
   * more robust than comparing wrapped node identities.
   */
  functionStart: number;
}

function isPascalCase(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/** Every component declared at the top level of `sourceFile`. */
export function extractComponents(
  sourceFile: SourceFile,
  relativePath: string,
): ExtractedComponent[] {
  const components: ExtractedComponent[] = [];
  const seen = new Set<string>();

  const add = (
    name: string,
    exported: boolean,
    isDefaultExport: boolean,
    declaration: Node,
    body: Node,
  ): void => {
    if (!isPascalCase(name) || !containsJsx(body)) return;
    const id = `${relativePath}#${name}`;
    if (seen.has(id)) return;
    seen.add(id);
    components.push({
      node: {
        kind: 'component',
        id,
        name,
        exported,
        isDefaultExport,
        elementIds: [],
        provenance: nodeProvenance(declaration, relativePath, name),
      },
      functionStart: body.getStart(),
    });
  };

  // `function Clients() { … }` and `export default function Dashboard() { … }`
  for (const declaration of sourceFile.getFunctions()) {
    const name = declaration.getName();
    if (name === undefined) continue;
    add(name, declaration.isExported(), declaration.isDefaultExport(), declaration, declaration);
  }

  // `const Clients = () => …` and `const Settings = function () { … }`
  for (const declaration of sourceFile.getVariableDeclarations()) {
    const initializer = declaration.getInitializer();
    if (!initializer) continue;
    if (!Node.isArrowFunction(initializer) && !Node.isFunctionExpression(initializer)) continue;
    add(
      declaration.getName(),
      declaration.isExported(),
      declaration.isDefaultExport(),
      declaration,
      initializer,
    );
  }

  return components;
}
