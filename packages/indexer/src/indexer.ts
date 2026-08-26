/**
 * The indexer: source files in, application graph out.
 *
 * Four decisions shape this module.
 *
 * 1. **The config owns the file set, not the tsconfig.** A tsconfig's `include`
 *    exists to make the compiler happy; ours exists to say what the product is.
 *    So the tsconfig is loaded for its compiler options and its files are
 *    deliberately skipped.
 * 2. **No type checker.** `skipFileDependencyResolution` keeps ts-morph from
 *    walking imports, so indexing is fast, hermetic, and works on a checkout
 *    whose dependencies were never installed. Every cross-file fact comes from
 *    `resolve/symbols.ts` instead.
 * 3. **Nodes before edges.** Declarations are extracted from every file first,
 *    then relationships. An edge may only point at an id that already exists,
 *    which is what makes the integrity check in {@link GraphHealth} a real check
 *    rather than a restatement of how the graph was built.
 * 4. **Problems are diagnostics, not exceptions.** A missing tsconfig or an
 *    empty file set still produces a valid graph; refusing to emit one would
 *    just move the failure somewhere less informative.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Project, ts } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import {
  DEFAULT_BACKEND,
  DEFAULT_EXCLUDE,
  DEFAULT_INCLUDE,
  DEFAULT_TSCONFIG,
  loadConfig,
} from './config.js';
import type { StatewaveGuideConfig } from './config.js';
import { CONFIDENCE } from './evidence.js';
import type {
  ApiEndpointNode,
  ApplicationGraph,
  ApplicationNode,
  GraphHealth,
  IndexerDiagnostic,
  PermissionNode,
  RouteNode,
  ServiceNode,
} from './graph.js';
import { apiId, parseNodeId, permissionId } from './node-id.js';
import type { ApplicationNodeKind, HttpMethod } from './node-id.js';
import { describeConfiguredPath, describeConfiguredPattern, toRelativePosix } from './paths.js';
import { discoverSourceFiles } from './discover.js';
import { createProvenance } from './provenance.js';
import { RELATIONSHIP_TYPES, createRelationship } from './relationships.js';
import type { Relationship, RelationshipType } from './relationships.js';
import { NODE_KINDS, compareProvenance, compareStrings, sortedUnique } from './serialize.js';
import { buildModuleIndex, compilePathAliases, createSymbolResolver } from './resolve/symbols.js';
import { extractBackendRoutes } from './extract/backend.js';
import { extractCalls } from './extract/calls.js';
import { extractComponents } from './extract/components.js';
import { extractDialogs } from './extract/dialogs.js';
import { sourceEvidence } from './extract/context.js';
import { createElementIdRegistry, extractElements } from './extract/elements.js';
import type { ElementIdRegistry, ExtractedElement } from './extract/elements.js';
import { extractFunctions } from './extract/functions.js';
import { extractHandlers } from './extract/handlers.js';
import { extractHookUsage } from './extract/hooks.js';
import { extractHttpCalls, extractHttpClients } from './extract/http.js';
import type { ApiObservation, HttpClientIndex } from './extract/http.js';
import { containsJsx } from './extract/jsx.js';
import { extractNavigation } from './extract/navigation.js';
import { DEFAULT_HTTP_CLIENTS } from './extract/http.js';
import {
  DEFAULT_PERMISSION_COMPONENTS,
  DEFAULT_PERMISSION_FUNCTIONS,
  extractPermissions,
} from './extract/permissions.js';
import type { PermissionObservation, PermissionRecognisers } from './extract/permissions.js';
import { extractRenders, resolveRenderedComponent } from './extract/renders.js';
import { extractRoutes } from './extract/routes.js';
import { extractSchemaUsage, extractSchemas } from './extract/schemas.js';
import type { ExtractedRoute } from './extract/routes.js';
import { extractServices, memberFunctionId } from './extract/services.js';
import type { ServiceMember } from './extract/services.js';
import { backendPrefix, classifySide } from './extract/side.js';
import type { ApplicationSide } from './extract/side.js';
import { extractTypes } from './extract/types.js';

/** How to index a project. */
export interface ProjectIndexerOptions {
  /** Absolute or relative path to the project to analyse. */
  root: string;
  /** Overrides merged over the file-based config. */
  config?: StatewaveGuideConfig;
}

