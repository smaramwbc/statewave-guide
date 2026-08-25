/**
 * `statewave-guide.config.*` loading.
 *
 * The config decides which files are analysed, which is the one input that can
 * change the graph without the source changing — so it is resolved explicitly,
 * validated by hand against `unknown`, and reported back to the caller by path.
 * A malformed config raises a message a human can act on; it never throws a
 * type error from deep inside the indexer.
 *
 * @packageDocumentation
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ts } from 'ts-morph';
import { toRelativePosix } from './paths.js';

/** User-facing configuration. Every field is optional. */
export interface StatewaveGuideConfig {
  /** Glob patterns of files to analyse. Default: `['src/**\/*.{ts,tsx}']` */
  include?: string[];
  /**
   * Glob patterns to skip. Default:
   * `['**\/*.test.*', '**\/*.spec.*', '**\/*.d.ts', '**\/node_modules/**', '**\/dist/**']`
   */
  exclude?: string[];
  /** Path to the tsconfig to load, relative to the project root. Default: auto-detect `tsconfig.json`. */
  tsconfig?: string;
  /** Directory the graph is written to, relative to the project root. Default: `.statewave-guide` */
  outDir?: string;
}

/** Files analysed when the config says nothing. */
export const DEFAULT_INCLUDE: readonly string[] = ['src/**/*.{ts,tsx}'];

/**
 * Files skipped when the config says nothing.
 *
 * Tests and declaration files describe the code rather than being part of the
 * product, so indexing them would put elements in the graph that no user can
 * reach.
 */
export const DEFAULT_EXCLUDE: readonly string[] = [
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.d.ts',
  '**/node_modules/**',
  '**/dist/**',
];

/** Directory the graph is written to when the config says nothing. */
export const DEFAULT_OUT_DIR = '.statewave-guide';

/** Tsconfig looked for when the config says nothing. */
export const DEFAULT_TSCONFIG = 'tsconfig.json';

/** Config file names, in the order they are looked for. */
export const CONFIG_FILE_NAMES: readonly string[] = [
  'statewave-guide.config.ts',
  'statewave-guide.config.mts',
  'statewave-guide.config.js',
  'statewave-guide.config.mjs',
  'statewave-guide.config.json',
];

/**
 * Identity helper that gives a config file type inference and autocomplete.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@statewavedev/guide-indexer';
 *
 * export default defineConfig({ include: ['app/**\/*.tsx'] });
 * ```
 */
export function defineConfig(config: StatewaveGuideConfig): StatewaveGuideConfig {
  return config;
}

/** The defaults, as a config object. */
export function defaultConfig(): StatewaveGuideConfig {
  return {
    include: [...DEFAULT_INCLUDE],
    exclude: [...DEFAULT_EXCLUDE],
    outDir: DEFAULT_OUT_DIR,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

function readStringArray(value: unknown, label: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${label} must be an array of glob strings.`);
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${label}[${index}] must be a string, received ${describeValue(entry)}.`);
    }
    return entry;
  });
}

function readString(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string, received ${describeValue(value)}.`);
  }
  return value;
}

/**
 * Narrows an arbitrary loaded value to a {@link StatewaveGuideConfig}.
 *
 * Unknown keys are ignored rather than rejected, so a config written for a
 * newer version of the indexer still loads on an older one.
 */
export function parseConfig(value: unknown, source: string): StatewaveGuideConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `${source} must export a configuration object, received ${describeValue(value)}.`,
    );
  }

  const record = value as Record<string, unknown>;
  const include = readStringArray(record.include, `${source}: "include"`);
  const exclude = readStringArray(record.exclude, `${source}: "exclude"`);
  const tsconfig = readString(record.tsconfig, `${source}: "tsconfig"`);
  const outDir = readString(record.outDir, `${source}: "outDir"`);

  return {
    ...(include !== undefined ? { include } : {}),
    ...(exclude !== undefined ? { exclude } : {}),
    ...(tsconfig !== undefined ? { tsconfig } : {}),
    ...(outDir !== undefined ? { outDir } : {}),
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

function readModuleValue(module: unknown): unknown {
  if (typeof module === 'object' && module !== null && 'default' in module) {
    const value = (module as { default: unknown }).default;
    if (value !== undefined) return value;
  }
  return module;
}

/**
 * Renders one compiler diagnostic as a line a human can act on.
 *
 * The compiler's own message says what is wrong but never where, and a config
 * file is the one input that silently changes which files are analysed — so the
 * position is worth the few lines it costs to resolve.
 */
function describeDiagnostic(diagnostic: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;

  const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${message} (line ${line + 1}, column ${character + 1})`;
}

