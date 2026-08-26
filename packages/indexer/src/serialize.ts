/**
 * Deterministic ordering and serialisation.
 *
 * The graph is meant to be committed and reviewed in a diff, which only works
 * if an unchanged codebase produces unchanged bytes. Two things could break
 * that, and both are handled here rather than being left to the extractors.
 *
 * **Order.** Every array is sorted with a comparator that never consults a
 * locale — `localeCompare` would make the output depend on the machine that
 * produced it.
 *
 * **Key order.** `JSON.stringify` preserves insertion order, so two runs that
 * built the same node by different code paths would serialise to different
 * bytes. {@link normaliseApplicationGraph} rebuilds every object through one
 * literal per shape, which makes key order a property of this file instead of a
 * property of whichever extractor happened to run.
 *
 * @packageDocumentation
 */

import type { ProvenanceReference } from '@statewavedev/guide-shared';
import type { Evidence } from './evidence.js';
import type { ApplicationGraph, ApplicationNode, GraphHealth, IndexerDiagnostic } from './graph.js';
import type { ApplicationNodeKind } from './node-id.js';
import { RELATIONSHIP_TYPES } from './relationships.js';
import type { Relationship } from './relationships.js';

/**
 * Every node kind, in the order stats report them.
 *
 * A fixed list rather than the keys of whatever the graph happens to hold, so
 * `byKind` has the same shape — and therefore the same bytes — for a project
 * with no services as for one with fifty.
 */
export const NODE_KINDS: readonly ApplicationNodeKind[] = [
  'file',
  'route',
  'component',
  'element',
  'function',
  'hook',
  'service',
  'api',
  'schema',
  'permission',
  'type',
];

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

/** Orders provenance records by where they point. */
export function compareProvenance(a: ProvenanceReference, b: ProvenanceReference): number {
  return (
    compareOptionalStrings(a.file, b.file) ||
    compareOptionalNumbers(a.line, b.line) ||
    compareOptionalNumbers(a.column, b.column)
  );
}

/** Orders evidence records by where they point, then by how they were learned. */
export function compareEvidence(a: Evidence, b: Evidence): number {
  return (
    compareStrings(a.file, b.file) ||
    a.line - b.line ||
    compareOptionalNumbers(a.column, b.column) ||
    compareStrings(a.type, b.type) ||
    compareOptionalStrings(a.rule, b.rule)
  );
}

/** Orders diagnostics by code, then by where they were raised. */
export function compareDiagnostics(a: IndexerDiagnostic, b: IndexerDiagnostic): number {
  return (
    compareStrings(a.code, b.code) ||
    compareOptionalStrings(a.file, b.file) ||
    compareOptionalNumbers(a.line, b.line) ||
    compareStrings(a.message, b.message)
  );
}

/** Sorted, de-duplicated copy of a list of ids. */
export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareStrings);
}

// ---------------------------------------------------------------------------
// Key order
// ---------------------------------------------------------------------------

function normaliseProvenance(provenance: ProvenanceReference): ProvenanceReference {
  return {
    source: provenance.source,
    ...(provenance.file !== undefined ? { file: provenance.file } : {}),
    ...(provenance.symbol !== undefined ? { symbol: provenance.symbol } : {}),
    ...(provenance.line !== undefined ? { line: provenance.line } : {}),
    ...(provenance.column !== undefined ? { column: provenance.column } : {}),
  };
}

function normaliseEvidence(evidence: Evidence): Evidence {
  return {
    type: evidence.type,
    file: evidence.file,
    line: evidence.line,
    ...(evidence.column !== undefined ? { column: evidence.column } : {}),
    ...(evidence.symbol !== undefined ? { symbol: evidence.symbol } : {}),
    ...(evidence.excerpt !== undefined ? { excerpt: evidence.excerpt } : {}),
    ...(evidence.rule !== undefined ? { rule: evidence.rule } : {}),
  };
}

function normaliseRelationship(relationship: Relationship): Relationship {
  return {
    id: relationship.id,
    type: relationship.type,
    source: relationship.source,
    target: relationship.target,
    confidence: relationship.confidence,
    evidence: [...relationship.evidence].sort(compareEvidence).map(normaliseEvidence),
  };
}

function normaliseDiagnostic(diagnostic: IndexerDiagnostic): IndexerDiagnostic {
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.file !== undefined ? { file: diagnostic.file } : {}),
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.excerpt !== undefined ? { excerpt: diagnostic.excerpt } : {}),
  };
}

/**
 * Rebuilds a node with the key order this file declares.
 *
 * Written as one branch per kind rather than as a generic key list, because a
 * generic version would silently drop a field added to the contract — and a
 * missing required field is exactly the kind of breakage that only shows up
 * downstream, long after the run that caused it.
 */