/** The outcome of one indexing run. */
export interface IndexResult {
  graph: ApplicationGraph;
  /** Project-relative path of the tsconfig that was used, when one was found. */
  tsconfigPath?: string;
  /** Project-relative path of the config file that was used, when one was found. */
  configPath?: string;
}

/** A configured, reusable indexer. */
export interface ProjectIndexer {
  index(): Promise<IndexResult>;
}

/**
 * Re-spells `absolute` with the capitalisation the filesystem itself uses.
 *
 * On a case-insensitive filesystem `…/CaseTest` and `…/casetest` open the same
 * directory, but the glob handed to ts-morph is matched case-sensitively
 * against the real directory entries — so without this the analysed file set
 * would depend on how the invoking path happened to be typed rather than on the
 * source. Symlinks are deliberately left unresolved: the project's own spelling
 * of its root is what every relative id in the graph is measured from.
 *
 * A segment that cannot be corrected — an unreadable parent, a name that
 * matches no entry or several — is kept exactly as given, so this can only ever
 * turn a path that would not have matched into one that does.
 */
function canonicaliseCase(absolute: string): string {
  const parent = path.dirname(absolute);
  const name = path.basename(absolute);
  if (parent === absolute || name.length === 0) return absolute;

  const canonicalParent = canonicaliseCase(parent);
  try {
    const entries = readdirSync(canonicalParent);
    if (entries.includes(name)) return path.join(canonicalParent, name);

    // `toLowerCase` rather than `toLocaleLowerCase`: the Turkish dotless i
    // would otherwise make the file set depend on the machine's locale.
    const lowercased = name.toLowerCase();
    const matches = entries.filter((entry) => entry.toLowerCase() === lowercased);
    const [only] = matches;
    if (matches.length === 1 && only !== undefined) return path.join(canonicalParent, only);
  } catch {
    // An unreadable ancestor only costs us the correction.
  }
  return path.join(canonicalParent, name);
}

/** Reads the analysed project's package name, when it has one. */
function readApplicationName(root: string): string | undefined {
  const packagePath = path.join(root, 'package.json');
  if (!existsSync(packagePath)) return undefined;
  try {
    const parsed: unknown = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed) {
      const name = (parsed as { name: unknown }).name;
      if (typeof name === 'string' && name.length > 0) return name;
    }
  } catch {
    // An unreadable package.json only costs us the application name.
  }
  return undefined;
}

/**
 * Loads the compiler options.
 *
 * A tsconfig that cannot be parsed is the one problem here that cannot be
 * downgraded to a diagnostic — there is no graph to attach it to yet. The
 * compiler's own message says what is wrong but not where, so it is re-thrown
 * naming the file, which is the part the user needs in order to fix it.
 */
function createProject(tsConfigFilePath: string | undefined, tsconfigRelative: string): Project {
  if (tsConfigFilePath !== undefined) {
    try {
      return new Project({
        tsConfigFilePath,
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`"${tsconfigRelative}" could not be read: ${detail}`);
    }
  }
  return new Project({
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      allowJs: false,
      target: ts.ScriptTarget.ES2022,
    },
    skipFileDependencyResolution: true,
  });
}

/** Everything one file contributed, kept for the relationship passes. */
interface FileFacts {
  sourceFile: SourceFile;
  relativePath: string;
  side: ApplicationSide;
  /** Node id of the declaration owning each function-like body. */
  owners: Map<number, string>;
  /** Node id of each function declared in this file, keyed by its start offset. */
  declarationIds: Map<number, string>;
  elements: ExtractedElement[];
  /** Element node id, keyed by the start offset of the JSX tag declaring it. */
  elementIdsByTagStart: Map<number, string>;
  /** Component node id, keyed by the start offset of its function-like body. */
  componentIdsByFunctionStart: Map<number, string>;
}

