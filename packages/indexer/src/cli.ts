/**
 * `statewave-guide` — the command-line entry point.
 *
 * Supports both `npx @statewavedev/guide-indexer .` and
 * `statewave-guide index [dir]`, because the package name and the binary name
 * are two names for the same thing and a user should not have to know which
 * one they invoked.
 *
 * The shebang is added by tsup at build time, so it must not appear here — the
 * library entry has to stay importable.
 *
 * @packageDocumentation
 */

import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import type { StatewaveGuideConfig } from './config.js';
import { createProjectIndexer } from './indexer.js';
import { printError, printJson, printLines, printReport, printWritten } from './reporter.js';
import { serializeApplicationGraph } from './serialize.js';
import { writeApplicationGraph } from './write.js';

/** A fully parsed command line. */
type ParsedArgs =
  | { kind: 'run'; directory: string; outDir?: string; json: boolean; silent: boolean }
  | { kind: 'help' }
  | { kind: 'version' }
  | { kind: 'error'; message: string };

const HELP = [
  'statewave-guide — deterministic Statewave Guide application indexer',
  '',
  'Usage',
  '  statewave-guide [index] [directory] [options]',
  '',
  'Options',
  '  --out <dir>   Directory the graph is written to (default: .statewave-guide)',
  '  --json        Print the graph to stdout instead of writing a file',
  '  --silent      Suppress all output',
  '  --version     Print the indexer version',
  '  --help        Show this message',
  '',
  'Examples',
  '  npx @statewavedev/guide-indexer .',
  '  statewave-guide index ./apps/web --out .statewave-guide',
];

/**
 * Parses argv.
 *
 * A leading `index` subcommand is accepted and ignored: it reads naturally when
 * the binary is invoked by name, and it would be noise when the package is run
 * through `npx`.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const args = argv[0] === 'index' ? argv.slice(1) : [...argv];

  let directory: string | undefined;
  let outDir: string | undefined;
  let json = false;
  let silent = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;

    if (arg === '--help' || arg === '-h') return { kind: 'help' };
    if (arg === '--version' || arg === '-v') return { kind: 'version' };
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--silent') {
      silent = true;
      continue;
    }
    if (arg === '--out') {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('-')) {
        return {
          kind: 'error',
          message: '--out requires a directory, e.g. --out .statewave-guide',
        };
      }
      outDir = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--out=')) {
      const value = arg.slice('--out='.length);
      if (value.length === 0) {
        return {
          kind: 'error',
          message: '--out requires a directory, e.g. --out .statewave-guide',
        };
      }
      outDir = value;
      continue;
    }
    if (arg.startsWith('-')) {
      return {
        kind: 'error',
        message: `Unknown option "${arg}". Run "statewave-guide --help" to see the available options.`,
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

  return {
    kind: 'run',
    directory: directory ?? '.',
    ...(outDir !== undefined ? { outDir } : {}),
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
    // Falling back below is friendlier than failing to print --version.
  }
  return '0.0.0';
}

function toMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);

  if (parsed.kind === 'help') {
    printLines(HELP);
    return 0;
  }
  if (parsed.kind === 'version') {
    printLines([readVersion()]);
    return 0;
  }
  if (parsed.kind === 'error') {
    printError(parsed.message);
    return 1;
  }

  try {
    const root = path.resolve(parsed.directory);

    // A directory that is not there is a typo, not an application with no
    // source in it. Left unchecked, `writeApplicationGraph` would create the
    // path and the run would report a green, empty graph.
    const stats = statSync(root, { throwIfNoEntry: false });
    if (stats === undefined) {
      printError(`No such directory: ${parsed.directory}`);
      return 1;
    }
    if (!stats.isDirectory()) {
      printError(`Not a directory: ${parsed.directory}`);
      return 1;
    }

    // The config is read here as well as inside the indexer, because `--out`
    // has to win over `outDir` for the write step and the indexer's result
    // intentionally describes the graph rather than where to put it.
    const { config } = await loadConfig(root);
    const merged: StatewaveGuideConfig = {
      ...config,
      ...(parsed.outDir !== undefined ? { outDir: parsed.outDir } : {}),
    };

    const { graph, tsconfigPath } = await createProjectIndexer({ root, config: merged }).index();

    if (parsed.json) {
      // `--silent` means what it says, including here: the two flags together
      // are how a caller asks for the exit code and nothing else.
      if (!parsed.silent) printJson(serializeApplicationGraph(graph).trimEnd());
      return 0;
    }

    const written = await writeApplicationGraph(graph, {
      root,
      ...(merged.outDir !== undefined ? { outDir: merged.outDir } : {}),
    });

    if (!parsed.silent) {
      printReport({
        tsconfigDetected: tsconfigPath !== undefined,
        files: graph.stats.files,
        components: graph.stats.components,
        elements: graph.stats.elements,
        routes: graph.stats.routes,
        diagnostics: graph.diagnostics,
      });
      printWritten(written.relativePath);
    }

    return 0;
  } catch (error) {
    printError(toMessage(error));
    return 1;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    printError(toMessage(error));
    process.exitCode = 1;
  });
