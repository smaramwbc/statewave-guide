/**
 * Shared plumbing for the relationship extractors.
 *
 * Every edge in the graph is built the same way — find the node the syntax
 * belongs to, build an evidence record from the exact expression that justified
 * it — so both halves live here rather than being re-implemented, subtly
 * differently, in five extractors.
 *
 * @packageDocumentation
 */

import type { Node } from 'ts-morph';
import type { Evidence, InferenceRule } from '../evidence.js';
import { toExcerpt } from '../evidence.js';
import { parseNodeId } from '../node-id.js';

/** The declared name inside a canonical id, e.g. `Clients` in a component id. */
export function symbolOfNodeId(id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  const { rest } = parseNodeId(id);
  const separator = rest.lastIndexOf('#');
  return separator === -1 ? undefined : rest.slice(separator + 1);
}

/**
 * The node id of the declaration a piece of syntax sits inside.
 *
 * Walks outwards and takes the first hit, so a call inside a nested arrow
 * function is attributed to the enclosing component rather than to nothing.
 */
export function findOwnerId(node: Node, owners: ReadonlyMap<number, string>): string | undefined {
  for (const ancestor of node.getAncestors()) {
    const id = owners.get(ancestor.getStart());
    if (id !== undefined) return id;
  }
  return undefined;
}

/** A `source` evidence record for the exact expression `node`. */
export function sourceEvidence(node: Node, file: string, symbol?: string): Evidence {
  const { line, column } = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    type: 'source',
    file,
    line,
    column,
    ...(symbol !== undefined ? { symbol } : {}),
    excerpt: toExcerpt(node.getText()),
  };
}

/** A `static-inference` evidence record naming the rule that produced it. */
export function inferenceEvidence(
  node: Node,
  file: string,
  rule: InferenceRule,
  symbol?: string,
): Evidence {
  const { line, column } = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return {
    type: 'static-inference',
    file,
    line,
    column,
    ...(symbol !== undefined ? { symbol } : {}),
    excerpt: toExcerpt(node.getText()),
    rule,
  };
}

/** 1-based line of a node, for diagnostics. */
export function lineOf(node: Node): number {
  return node.getSourceFile().getLineAndColumnAtPos(node.getStart()).line;
}