/**
 * The mutable graph under construction.
 *
 * Nodes are first-wins and relationships merge: two extractors that discover the
 * same edge produce one edge carrying both justifications, never two edges.
 */
interface GraphBuilder {
  nodes: Map<string, ApplicationNode>;
  relationships: Map<string, Relationship>;
  diagnostics: IndexerDiagnostic[];
  apis: Map<
    string,
    {
      method: HttpMethod;
      path: string;
      /** Which side supplied the `path` currently held. */
      pathSide: string;
      sides: Set<string>;
      provenances: ProvenanceList;
    }
  >;
  permissions: Map<string, { permission: string; provenances: ProvenanceList }>;
}

type ProvenanceList = ReturnType<typeof createProvenance>[];

function evidenceKey(evidence: {
  file: string;
  line: number;
  column?: number;
  type: string;
  rule?: string;
}): string {
  return `${evidence.type}|${evidence.file}|${evidence.line}|${evidence.column ?? 0}|${evidence.rule ?? ''}`;
}

function addNode(builder: GraphBuilder, node: ApplicationNode): void {
  if (!builder.nodes.has(node.id)) builder.nodes.set(node.id, node);
}

/**
 * Records an edge, merging it with any identical edge already present.
 *
 * The surviving confidence is the highest of the two: a fact proven twice is at
 * least as certain as its strongest proof, and downgrading it because a weaker
 * rule also matched would misreport what the graph knows.
 */
function addRelationship(builder: GraphBuilder, relationship: Relationship): void {
  const existing = builder.relationships.get(relationship.id);
  if (!existing) {
    builder.relationships.set(relationship.id, relationship);
    return;
  }
  const seen = new Set(existing.evidence.map(evidenceKey));
  for (const evidence of relationship.evidence) {
    const key = evidenceKey(evidence);
    if (seen.has(key)) continue;
    seen.add(key);
    existing.evidence.push(evidence);
  }
  if (relationship.confidence > existing.confidence) existing.confidence = relationship.confidence;
}

/**
 * Which of two spellings of one endpoint's path the node should show.
 *
 * The endpoint's *identity* no longer carries the parameter name, but its
 * `path` still does, and two sightings may name the same parameter differently:
 * `` `/clients/${id}` `` on the client, `/clients/:clientId` on the server. The
 * server wins, because a route's parameter is named where the route is
 * declared and the client is only guessing at it. Between two sightings on the
 * same side the smaller string wins, so the answer is a property of the source
 * rather than of the order the files happened to be read in.
 */
function preferredApiPath(
  current: { path: string; side: string },
  candidate: { path: string; side: string },
): string {
  if (current.side === candidate.side) {
    return compareStrings(candidate.path, current.path) < 0 ? candidate.path : current.path;
  }
  return candidate.side === 'backend' ? candidate.path : current.path;
}

function addApiObservation(builder: GraphBuilder, observation: ApiObservation): void {
  const id = apiId(observation.method, observation.path);
  const existing = builder.apis.get(id);
  if (existing) {
    existing.path = preferredApiPath(
      { path: existing.path, side: existing.pathSide },
      { path: observation.path, side: observation.side },
    );
    if (observation.side === 'backend') existing.pathSide = 'backend';
    existing.sides.add(observation.side);
    existing.provenances.push(observation.provenance);
    return;
  }
  builder.apis.set(id, {
    method: observation.method,
    path: observation.path,
    pathSide: observation.side,
    sides: new Set([observation.side]),
    provenances: [observation.provenance],
  });
}

