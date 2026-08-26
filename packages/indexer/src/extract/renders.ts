/**
 * `renders` edges between components.
 *
 * A JSX tag whose name resolves to a component declaration is the most direct
 * evidence the graph can have that one screen shows another. The edge is what
 * lets a route reach a button several components deep, which is the chain
 * `resolveFeaturePath` walks when it answers "where is this element shown?".
 *
 * A tag whose name resolves to nothing in the project — a library component, a
 * lowercase HTML element — produces no edge and no diagnostic. It is not a gap
 * in the graph; it is simply not part of the application being described.
 *
 * @packageDocumentation
 */

import { Node } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import { componentId } from '../node-id.js';
import { createRelationship } from '../relationships.js';
import type { Relationship } from '../relationships.js';
import type { SymbolResolver } from '../resolve/symbols.js';
import { confidenceForVia, viaNeedsRule } from '../resolve/symbols.js';
import { findOwnerId, inferenceEvidence, sourceEvidence, symbolOfNodeId } from './context.js';
import { getJsxTagNodes, getTagName } from './jsx.js';

/** Inputs {@link extractRenders} needs beyond the file itself. */
export interface RenderExtractionOptions {
  relativePath: string;
  resolver: SymbolResolver;
  owners: ReadonlyMap<number, string>;
  nodeIds: ReadonlySet<string>;
}

/** The component node a JSX tag names, when the project declares one. */
export function resolveRenderedComponent(
  tagNameNode: Node,
  options: RenderExtractionOptions,
): { id: string; relationship: (source: string) => Relationship } | undefined {
  if (!Node.isIdentifier(tagNameNode)) return undefined;
  const name = tagNameNode.getText();
  if (!/^[A-Z]/.test(name)) return undefined;

  const target = options.resolver.resolveIdentifier(options.relativePath, name, tagNameNode);
  if (target.kind !== 'declaration') return undefined;

  const id = componentId(target.ref.file, target.ref.name);
  if (!options.nodeIds.has(id)) return undefined;

  const confidence = confidenceForVia(target.ref.via);
  return {
    id,
    relationship: (source: string) => {
      const symbol = symbolOfNodeId(source);
      const evidence = viaNeedsRule(target.ref.via)
        ? [inferenceEvidence(tagNameNode, options.relativePath, 'import-symbol-resolution', symbol)]
        : [sourceEvidence(tagNameNode, options.relativePath, symbol)];
      return createRelationship('renders', source, id, confidence, evidence);
    },
  };
}

/** Every provable `component renders component` edge in one file. */
export function extractRenders(
  sourceFile: SourceFile,
  options: RenderExtractionOptions,
): Relationship[] {
  const relationships: Relationship[] = [];

  for (const tag of getJsxTagNodes(sourceFile)) {
    const name = getTagName(tag);
    if (!/^[A-Z]/.test(name)) continue;

    const ownerId = findOwnerId(tag, options.owners);
    if (ownerId === undefined || !ownerId.startsWith('component:')) continue;

    const resolved = resolveRenderedComponent(tag.getTagNameNode(), options);
    if (!resolved || resolved.id === ownerId) continue;
    relationships.push(resolved.relationship(ownerId));
  }

  return relationships;
}
