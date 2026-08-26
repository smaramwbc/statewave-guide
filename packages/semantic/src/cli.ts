/**
 * `statewave-guide-semantic` — the command-line entry point.
 *
 * Two subcommands, one rule between them:
 *
 * - `enrich` turns `.statewave-guide/application.json` into
 *   `.statewave-guide/product.json`, verifying everything a model says on the
 *   way.
 * - `docs` projects Markdown out of `product.json`. It never calls a model, and
 *   it never can — ADR 0008 puts Markdown below the Product Model in the chain
 *   of authority, and a docs command that could reach a provider would be a
 *   second source of product truth.
 *
 * ## Provider-free is the default, and it succeeds
 *
 * Run `enrich` with no `--provider` and the graph is loaded, the skip is stated
 * plainly, and the process exits **0**. That is the contract, not a convenience:
 * indexing and inspection never require AI, and a team that never configures a
 * provider should still get the deterministic half of this system working end to
 * end. Failing — or warning, or half-generating — would quietly make the
 * optional half mandatory.
 *
 * The only provider that ships here is the deterministic mock, because no vendor
 * adapter exists in this package by design (see `./providers/mock.ts`). An
 * application with real credentials passes its own {@link SemanticModelProvider}
 * to {@link enrichApplicationGraph} rather than to this binary.
 *
 * The shebang is added by tsup at build time, so it must not appear here — the
 * library entry has to stay importable.
 *
 * @packageDocumentation
 */

import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeDocs } from './docs.js';
import { enrichApplicationGraph } from './enrich.js';
import {
  applicationGraphPath,
  productModelPath,
  readApplicationGraph,
  readProductModel,
  serializeProductModel,
  writeProductModel,
} from './product-file.js';
import type { SemanticModelProvider } from './provider.js';
import { createMockProvider } from './providers/mock.js';
import type { CliIo } from './reporter.js';
import {
  PROVIDER_FREE_REPORT,
  createConsoleIo,
  createSilentIo,
  formatDocsReport,
  formatEnrichmentReport,
  formatOpportunityReport,
  formatWritten,
  reportError,
  reportWarning,
} from './reporter.js';

/** Providers this binary can construct on its own. */
const BUILT_IN_PROVIDERS = ['mock'] as const;
type BuiltInProvider = (typeof BUILT_IN_PROVIDERS)[number];

/** A fully parsed command line. */
export type ParsedArgs =
  | {
      kind: 'enrich';
      directory: string;
      outDir?: string;
      docsDir?: string;
      provider?: BuiltInProvider;
      limit?: number;
      /** Also project Markdown once the model is written. */
      docs: boolean;
      json: boolean;
      silent: boolean;
    }
  | { kind: 'docs'; directory: string; outDir?: string; docsDir?: string; silent: boolean }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

const HELP: readonly string[] = [
  'statewave-guide-semantic — verified semantic enrichment',
  '',
  'Usage',
  '  statewave-guide-semantic <command> [directory] [options]',
  '',
  'Commands',
  '  enrich [directory]   Verify semantics over the application graph and write product.json',
  '  docs   [directory]   Project Markdown from product.json',
  '',
  'Options',
  '  --out <dir>        Directory holding the graph and the model (default: .statewave-guide)',
  '  --docs-dir <dir>   Directory Markdown is written to (default: docs)',
  '  --provider <name>  Model provider. Only "mock" is built in.',
  '                     Omit it to run provider-free: the graph is loaded and enrichment is skipped.',
  '  --limit <n>        Maximum feature candidates to enrich',
  '  --docs             After enriching, also project Markdown',
  '  --json             Print product.json to stdout instead of writing it',
  '  --silent           Suppress reports. Failures are still printed.',
  '  --version          Print the package version',
  '  --help             Show this message',
  '',
  'Examples',
  '  statewave-guide-semantic enrich .',
  '  statewave-guide-semantic enrich . --provider mock --docs',
  '  statewave-guide-semantic docs .',
];

/** Reads the value of `--flag value` or `--flag=value`. */
interface FlagRead {
  value?: string;
  consumed: number;
  error?: string;
}

function readFlag(args: readonly string[], index: number, name: string, hint: string): FlagRead {
  const arg = args[index] ?? '';
  if (arg.startsWith(`${name}=`)) {
    const value = arg.slice(name.length + 1);
    if (value === '') return { consumed: 1, error: `${name} requires a value, e.g. ${hint}` };
    return { value, consumed: 1 };
  }
  const next = args[index + 1];
  if (next === undefined || next.startsWith('-')) {
    return { consumed: 1, error: `${name} requires a value, e.g. ${hint}` };
  }
  return { value: next, consumed: 2 };
}

