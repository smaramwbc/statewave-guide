/**
 * `@statewavedev/guide-indexer`
 *
 * Deterministic, syntax-only analysis of a TypeScript application. It reads
 * what the source literally says — semantic element ids, components, routes,
 * exported functions and types — and writes it to
 * `.statewave-guide/application.json`.
 *
 * Nothing here infers business meaning. A description the indexer invented
 * would be indistinguishable in the output from one a human wrote, and the
 * whole value of the graph is that every fact in it is traceable to a line of
 * code.
 *
 * @example
 * ```ts
 * import { createProjectIndexer, writeApplicationGraph } from '@statewavedev/guide-indexer';
 *
 * const { graph } = await createProjectIndexer({ root: '.' }).index();
 * await writeApplicationGraph(graph, { root: '.' });
 * ```
 *
 * @packageDocumentation
 */

/** Creates an indexer for one project. */
export { createProjectIndexer } from './indexer.js';
export type { IndexResult, ProjectIndexer, ProjectIndexerOptions } from './indexer.js';

/** Config authoring and loading. */
export { defineConfig, loadConfig, defaultConfig } from './config.js';
export {
  CONFIG_FILE_NAMES,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  DEFAULT_OUT_DIR,
  DEFAULT_TSCONFIG,
} from './config.js';
export type { LoadedConfig, StatewaveGuideConfig } from './config.js';

/** Writing and serialising the graph. */
export { writeApplicationGraph, GRAPH_FILE_NAME } from './write.js';
export type { WriteGraphOptions, WriteGraphResult } from './write.js';
export { serializeApplicationGraph } from './serialize.js';

export { normaliseApplicationGraph, NODE_KINDS } from './serialize.js';

/** The graph contract. */
export type {
  ApiEndpointNode,
  ApplicationGraph,
  ApplicationGraphStats,
  ApplicationNode,
  ComponentNode,
  FunctionForm,
  FunctionNode,
  GraphHealth,
  HookNode,
  IndexerDiagnostic,
  IndexerDiagnosticCode,
  PermissionNode,
  RouteNode,
  SchemaNode,
  ServiceNode,
  SourceFileNode,
  TypeNode,
  UIElementNode,
} from './graph.js';
export { isNodeOfKind } from './graph.js';

/** Canonical identifiers. */
export {
  HTTP_METHODS,
  apiId,
  componentId,
  elementId,
  fileId,
  functionId,
  hookId,
  normaliseApiPath,
  parseNodeId,
  permissionId,
  routeId,
  schemaId,
  serviceId,
  toHttpMethod,
  typeId,
} from './node-id.js';
export type { ApplicationNodeKind, HttpMethod } from './node-id.js';

/** Relationships and the evidence that justifies them. */
export { RELATIONSHIP_TYPES, createRelationship, relationshipId } from './relationships.js';
export type { Relationship, RelationshipType } from './relationships.js';
export {
  ALLOWED_CONFIDENCE_VALUES,
  CONFIDENCE,
  MAX_EXCERPT_LENGTH,
  toExcerpt,
} from './evidence.js';
export type { Confidence, Evidence, EvidenceType, InferenceRule } from './evidence.js';

/** Traversal over a built graph. */
export { createGraphQuery } from './traversal.js';
export type {
  FeaturePath,
  FeaturePathGap,
  FeaturePathStopReason,
  FindPathOptions,
  GraphQuery,
  PathExplanation,
  PathStep,
  ResolveFeaturePathOptions,
} from './traversal.js';

/** Which half of the application a file belongs to. */
export { classifySide } from './extract/side.js';
export type { ApplicationSide, SideRule } from './extract/side.js';

/** The health report, as lines, for hosts that render it themselves. */
export { formatHealthReport } from './reporter.js';