export function normaliseNode(node: ApplicationNode): ApplicationNode {
  const provenance = normaliseProvenance(node.provenance);
  switch (node.kind) {
    case 'file':
      return {
        kind: 'file',
        id: node.id,
        path: node.path,
        side: node.side,
        hasJsx: node.hasJsx,
        provenance,
      };
    case 'route':
      return {
        kind: 'route',
        id: node.id,
        path: node.path,
        ...(node.componentName !== undefined ? { componentName: node.componentName } : {}),
        detectedFrom: node.detectedFrom,
        provenance,
      };
    case 'component':
      return {
        kind: 'component',
        id: node.id,
        name: node.name,
        exported: node.exported,
        isDefaultExport: node.isDefaultExport,
        provenance,
      };
    case 'element':
      return {
        kind: 'element',
        id: node.id,
        elementId: node.elementId,
        type: node.type,
        ...(node.label !== undefined ? { label: node.label } : {}),
        attribute: node.attribute,
        tagName: node.tagName,
        ...(node.featureId !== undefined ? { featureId: node.featureId } : {}),
        provenance,
      };
    case 'function':
      return {
        kind: 'function',
        id: node.id,
        name: node.name,
        form: node.form,
        exported: node.exported,
        isAsync: node.isAsync,
        parameterCount: node.parameterCount,
        ...(node.ownerId !== undefined ? { ownerId: node.ownerId } : {}),
        side: node.side,
        provenance,
      };
    case 'hook':
      return { kind: 'hook', id: node.id, name: node.name, builtin: node.builtin, provenance };
    case 'service':
      return {
        kind: 'service',
        id: node.id,
        name: node.name,
        memberIds: sortedUnique(node.memberIds),
        detectedFrom: node.detectedFrom,
        nameSuggestsService: node.nameSuggestsService,
        provenance,
      };
    case 'api':
      return {
        kind: 'api',
        id: node.id,
        method: node.method,
        path: node.path,
        observedOn: [...node.observedOn].sort(compareStrings),
        provenances: [...node.provenances].sort(compareProvenance).map(normaliseProvenance),
        provenance,
      };
    case 'schema':
      return { kind: 'schema', id: node.id, name: node.name, library: node.library, provenance };
    case 'permission':
      return {
        kind: 'permission',
        id: node.id,
        permission: node.permission,
        provenances: [...node.provenances].sort(compareProvenance).map(normaliseProvenance),
        provenance,
      };
    case 'type':
      return {
        kind: 'type',
        id: node.id,
        name: node.name,
        typeKind: node.typeKind,
        exported: node.exported,
        provenance,
      };
  }
}

function normaliseHealth(health: GraphHealth): GraphHealth {
  return {
    resolvedCalls: health.resolvedCalls,
    unresolvedCalls: health.unresolvedCalls,
    resolvedApiPaths: health.resolvedApiPaths,
    unresolvedApiPaths: health.unresolvedApiPaths,
    joinedEndpoints: health.joinedEndpoints,
    frontendOnlyEndpoints: health.frontendOnlyEndpoints,
    backendOnlyEndpoints: health.backendOnlyEndpoints,
    integrity: health.integrity,
    danglingRelationships: [...health.danglingRelationships].sort(compareStrings),
  };
}

/** Sorts and re-keys a whole graph. Pure: the input is not modified. */
export function normaliseApplicationGraph(graph: ApplicationGraph): ApplicationGraph {
  const byKind = {} as Record<ApplicationNodeKind, number>;
  for (const kind of NODE_KINDS) byKind[kind] = graph.stats.byKind[kind] ?? 0;
  const byRelationship = {} as Record<Relationship['type'], number>;
  for (const type of RELATIONSHIP_TYPES)
    byRelationship[type] = graph.stats.byRelationship[type] ?? 0;

  return {
    version: 2,
    ...(graph.application !== undefined ? { application: graph.application } : {}),
    nodes: [...graph.nodes].sort((a, b) => compareStrings(a.id, b.id)).map(normaliseNode),
    relationships: [...graph.relationships]
      .sort((a, b) => compareStrings(a.id, b.id))
      .map(normaliseRelationship),
    stats: {
      nodes: graph.stats.nodes,
      relationships: graph.stats.relationships,
      byKind,
      byRelationship,
    },
    health: normaliseHealth(graph.health),
    diagnostics: [...graph.diagnostics].sort(compareDiagnostics).map(normaliseDiagnostic),
  };
}

/**
 * The exact bytes written to `application.json`.
 *
 * Two-space indentation and a trailing newline, so the file is a well-formed
 * text file that a diff viewer and `git` both handle without complaint.
 */
export function serializeApplicationGraph(graph: ApplicationGraph): string {
  return `${JSON.stringify(normaliseApplicationGraph(graph), null, 2)}\n`;
}
