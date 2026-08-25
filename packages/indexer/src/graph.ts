/**
 * The application graph: every deterministic fact the indexer can prove about
 * a codebase, and nothing else.
 *
 * This module is pure types. It is the contract every other Statewave Guide
 * package reads `application.json` through, so the shapes here are fixed —
 * fields may be added, but nothing existing may change meaning.
 *
 * Two properties are load-bearing:
 *
 * 1. **Provenance everywhere.** Every node carries a
 *    {@link ProvenanceReference} back to the file and line that justified it.
 *    A node without provenance would be a claim nobody can audit.
 * 2. **Determinism.** Nothing here holds a timestamp, an absolute path or a
 *    machine identifier, so two runs over unchanged source serialise to
 *    byte-identical JSON and the graph is reviewable in a diff.
 *
 * @packageDocumentation
 */

import type {
  ProductElementType,
  ProvenanceReference,
  GuideAttribute,
} from '@statewavedev/guide-shared';

/** One analysed source file. */
export interface SourceFileNode {
  kind: 'source-file';
  /** Project-relative POSIX path. Also the node id. */
  id: string;
  path: string;
  hasJsx: boolean;
  componentIds: string[];
  elementIds: string[];
}

/** A React-style component: a PascalCase function that returns JSX. */
export interface ComponentNode {
  kind: 'component';
  /** `${relativePath}#${name}` */
  id: string;
  name: string;
  exported: boolean;
  isDefaultExport: boolean;
  elementIds: string[];
  provenance: ProvenanceReference;
}

/** A semantically addressable UI element, declared by a guide attribute. */
export interface UIElementNode {
  kind: 'ui-element';
  /** The semantic identifier as written in source, e.g. `clients.create`. */
  id: string;
  type: ProductElementType;
  label?: string;
  /** Which attribute declared it. */
  attribute: GuideAttribute;
  /** JSX tag exactly as written, e.g. `button` or `Dialog`. */
  tagName: string;
  /** Id of the enclosing ComponentNode, when it is inside one. */
  componentId?: string;
  /** Inferred namespace of the id (shared `guideElementNamespace`). */
  featureId?: string;
  provenance: ProvenanceReference;
}

/** A statically detectable application route. */
export interface RouteNode {
  kind: 'route';
  /** The route path pattern. Also the node id. */
  id: string;
  path: string;
  /** Component rendered at the route, when statically determinable. */
  componentName?: string;
  /** How the route was detected. */
  detectedFrom: 'jsx-route' | 'router-object';
  provenance: ProvenanceReference;
}

/** An exported function that is not a component. */
export interface FunctionNode {
  kind: 'function';
  /** `${relativePath}#${name}` */
  id: string;
  name: string;
  exported: boolean;
  isAsync: boolean;
  parameterCount: number;
  provenance: ProvenanceReference;
}

/** An exported type declaration. */
export interface TypeNode {
  kind: 'type';
  /** `${relativePath}#${name}` */
  id: string;
  name: string;
  typeKind: 'interface' | 'type-alias' | 'enum';
  exported: boolean;
  provenance: ProvenanceReference;
}

/** Why the indexer could not extract something, or extracted it with doubt. */
export type IndexerDiagnosticCode =
  'invalid-element-id' | 'duplicate-element-id' | 'missing-tsconfig' | 'no-source-files';

/** A single problem observed during indexing. Never thrown, always reported. */
export interface IndexerDiagnostic {
  code: IndexerDiagnosticCode;
  message: string;
  file?: string;
  line?: number;
}

/** Node counts, mirroring the array lengths on {@link ApplicationGraph}. */
export interface ApplicationGraphStats {
  files: number;
  components: number;
  elements: number;
  routes: number;
  functions: number;
  types: number;
}

/**
 * The complete graph, as written to `.statewave-guide/application.json`.
 *
 * Every array is sorted by a stable key, so the document is a reviewable
 * artefact rather than a build output that churns on every run.
 */
export interface ApplicationGraph {
  version: 1;
  /** Name from the analysed package.json, when present. */
  application?: string;
  files: SourceFileNode[];
  components: ComponentNode[];
  elements: UIElementNode[];
  routes: RouteNode[];
  functions: FunctionNode[];
  types: TypeNode[];
  stats: ApplicationGraphStats;
  diagnostics: IndexerDiagnostic[];
}
