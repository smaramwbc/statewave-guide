/**
 * Deterministic ordering and serialisation.
 *
 * The graph is meant to be committed and reviewed in a diff, which only works
 * if an unchanged codebase produces unchanged bytes. Sorting happens here, in
 * one place, with comparators that never consult a locale — `localeCompare`
 * would make the output depend on the machine that produced it.
 *
 * @packageDocumentation
 */

import type { ProvenanceReference } from '@statewavedev/guide-shared';
import type {
  ApplicationGraph,
  ComponentNode,
  FunctionNode,
  IndexerDiagnostic,
  RouteNode,
  SourceFileNode,
  TypeNode,
  UIElementNode,
} from './graph.js';

/** Code-unit string comparison. Locale-independent by construction. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Compares optional strings, sorting absent values last. */
function compareOptionalStrings(a: string | undefined, b: string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return compareStrings(a, b);
}

/** Compares optional numbers, sorting absent values last. */
function compareOptionalNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

function compareProvenance(a: ProvenanceReference, b: ProvenanceReference): number {
  return (
    compareOptionalStrings(a.file, b.file) ||
    compareOptionalNumbers(a.line, b.line) ||
    compareOptionalNumbers(a.column, b.column)
  );
}

function byId<T extends { id: string }>(a: T, b: T): number {
  return compareStrings(a.id, b.id);
}

/**
 * Elements are the only nodes whose id is not unique — the same semantic id may
 * legitimately appear in two places — so they need provenance as a tiebreak.
 */
function compareElements(a: UIElementNode, b: UIElementNode): number {
  return compareStrings(a.id, b.id) || compareProvenance(a.provenance, b.provenance);
}

function compareRoutes(a: RouteNode, b: RouteNode): number {
  return compareStrings(a.path, b.path);
}

function compareDiagnostics(a: IndexerDiagnostic, b: IndexerDiagnostic): number {
  return (
    compareStrings(a.code, b.code) ||
    compareOptionalStrings(a.file, b.file) ||
    compareOptionalNumbers(a.line, b.line) ||
    compareStrings(a.message, b.message)
  );
}

/** Every array the graph holds, sorted. Mutates and returns its inputs. */
export function sortGraphParts(parts: {
  files: SourceFileNode[];
  components: ComponentNode[];
  elements: UIElementNode[];
  routes: RouteNode[];
  functions: FunctionNode[];
  types: TypeNode[];
  diagnostics: IndexerDiagnostic[];
}): void {
  parts.files.sort(byId);
  parts.components.sort(byId);
  parts.elements.sort(compareElements);
  parts.routes.sort(compareRoutes);
  parts.functions.sort(byId);
  parts.types.sort(byId);
  parts.diagnostics.sort(compareDiagnostics);
}

/** Sorted, de-duplicated copy of a list of ids. */
export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

/**
 * The exact bytes written to `application.json`.
 *
 * Two-space indentation and a trailing newline, so the file is a well-formed
 * text file that a diff viewer and `git` both handle without complaint.
 */
export function serializeApplicationGraph(graph: ApplicationGraph): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}