/**
 * Parses argv.
 *
 * The subcommand is optional and defaults to `enrich`, so
 * `npx @statewavedev/guide-semantic .` reads naturally while
 * `statewave-guide-semantic docs .` still works. A directory that happens to be
 * named `docs` is the one ambiguity, and it resolves in favour of the
 * subcommand — which is why `--help` documents the explicit form first.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const first = argv[0];
  const isDocs = first === 'docs';
  const args = first === 'enrich' || isDocs ? argv.slice(1) : [...argv];

  let directory: string | undefined;
  let outDir: string | undefined;
  let docsDir: string | undefined;
  let provider: BuiltInProvider | undefined;
  let limit: number | undefined;
  let docs = false;
  let json = false;
  let silent = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    /* c8 ignore next -- `index` never runs past the array. */
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-v') return { kind: 'version' };
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--docs') {
      docs = true;
      continue;
    }
    if (arg === '--silent') {
      silent = true;
      continue;
    }
    if (arg === '--out' || arg.startsWith('--out=')) {
      const read = readFlag(args, index, '--out', '--out .statewave-guide');
      if (read.error !== undefined) return { kind: 'error', message: read.error };
      outDir = read.value;
      index += read.consumed - 1;
      continue;
    }
    if (arg === '--docs-dir' || arg.startsWith('--docs-dir=')) {
      const read = readFlag(args, index, '--docs-dir', '--docs-dir docs');
      if (read.error !== undefined) return { kind: 'error', message: read.error };
      docsDir = read.value;
      index += read.consumed - 1;
      continue;
    }
    if (arg === '--provider' || arg.startsWith('--provider=')) {
      const read = readFlag(args, index, '--provider', '--provider mock');
      if (read.error !== undefined) return { kind: 'error', message: read.error };
      const value = read.value ?? '';
      if (!(BUILT_IN_PROVIDERS as readonly string[]).includes(value)) {
        return {
          kind: 'error',
          message:
            `Unknown provider "${value}". This binary can construct only: ${BUILT_IN_PROVIDERS.join(', ')}. ` +
            'Pass your own provider to enrichApplicationGraph() instead.',
        };
      }
      provider = value as BuiltInProvider;
      index += read.consumed - 1;
      continue;
    }
    if (arg === '--limit' || arg.startsWith('--limit=')) {
      const read = readFlag(args, index, '--limit', '--limit 50');
      if (read.error !== undefined) return { kind: 'error', message: read.error };
      const parsed = Number(read.value);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return {
          kind: 'error',
          message: `--limit requires a non-negative whole number, not "${read.value ?? ''}".`,
        };
      }
      limit = parsed;
      index += read.consumed - 1;
      continue;
    }
    if (arg.startsWith('-')) {
      return {
        kind: 'error',
        message: `Unknown option "${arg}". Run "statewave-guide-semantic --help" to see the available options.`,
      };
    }
    if (directory !== undefined) {
      return {
        kind: 'error',
        message: `Unexpected argument "${arg}". Only one directory can be analysed at a time.`,
      };
    }
    directory = arg;
  }

  if (isDocs) {
    return {
      kind: 'docs',
      directory: directory ?? '.',
      ...(outDir === undefined ? {} : { outDir }),
      ...(docsDir === undefined ? {} : { docsDir }),
      silent,
    };
  }
  return {
    kind: 'enrich',
    directory: directory ?? '.',
    ...(outDir === undefined ? {} : { outDir }),
    ...(docsDir === undefined ? {} : { docsDir }),
    ...(provider === undefined ? {} : { provider }),
    ...(limit === undefined ? {} : { limit }),
    docs,
    json,
    silent,
  };
}

/** The package version, read at runtime so it never drifts from package.json. */
function readVersion(): string {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    );
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      const version = (parsed as { version: unknown }).version;
      if (typeof version === 'string') return version;
    }
  } catch {
    /* c8 ignore next 2 -- falling back is friendlier than failing to print --version. */
  }
  return '0.0.0';
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Constructs one of the providers this binary knows how to build.
 *
 * A `switch` over the union rather than a lookup with a fallback, so adding a
 * provider name to {@link BUILT_IN_PROVIDERS} without teaching this function
 * about it fails the build instead of silently constructing the mock.
 */
function createProvider(name: BuiltInProvider): SemanticModelProvider {
  switch (name) {
    case 'mock':
      return createMockProvider();
  }
}

/** A directory that is there, or a message saying which one is not. */
function resolveRoot(directory: string): { root: string } | { error: string } {
  const root = path.resolve(directory);
  const stats = statSync(root, { throwIfNoEntry: false });
  if (stats === undefined) return { error: `No such directory: ${directory}` };
  if (!stats.isDirectory()) return { error: `Not a directory: ${directory}` };
  return { root };
}

/** True for the error `fs` raises when a path is not there. */
function isMissingFile(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 'ENOENT'
  );
}

