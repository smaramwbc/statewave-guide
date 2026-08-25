/**
 * Construction of {@link ProvenanceReference} values with a fixed key order.
 *
 * `JSON.stringify` preserves insertion order, so building every provenance
 * record through one factory is what stops two runs from emitting the same
 * facts with different key ordering.
 *
 * @packageDocumentation
 */

import type { Node } from 'ts-morph';
import type { ProvenanceReference } from '@statewavedev/guide-shared';

/** Inputs for {@link createProvenance}. */
export interface ProvenanceInput {
  /** Project-relative POSIX path. */
  file: string;
  /** Named symbol the fact belongs to, when there is one. */
  symbol?: string;
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  column: number;
}

/**
 * Builds a provenance record with the key order
 * `source, file, symbol?, line, column`.
 *
 * `symbol` is omitted entirely when absent rather than serialised as
 * `undefined`, because `"symbol": undefined` and a missing key are the same
 * value but different bytes.
 */
export function createProvenance(input: ProvenanceInput): ProvenanceReference {
  return {
    source: 'source-code',
    file: input.file,
    ...(input.symbol !== undefined ? { symbol: input.symbol } : {}),
    line: input.line,
    column: input.column,
  };
}

/** Provenance for the position where `node` starts. */
export function nodeProvenance(node: Node, file: string, symbol?: string): ProvenanceReference {
  const { line, column } = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  return createProvenance({ file, symbol, line, column });
}