/**
 * Loads a TypeScript config by transpiling it with the compiler ts-morph
 * already bundles, then importing the result.
 *
 * Diagnostics are requested and inspected, because `transpileModule` recovers
 * from syntax errors rather than refusing: `export default { include: [ }`
 * transpiles happily to `export default { include: [] }`, and without this the
 * user's real config would be replaced by a plausible, empty one and the run
 * would report success over zero files.
 *
 * The temporary module is written next to the original rather than into the
 * system temp directory: a config commonly imports `defineConfig` and other
 * project-relative modules, and those specifiers only resolve from the config's
 * own directory. The file is removed in `finally`, so an import that throws
 * still leaves the project clean.
 */
async function importTypeScriptConfig(absolutePath: string): Promise<unknown> {
  const source = await readFile(absolutePath, 'utf8');
  const { outputText, diagnostics } = ts.transpileModule(source, {
    fileName: absolutePath,
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });

  // Only diagnostics that point into the file itself: `transpileModule` also
  // reports on the compiler options we passed, which are ours, not the user's.
  const [failure] = (diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.category === ts.DiagnosticCategory.Error && diagnostic.file !== undefined,
  );
  if (failure !== undefined) {
    throw new Error(
      `${path.basename(absolutePath)} is not valid TypeScript: ${describeDiagnostic(failure)}`,
    );
  }

  const temporaryPath = path.join(
    path.dirname(absolutePath),
    `.statewave-guide.config.${randomUUID()}.mjs`,
  );

  try {
    await writeFile(temporaryPath, outputText, 'utf8');
    return readModuleValue(await import(pathToFileURL(temporaryPath).href));
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function importConfigModule(absolutePath: string): Promise<unknown> {
  const extension = path.extname(absolutePath);

  if (extension === '.json') {
    const source = await readFile(absolutePath, 'utf8');
    try {
      return JSON.parse(source) as unknown;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${path.basename(absolutePath)} is not valid JSON: ${detail}`);
    }
  }

  if (extension === '.ts' || extension === '.mts') {
    return importTypeScriptConfig(absolutePath);
  }

  // A cache-busting query keeps repeated loads in one process honest; the graph
  // never depends on it, so it cannot affect determinism.
  return readModuleValue(await import(`${pathToFileURL(absolutePath).href}?t=${randomUUID()}`));
}

/** What {@link loadConfig} resolved. */
export interface LoadedConfig {
  /** Defaults, with any values from the config file merged over them. */
  config: StatewaveGuideConfig;
  /** Project-relative POSIX path of the config file, when one was found. */
  configPath?: string;
}

/**
 * Finds and loads the project's config, falling back to the defaults.
 *
 * Candidates are tried in {@link CONFIG_FILE_NAMES} order and the first that
 * exists wins; having two config files is a mistake, and picking one
 * deterministically makes that mistake visible rather than intermittent.
 */
export async function loadConfig(projectRoot: string): Promise<LoadedConfig> {
  const root = path.resolve(projectRoot);

  for (const fileName of CONFIG_FILE_NAMES) {
    const absolutePath = path.join(root, fileName);
    if (!existsSync(absolutePath)) continue;

    const loaded = await importConfigModule(absolutePath);
    const configPath = toRelativePosix(root, absolutePath);
    return { config: { ...defaultConfig(), ...parseConfig(loaded, configPath) }, configPath };
  }

  return { config: defaultConfig() };
}