async function runEnrich(
  parsed: Extract<ParsedArgs, { kind: 'enrich' }>,
  io: CliIo,
): Promise<number> {
  const resolved = resolveRoot(parsed.directory);
  if ('error' in resolved) {
    reportError(io, resolved.error);
    return 1;
  }
  const { root } = resolved;
  const fileOptions = { root, ...(parsed.outDir === undefined ? {} : { outDir: parsed.outDir }) };

  let graph;
  try {
    graph = await readApplicationGraph(fileOptions);
  } catch (error) {
    if (isMissingFile(error)) {
      reportError(
        io,
        `No application graph at ${applicationGraphPath(fileOptions)}. Run the indexer first: npx @statewavedev/guide-indexer .`,
      );
      return 1;
    }
    reportError(io, toMessage(error));
    return 1;
  }

  // --- The provider-free path. The graph is real, it loaded, and that is the
  // half of the system that never needed a model. Exit 0.
  if (parsed.provider === undefined) {
    for (const line of PROVIDER_FREE_REPORT) io.out(line);
    return 0;
  }

  // A previous model is an optimisation, never a requirement: a corrupt or
  // absent one costs provider calls, not correctness, so it is reported and
  // stepped over rather than fatal.
  let previous;
  try {
    previous = await readProductModel(fileOptions);
  } catch (error) {
    if (!isMissingFile(error)) {
      reportWarning(io, `Ignoring the previous Product Model: ${toMessage(error)}`);
    }
  }

  const run = await enrichApplicationGraph({
    graph,
    provider: createProvider(parsed.provider),
    ...(parsed.limit === undefined ? {} : { candidateLimit: parsed.limit }),
    ...(previous === undefined ? {} : { previous }),
  });

  if (parsed.json) {
    io.out(serializeProductModel(run.model).trimEnd());
    return 0;
  }

  const written = await writeProductModel(run.model, fileOptions);
  for (const line of formatEnrichmentReport(run)) io.out(line);
  // Printed after the counts, because it answers the question the counts
  // provoke: a thin feature is either a gap in the graph or a judgement the
  // model made, and those have opposite fixes.
  for (const line of formatOpportunityReport(run)) io.out(line);
  for (const line of formatWritten('Product model written to:', written.relativePath)) {
    io.out(line);
  }

  if (parsed.docs) {
    const result = await writeDocs(run.model, {
      root,
      ...(parsed.docsDir === undefined ? {} : { docsDir: parsed.docsDir }),
    });
    io.out('');
    for (const line of formatDocsReport(run.model, result)) io.out(line);
  }
  return 0;
}

async function runDocs(parsed: Extract<ParsedArgs, { kind: 'docs' }>, io: CliIo): Promise<number> {
  const resolved = resolveRoot(parsed.directory);
  if ('error' in resolved) {
    reportError(io, resolved.error);
    return 1;
  }
  const { root } = resolved;
  const fileOptions = { root, ...(parsed.outDir === undefined ? {} : { outDir: parsed.outDir }) };

  let model;
  try {
    model = await readProductModel(fileOptions);
  } catch (error) {
    if (isMissingFile(error)) {
      reportError(
        io,
        `No Product Model at ${productModelPath(fileOptions)}. Run "statewave-guide-semantic enrich" first.`,
      );
      return 1;
    }
    reportError(io, toMessage(error));
    return 1;
  }

  const result = await writeDocs(model, {
    root,
    ...(parsed.docsDir === undefined ? {} : { docsDir: parsed.docsDir }),
  });
  for (const line of formatDocsReport(model, result)) io.out(line);
  for (const line of formatWritten('Documentation written to:', result.written[0] ?? '')) {
    io.out(line);
  }
  return 0;
}

/**
 * Runs one command and returns its exit code.
 *
 * Exported and IO-injected so the tests exercise the real command rather than a
 * re-implementation of it: a provider-free run that prints the wrong thing is a
 * broken promise, and the only way to catch that is to run the thing that
 * prints.
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.kind === 'help') {
    for (const line of HELP) io.out(line);
    return 0;
  }
  if (parsed.kind === 'version') {
    io.out(readVersion());
    return 0;
  }
  if (parsed.kind === 'error') {
    reportError(io, parsed.message);
    return 1;
  }

  const sink = parsed.silent ? createSilentIo(io) : io;
  try {
    return parsed.kind === 'docs' ? await runDocs(parsed, sink) : await runEnrich(parsed, sink);
  } catch (error) {
    reportError(sink, toMessage(error));
    return 1;
  }
}

/**
 * True when this module *is* the program, rather than something a test or a host
 * imported.
 *
 * `realpathSync` matters: a `node_modules/.bin` shim is a symlink, so comparing
 * the raw `argv[1]` against `import.meta.url` would say "imported" for the most
 * common way of all to invoke the binary.
 */
function isProgramEntry(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    /* c8 ignore next 2 -- an unreadable entry path means "not the program". */
    return false;
  }
}

/* c8 ignore start -- process wiring, exercised by running the binary. */
if (isProgramEntry()) {
  runCli(process.argv.slice(2), createConsoleIo())
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      reportError(createConsoleIo(), toMessage(error));
      process.exitCode = 1;
    });
}
/* c8 ignore stop */