function addPermissionObservation(builder: GraphBuilder, observation: PermissionObservation): void {
  const id = permissionId(observation.permission);
  const existing = builder.permissions.get(id);
  if (existing) {
    existing.provenances.push(observation.provenance);
    return;
  }
  builder.permissions.set(id, {
    permission: observation.permission,
    provenances: [observation.provenance],
  });
}

/**
 * Routes are declared per file but belong to the application, so the same path
 * may be described twice — once in a JSX router and once in a data router.
 * The first occurrence in sorted-file order wins, which makes the survivor a
 * property of the codebase rather than of traversal order.
 */
function dedupeRoutes(
  routes: readonly { route: ExtractedRoute; file: string }[],
): { route: ExtractedRoute; file: string }[] {
  const seen = new Set<string>();
  const unique: { route: ExtractedRoute; file: string }[] = [];
  for (const entry of routes) {
    const routeNode: RouteNode = entry.route.node;
    if (seen.has(routeNode.path)) continue;
    seen.add(routeNode.path);
    unique.push(entry);
  }
  return unique;
}

/**
 * Drops diagnostics that repeat one already recorded, byte for byte.
 *
 * A route registration can be reached by two paths through the same middleware
 * list, and each emits the same record at the same line. Two identical entries
 * say nothing the first did not, inflate every count in the health report, and
 * leave the sort comparator with a tie it has no key to break — a tie that is
 * harmless only for as long as the two records stay identical.
 */
function uniqueDiagnostics(diagnostics: readonly IndexerDiagnostic[]): IndexerDiagnostic[] {
  const seen = new Set<string>();
  const unique: IndexerDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.code,
      diagnostic.severity,
      diagnostic.file ?? '',
      diagnostic.line ?? 0,
      diagnostic.excerpt ?? '',
      diagnostic.message,
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(diagnostic);
  }
  return unique;
}

function uniqueProvenances(provenances: ProvenanceList): ProvenanceList {
  const byKey = new Map<string, ProvenanceList[number]>();
  for (const provenance of provenances) {
    const key = `${provenance.file ?? ''}|${provenance.line ?? 0}|${provenance.column ?? 0}`;
    if (!byKey.has(key)) byKey.set(key, provenance);
  }
  return [...byKey.values()].sort(compareProvenance);
}

