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

/** The graph contract. */
export type {
  ApplicationGraph,
  ApplicationGraphStats,
  ComponentNode,
  FunctionNode,
  IndexerDiagnostic,
  IndexerDiagnosticCode,
  RouteNode,
  SourceFileNode,
  TypeNode,
  UIElementNode,
} from './graph.js';
