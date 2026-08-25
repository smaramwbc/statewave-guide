/**
 * The indexer: source files in, application graph out.
 *
 * Three decisions shape this module.
 *
 * 1. **The config owns the file set, not the tsconfig.** A tsconfig's `include`
 *    exists to make the compiler happy; ours exists to say what the product is.
 *    So the tsconfig is loaded for its compiler options and its files are
 *    deliberately skipped.
 * 2. **No type checker.** `skipFileDependencyResolution` keeps ts-morph from
 *    walking imports, so indexing is fast, hermetic, and works on a checkout
 *    whose dependencies were never installed.
 * 3. **Problems are diagnostics, not exceptions.** A missing tsconfig or an
 *    empty file set still produces a valid graph; refusing to emit one would
 *    just move the failure somewhere less informative.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Project, ts } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import { DEFAULT_EXCLUDE, DEFAULT_INCLUDE, DEFAULT_TSCONFIG, loadConfig } from './config.js';
import type { StatewaveGuideConfig } from './config.js';
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
import { globPrefix, joinGlob, toPosixPath, toRelativePosix } from './paths.js';
import { compareStrings, sortGraphParts, sortedUnique } from './serialize.js';
import { extractComponents } from './extract/components.js';
import { createElementIdRegistry, extractElements } from './extract/elements.js';
import type { ElementIdRegistry } from './extract/elements.js';
import { extractFunctions } from './extract/functions.js';
import { extractRoutes } from './extract/routes.js';
import { extractTypes } from './extract/types.js';
import { containsJsx } from './extract/jsx.js';

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
 * Builds the glob list handed to ts-morph.
 *
 * Excludes are expressed as negated globs rather than as a post-hoc filter, so
 * ts-morph never parses a file we are going to throw away.
 *
 * `process.cwd()` is read here and nowhere else. ts-morph resolves globs
 * against it, so {@link globPrefix} has to know it in order to cancel it out;
 * the patterns it produces denote `root` no matter what it happens to be, and
 * the file set stays a property of the project rather than of the shell.
 */
function buildGlobs(
  root: string,
  include: readonly string[],
  exclude: readonly string[],
): string[] {
  const prefix = globPrefix(root, process.cwd());
  return [
    ...include.map((pattern) => joinGlob(prefix, pattern)),
    ...exclude.map((pattern) => `!${joinGlob(prefix, pattern)}`),
  ];
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
      throw new Error(`"${toPosixPath(tsconfigRelative)}" could not be read: ${detail}`);
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

interface GraphParts {
  files: SourceFileNode[];
  components: ComponentNode[];
  elements: UIElementNode[];
  routes: RouteNode[];
  functions: FunctionNode[];
  types: TypeNode[];
  diagnostics: IndexerDiagnostic[];
}

function indexSourceFile(
  sourceFile: SourceFile,
  relativePath: string,
  parts: GraphParts,
  registry: ElementIdRegistry,
): void {
  const components = extractComponents(sourceFile, relativePath);
  const componentIds = new Set(components.map((component) => component.node.id));
  const byFunctionStart = new Map(
    components.map((component) => [component.functionStart, component.node.id] as const),
  );

  const extracted = extractElements(sourceFile, relativePath, { byFunctionStart }, registry);
  const functions = extractFunctions(sourceFile, relativePath, componentIds);
  const types = extractTypes(sourceFile, relativePath);
  const routes = extractRoutes(sourceFile, relativePath);

  const elementIdsByComponent = new Map<string, string[]>();
  for (const element of extracted.elements) {
    if (element.componentId === undefined) continue;
    const bucket = elementIdsByComponent.get(element.componentId) ?? [];
    bucket.push(element.id);
    elementIdsByComponent.set(element.componentId, bucket);
  }

  for (const component of components) {
    component.node.elementIds = sortedUnique(elementIdsByComponent.get(component.node.id) ?? []);
    parts.components.push(component.node);
  }

  parts.files.push({
    kind: 'source-file',
    id: relativePath,
    path: relativePath,
    hasJsx: containsJsx(sourceFile),
    componentIds: sortedUnique([...componentIds]),
    elementIds: sortedUnique(extracted.elements.map((element) => element.id)),
  });

  parts.elements.push(...extracted.elements);
  parts.diagnostics.push(...extracted.diagnostics);
  parts.functions.push(...functions);
  parts.types.push(...types);
  parts.routes.push(...routes);
}

/**
 * Routes are declared per file but belong to the application, so the same path
 * may be described twice — once in a JSX router and once in a data router.
 * The first occurrence in sorted-file order wins, which makes the survivor a
 * property of the codebase rather than of traversal order.
 */
function dedupeRoutes(routes: readonly RouteNode[]): RouteNode[] {
  const seen = new Set<string>();
  const unique: RouteNode[] = [];
  for (const route of routes) {
    if (seen.has(route.path)) continue;
    seen.add(route.path);
    unique.push(route);
  }
  return unique;
}

async function runIndex(options: ProjectIndexerOptions): Promise<IndexResult> {
  const root = canonicaliseCase(path.resolve(options.root));
  const loaded = await loadConfig(root);
  const config: StatewaveGuideConfig = { ...loaded.config, ...options.config };

  const include = config.include ?? [...DEFAULT_INCLUDE];
  const exclude = config.exclude ?? [...DEFAULT_EXCLUDE];

  const parts: GraphParts = {
    files: [],
    components: [],
    elements: [],
    routes: [],
    functions: [],
    types: [],
    diagnostics: [],
  };

  const tsconfigRelative = config.tsconfig ?? DEFAULT_TSCONFIG;
  const tsconfigAbsolute = path.resolve(root, tsconfigRelative);
  const hasTsconfig = existsSync(tsconfigAbsolute);
  const tsconfigPath = hasTsconfig ? toRelativePosix(root, tsconfigAbsolute) : undefined;

  if (!hasTsconfig) {
    parts.diagnostics.push({
      code: 'missing-tsconfig',
      message:
        `No tsconfig found at "${toPosixPath(tsconfigRelative)}". ` +
        `Falling back to built-in compiler options; results are unaffected for syntax-only analysis.`,
    });
  }

  const project = createProject(hasTsconfig ? tsconfigAbsolute : undefined, tsconfigRelative);
  project.addSourceFilesAtPaths(buildGlobs(root, include, exclude));

  const sourceFiles = project
    .getSourceFiles()
    .map((sourceFile) => ({
      sourceFile,
      relativePath: toRelativePosix(root, sourceFile.getFilePath()),
    }))
    .sort((a, b) => compareStrings(a.relativePath, b.relativePath));

  if (sourceFiles.length === 0) {
    parts.diagnostics.push({
      code: 'no-source-files',
      message:
        `No source files matched ${JSON.stringify(include)}. ` +
        `Check "include" and "exclude" in your statewave-guide config.`,
    });
  }

  const registry = createElementIdRegistry();
  for (const { sourceFile, relativePath } of sourceFiles) {
    indexSourceFile(sourceFile, relativePath, parts, registry);
  }

  parts.routes = dedupeRoutes(parts.routes);
  sortGraphParts(parts);

  const application = readApplicationName(root);
  const graph: ApplicationGraph = {
    version: 1,
    ...(application !== undefined ? { application } : {}),
    files: parts.files,
    components: parts.components,
    elements: parts.elements,
    routes: parts.routes,
    functions: parts.functions,
    types: parts.types,
    stats: {
      files: parts.files.length,
      components: parts.components.length,
      elements: parts.elements.length,
      routes: parts.routes.length,
      functions: parts.functions.length,
      types: parts.types.length,
    },
    diagnostics: parts.diagnostics,
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