async function runIndex(options: ProjectIndexerOptions): Promise<IndexResult> {
  const root = canonicaliseCase(path.resolve(options.root));
  const loaded = await loadConfig(root);
  const config: StatewaveGuideConfig = { ...loaded.config, ...options.config };

  const include = config.include ?? [...DEFAULT_INCLUDE];
  const exclude = config.exclude ?? [...DEFAULT_EXCLUDE];
  const backendPrefixes = (config.backend ?? [...DEFAULT_BACKEND])
    .map(backendPrefix)
    .filter((prefix): prefix is string => prefix !== undefined);
  const httpClients = config.httpClients ?? [...DEFAULT_HTTP_CLIENTS];
  const recognisers: PermissionRecognisers = {
    functions: config.permissions?.functions ?? [...DEFAULT_PERMISSION_FUNCTIONS],
    components: config.permissions?.components ?? [...DEFAULT_PERMISSION_COMPONENTS],
  };

  const builder: GraphBuilder = {
    nodes: new Map(),
    relationships: new Map(),
    diagnostics: [],
    apis: new Map(),
    permissions: new Map(),
  };

  const tsconfigRelative = config.tsconfig ?? DEFAULT_TSCONFIG;
  const tsconfigAbsolute = path.resolve(root, tsconfigRelative);
  const hasTsconfig = existsSync(tsconfigAbsolute);
  const tsconfigPath = hasTsconfig ? toRelativePosix(root, tsconfigAbsolute) : undefined;

  if (!hasTsconfig) {
    builder.diagnostics.push({
      code: 'MISSING_TSCONFIG',
      severity: 'warning',
      message:
        `No tsconfig found at "${describeConfiguredPath(root, tsconfigRelative)}". ` +
        `Falling back to built-in compiler options; path aliases cannot be resolved.`,
    });
  }

  const project = createProject(
    hasTsconfig ? tsconfigAbsolute : undefined,
    describeConfiguredPath(root, tsconfigRelative),
  );

  // The file set is discovered from the project tree rather than by handing
  // globs to ts-morph, which resolves them against `process.cwd()` and so made
  // the graph a property of the shell the command was typed in.
  const discovered = discoverSourceFiles({ root, include, exclude });
  const sourceFiles = discovered.files
    .map(({ absolutePath, relativePath }) => ({
      sourceFile: project.addSourceFileAtPath(absolutePath),
      relativePath,
    }))
    .sort((a, b) => compareStrings(a.relativePath, b.relativePath));

  for (const index of discovered.outsideIncludes) {
    builder.diagnostics.push({
      code: 'NO_SOURCE_FILES',
      severity: 'warning',
      message:
        `The include pattern at position ${index} names a location outside the project, ` +
        `so it matched nothing.`,
    });
  }

  if (sourceFiles.length === 0) {
    builder.diagnostics.push({
      code: 'NO_SOURCE_FILES',
      severity: 'warning',
      message:
        `No source files matched ` +
        `${JSON.stringify(include.map((pattern) => describeConfiguredPattern(root, pattern)))}. ` +
        `Check "include" and "exclude" in your statewave-guide config.`,
    });
  }

  // -------------------------------------------------------------------------
  // Pass 0 — read every module, so names can be resolved across files.
  // -------------------------------------------------------------------------

  const moduleIndex = buildModuleIndex(sourceFiles);
  const compilerOptions = project.getCompilerOptions();
  const aliasBase =
    compilerOptions.baseUrl ?? (hasTsconfig ? path.dirname(tsconfigAbsolute) : root);
  const resolver = createSymbolResolver(moduleIndex, {
    pathAliases: compilePathAliases(compilerOptions.paths, aliasBase, root, toRelativePosix),
  });

  // -------------------------------------------------------------------------
  // Pass 1 — declarations. Every node the graph will hold, and nothing else.
  // -------------------------------------------------------------------------

  const registry: ElementIdRegistry = createElementIdRegistry();
  const facts: FileFacts[] = [];
  const routeRecords: { route: ExtractedRoute; file: string }[] = [];
  const httpClientIndex: HttpClientIndex = new Map();
  const serviceMembers: {
    file: string;
    owner: string;
    service: ServiceNode;
    members: ServiceMember[];
  }[] = [];

  for (const { sourceFile, relativePath } of sourceFiles) {
    const module = moduleIndex.modules.get(relativePath);
    if (!module) continue;

    const hasJsx = containsJsx(sourceFile);
    const { side } = classifySide({
      file: relativePath,
      hasJsx,
      importedSpecifiers: module.importedSpecifiers,
      backendPrefixes,
    });

    addNode(builder, {
      kind: 'file',
      id: `file:${relativePath}`,
      path: relativePath,
      side,
      hasJsx,
      provenance: createProvenance({ file: relativePath, line: 1, column: 1 }),
    });

    const services = extractServices(sourceFile, relativePath, module);
    for (const service of services.services) addNode(builder, service);

    const components = extractComponents(sourceFile, relativePath);
    const componentIds = new Set(components.map((component) => component.node.id));
    for (const component of components) addNode(builder, component.node);

    const functions = extractFunctions(sourceFile, relativePath, {
      side,
      componentIds,
      module,
      serviceIdByOwner: services.serviceIdByOwner,
    });
    for (const node of functions.functions) addNode(builder, node);
    for (const node of functions.hooks) addNode(builder, node);

    for (const service of services.services) {
      const members = services.membersByOwner.get(service.name) ?? [];
      serviceMembers.push({ file: relativePath, owner: service.name, service, members });
    }

    for (const node of extractTypes(sourceFile, relativePath)) addNode(builder, node);

    for (const node of extractSchemas(sourceFile, { relativePath, resolver })) {
      addNode(builder, node);
    }

    for (const route of extractRoutes(sourceFile, relativePath)) {
      routeRecords.push({ route, file: relativePath });
    }

    for (const [key, client] of extractHttpClients(sourceFile, relativePath, resolver)) {
      httpClientIndex.set(key, client);
    }

    const owners = new Map<number, string>(functions.owners);
    for (const component of components) owners.set(component.functionStart, component.node.id);

    const componentIdsByFunctionStart = new Map(
      components.map((component) => [component.functionStart, component.node.id]),
    );

    const extracted = extractElements(
      sourceFile,
      relativePath,
      { byFunctionStart: componentIdsByFunctionStart },
      registry,
    );
    builder.diagnostics.push(...extracted.diagnostics);

    const elementIdsByTagStart = new Map<number, string>();
    for (const element of extracted.elements) {
      addNode(builder, element.node);
      // A tag repeating an id the graph already holds names the same node but
      // is not the control that node describes, so nothing behavioural is read
      // off it. See `extract/elements.ts` for why.
      if (element.duplicate === true) continue;
      elementIdsByTagStart.set(element.tag.getStart(), element.node.id);
    }

    facts.push({
      sourceFile,
      relativePath,
      side,
      owners,
      declarationIds: functions.declarationIds,
      elements: extracted.elements,
      elementIdsByTagStart,
      componentIdsByFunctionStart,
    });
  }

  // Routes belong to the application, so they are deduplicated globally.
  const routes = dedupeRoutes(routeRecords);
  for (const { route } of routes) addNode(builder, route.node);

  // A service and its members must agree: `memberIds` lists exactly the
  // function nodes whose `ownerId` names the service.
  for (const entry of serviceMembers) {
    const memberIds: string[] = [];
    for (const member of entry.members) {
      const id = memberFunctionId(entry.file, entry.owner, member);
      const node = builder.nodes.get(id);
      if (!node || node.kind !== 'function') continue;
      memberIds.push(id);
      if (node.ownerId === undefined) node.ownerId = entry.service.id;
    }
    entry.service.memberIds = sortedUnique(memberIds);
  }

  const nodeIds = new Set(builder.nodes.keys());
  const routeIds = new Set(
    [...builder.nodes.values()].filter((node) => node.kind === 'route').map((node) => node.id),
  );
  const schemaIds = new Set(
    [...builder.nodes.values()].filter((node) => node.kind === 'schema').map((node) => node.id),
  );
  const hookIds = new Set(
    [...builder.nodes.values()].filter((node) => node.kind === 'hook').map((node) => node.id),
  );
  // The two halves of a hook's dual representation, so `uses_hook` edges can be
  // sourced from the hook node rather than from its function twin.
  const hookIdByFunctionId = new Map<string, string>();
  for (const node of builder.nodes.values()) {
    if (node.kind !== 'hook' || node.builtin) continue;
    const { rest } = parseNodeId(node.id);
    hookIdByFunctionId.set(`function:${rest}`, node.id);
  }
  const serviceIdByFunction = new Map<string, string>();
  for (const node of builder.nodes.values()) {
    if (node.kind === 'function' && node.ownerId !== undefined) {
      serviceIdByFunction.set(node.id, node.ownerId);
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2 — relationships. Everything here may only point at existing nodes.
  // -------------------------------------------------------------------------

  let resolvedCalls = 0;
  let unresolvedCalls = 0;
  let resolvedApiPaths = 0;
  let unresolvedApiPaths = 0;

  for (const file of facts) {
    for (const element of file.elements) {
      if (element.componentId === undefined) continue;
      addRelationship(
        builder,
        createRelationship(
          'contains',
          element.componentId,
          element.node.id,
          CONFIDENCE.DIRECT_SYNTAX,
          [sourceEvidence(element.tag, file.relativePath, element.node.elementId)],
        ),
      );
    }

    for (const relationship of extractRenders(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      nodeIds,
    })) {
      addRelationship(builder, relationship);
    }

    const calls = extractCalls(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      nodeIds,
      declarationIds: file.declarationIds,
      serviceIdByFunction,
    });
    for (const relationship of calls.relationships) addRelationship(builder, relationship);
    builder.diagnostics.push(...calls.diagnostics);
    resolvedCalls += calls.resolvedCalls;
    unresolvedCalls += calls.unresolvedCalls;

    const hooks = extractHookUsage(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      hookIds,
      hookIdByFunctionId,
    });
    for (const node of hooks.hooks) addNode(builder, node);
    for (const relationship of hooks.relationships) addRelationship(builder, relationship);

    const http = extractHttpCalls(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      clients: httpClientIndex,
      httpClients,
    });
    for (const observation of http.observations) addApiObservation(builder, observation);
    for (const relationship of http.relationships) addRelationship(builder, relationship);
    builder.diagnostics.push(...http.diagnostics);
    resolvedApiPaths += http.resolvedApiPaths;
    unresolvedApiPaths += http.unresolvedApiPaths;

    const handlers = extractHandlers(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      nodeIds,
      declarationIds: file.declarationIds,
      elementIdsByTagStart: file.elementIdsByTagStart,
    });
    for (const relationship of handlers.relationships) addRelationship(builder, relationship);
    builder.diagnostics.push(...handlers.diagnostics);

    const dialogs = extractDialogs(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      nodeIds,
      componentIdsByFunctionStart: file.componentIdsByFunctionStart,
    });
    for (const relationship of dialogs.relationships) addRelationship(builder, relationship);
    builder.diagnostics.push(...dialogs.diagnostics);

    const navigation = extractNavigation(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      elementIdsByTagStart: file.elementIdsByTagStart,
      routeIds,
    });
    for (const relationship of navigation.relationships) addRelationship(builder, relationship);
    builder.diagnostics.push(...navigation.diagnostics);

    for (const relationship of extractSchemaUsage(file.sourceFile, {
      relativePath: file.relativePath,
      resolver,
      owners: file.owners,
      schemaIds,
    })) {
      addRelationship(builder, relationship);
    }

    const permissions = extractPermissions(file.sourceFile, {
      relativePath: file.relativePath,
      recognisers,
      owners: file.owners,
      elementIdsByTagStart: file.elementIdsByTagStart,
      readConstant: (node) => resolver.constantString(file.relativePath, node),
    });
    for (const observation of permissions.observations)
      addPermissionObservation(builder, observation);
    for (const relationship of permissions.relationships) addRelationship(builder, relationship);
    builder.diagnostics.push(...permissions.diagnostics);
  }

  // A route renders the component it names, which is what lets a feature path
  // start at a URL and end at a button.
  for (const { route, file } of routes) {
    if (route.componentNode === undefined) continue;
    const resolved = resolveRenderedComponent(route.componentNode, {
      relativePath: file,
      resolver,
      owners: new Map(),
      nodeIds,
    });
    if (!resolved) continue;
    addRelationship(builder, resolved.relationship(route.node.id));
  }

  // -------------------------------------------------------------------------
  // Pass 3 — server routes, which only make sense across the whole project.
  // -------------------------------------------------------------------------

  const backend = extractBackendRoutes(sourceFiles, { resolver, nodeIds, schemaIds, recognisers });
  // Server registrations count towards "API paths resolved" too. Reading only
  // the client half let a backend-only project report 100% in the same breath
  // as it warned about the routes whose mount point it could not read.
  resolvedApiPaths += backend.resolvedApiPaths;
  unresolvedApiPaths += backend.unresolvedApiPaths;
  for (const observation of backend.observations) addApiObservation(builder, observation);
  for (const observation of backend.permissions) addPermissionObservation(builder, observation);
  builder.diagnostics.push(...backend.diagnostics);

  for (const [id, endpoint] of builder.apis) {
    const provenances = uniqueProvenances(endpoint.provenances);
    const first = provenances[0];
    const node: ApiEndpointNode = {
      kind: 'api',
      id,
      method: endpoint.method,
      path: endpoint.path,
      observedOn: [...endpoint.sides].sort(compareStrings) as ('frontend' | 'backend')[],
      provenances,
      provenance: first ?? createProvenance({ file: '', line: 1, column: 1 }),
    };
    addNode(builder, node);
  }

  for (const [id, permission] of builder.permissions) {
    const provenances = uniqueProvenances(permission.provenances);
    const first = provenances[0];
    const node: PermissionNode = {
      kind: 'permission',
      id,
      permission: permission.permission,
      provenances,
      provenance: first ?? createProvenance({ file: '', line: 1, column: 1 }),
    };
    addNode(builder, node);
  }

  // Backend edges point at endpoints, so they are added once those nodes exist.
  for (const relationship of backend.relationships) addRelationship(builder, relationship);

  builder.diagnostics.push(...resolver.diagnostics());

  // -------------------------------------------------------------------------
  // Stats and health.
  // -------------------------------------------------------------------------

  const nodes = [...builder.nodes.values()].sort((a, b) => compareStrings(a.id, b.id));
  const relationships = [...builder.relationships.values()].sort((a, b) =>
    compareStrings(a.id, b.id),
  );

  const byKind = {} as Record<ApplicationNodeKind, number>;
  for (const kind of NODE_KINDS) byKind[kind] = 0;
  for (const node of nodes) byKind[node.kind] += 1;

  const byRelationship = {} as Record<RelationshipType, number>;
  for (const type of RELATIONSHIP_TYPES) byRelationship[type] = 0;
  for (const relationship of relationships) byRelationship[relationship.type] += 1;

  const present = new Set(nodes.map((node) => node.id));
  const dangling = relationships
    .filter(
      (relationship) => !present.has(relationship.source) || !present.has(relationship.target),
    )
    .map((relationship) => relationship.id);

  let joinedEndpoints = 0;
  let frontendOnlyEndpoints = 0;
  let backendOnlyEndpoints = 0;
  for (const node of nodes) {
    if (node.kind !== 'api') continue;
    if (node.observedOn.length > 1) joinedEndpoints += 1;
    else if (node.observedOn[0] === 'frontend') frontendOnlyEndpoints += 1;
    else backendOnlyEndpoints += 1;
  }

  const health: GraphHealth = {
    resolvedCalls,
    unresolvedCalls,
    resolvedApiPaths,
    unresolvedApiPaths,
    joinedEndpoints,
    frontendOnlyEndpoints,
    backendOnlyEndpoints,
    integrity: dangling.length === 0 ? 'PASS' : 'FAIL',
    danglingRelationships: dangling.sort(compareStrings),
  };

  const application = readApplicationName(root);
  const graph: ApplicationGraph = {
    version: 2,
    ...(application !== undefined ? { application } : {}),
    nodes,
    relationships,
    stats: {
      nodes: nodes.length,
      relationships: relationships.length,
      byKind,
      byRelationship,
    },
    health,
    diagnostics: uniqueDiagnostics(builder.diagnostics),
  };

  return {
    graph,
    ...(tsconfigPath !== undefined ? { tsconfigPath } : {}),
    ...(loaded.configPath !== undefined ? { configPath: loaded.configPath } : {}),
  };
}

/**
 * Creates an indexer for one project.
 *
 * @example
 * ```ts
 * const { graph } = await createProjectIndexer({ root: '.' }).index();
 * ```
 */
export function createProjectIndexer(options: ProjectIndexerOptions): ProjectIndexer {
  return {
    index: () => runIndex(options),
  };
}
