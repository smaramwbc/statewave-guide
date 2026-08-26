/**
 * Terminal output.
 *
 * This module and `cli.ts` are the only two files allowed to call `console`
 * (ESLint enforces it). Keeping every byte of human-facing output in one place
 * means the library half of the package can never accidentally write to a
 * stream a consumer is parsing.
 *
 * The health report is built as an array of lines by a pure function, and only
 * then printed. That is what lets a test assert on the exact report a user sees
 * without capturing stdout — and it keeps the numbers honest, because the
 * formatter has no access to anything but the graph.
 *
 * @packageDocumentation
 */

import pc from 'picocolors';
import type { ApplicationGraph, IndexerDiagnostic, IndexerDiagnosticCode } from './graph.js';

/** The counts the default report prints. */
export interface ReportSummary {
  /** Whether a tsconfig was found; the report line is omitted when it was not. */
  tsconfigDetected: boolean;
  files: number;
  components: number;
  elements: number;
  routes: number;
  diagnostics: readonly IndexerDiagnostic[];
}

/** `1 route` / `4 routes`, without a lookup table nobody maintains. */
function pluralise(count: number, singular: string): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${singular}s`;
}

function check(text: string): string {
  return `${pc.green('✓')} ${text}`;
}

/** Renders a diagnostic as one line, with its location when it has one. */
export function formatDiagnostic(diagnostic: IndexerDiagnostic): string {
  if (diagnostic.file === undefined) return diagnostic.message;
  const location =
    diagnostic.line === undefined ? diagnostic.file : `${diagnostic.file}:${diagnostic.line}`;
  return `${diagnostic.message} (${location})`;
}

/** The default report: a header, the counts, then any diagnostics. */
export function printReport(summary: ReportSummary): void {
  console.log(pc.bold('Statewave Guide'));
  console.log('');
  console.log(pc.dim('Analyzing application...'));
  console.log('');
  if (summary.tsconfigDetected) console.log(check('TypeScript project detected'));
  console.log(check(pluralise(summary.files, 'source file')));
  console.log(check(`${pluralise(summary.components, 'React component')}`));
  console.log(check(`${pluralise(summary.elements, 'guide element')}`));
  console.log(check(pluralise(summary.routes, 'route')));
  for (const diagnostic of summary.diagnostics) {
    console.log(pc.yellow(`! ${formatDiagnostic(diagnostic)}`));
  }
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * How each diagnostic code reads in the warnings list, singular.
 *
 * A complete map rather than a lookup with a fallback: adding a code to the
 * contract without deciding how to say it out loud should be a type error, not
 * a row of raw `SCREAMING_SNAKE_CASE` in a user's terminal.
 */
export const DIAGNOSTIC_LABELS: Record<IndexerDiagnosticCode, string> = {
  INVALID_ELEMENT_ID: 'invalid element id',
  DUPLICATE_ELEMENT_ID: 'duplicate element id',
  MISSING_TSCONFIG: 'missing tsconfig',
  NO_SOURCE_FILES: 'empty file set',
  UNRESOLVED_DYNAMIC_CALL: 'dynamic call',
  UNRESOLVED_DYNAMIC_ROUTE: 'dynamic route',
  UNSUPPORTED_FORM_PATTERN: 'unsupported form pattern',
  UNRESOLVED_MODAL_REGISTRY: 'unresolved modal registry',
  UNRESOLVED_API_PATH: 'dynamic API path',
  UNRESOLVED_IMPORT: 'unresolved import',
  UNRESOLVED_PERMISSION: 'dynamic permission',
  UNSUPPORTED_ROUTING_PATTERN: 'unsupported routing pattern',
  PARSE_FAILURE: 'parse failure',
};

/** Column the value half of a health line starts at. */
const LABEL_WIDTH = 24;
/** Width the value half is right-aligned in, so `9%` lines up under `91%`. */
const VALUE_WIDTH = 3;

/**
 * `1482` → `1,482`, without `Intl`.
 *
 * `toLocaleString` would put a full stop in a German terminal and a space in a
 * French one, which would make the report — and any test of it — depend on the
 * machine it ran on.
 */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A whole-number percentage; `0` of `0` is reported as complete. */
export function formatPercentage(part: number, total: number): string {
  if (total === 0) return '100%';
  return `${Math.round((part / total) * 100)}%`;
}

function healthLine(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}${value.padStart(VALUE_WIDTH)}`;
}

/** Counts per diagnostic code, most frequent first, ties broken by code. */
export function groupDiagnostics(
  diagnostics: readonly IndexerDiagnostic[],
): { code: IndexerDiagnosticCode; count: number }[] {
  const counts = new Map<IndexerDiagnosticCode, number>();
  for (const diagnostic of diagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

/**
 * The health section, as lines.
 *
 * `Resolved` and `Unresolved` are complements by construction rather than two
 * independent roundings, so they always add to 100 and never to 101.
 */
export function formatHealthReport(graph: ApplicationGraph): string[] {
  const { health, stats } = graph;
  const callTotal = health.resolvedCalls + health.unresolvedCalls;
  const resolvedPercentage =
    callTotal === 0 ? 100 : Math.round((health.resolvedCalls / callTotal) * 100);

  const lines = [
    'ApplicationGraph Health',
    '',
    healthLine('Nodes:', formatCount(stats.nodes)),
    healthLine('Relationships:', formatCount(stats.relationships)),
    '',
    healthLine('Resolved calls:', `${resolvedPercentage}%`),
    healthLine('Unresolved calls:', `${100 - resolvedPercentage}%`),
    '',
    healthLine(
      'API paths resolved:',
      formatPercentage(
        health.resolvedApiPaths,
        health.resolvedApiPaths + health.unresolvedApiPaths,
      ),
    ),
    '',
    healthLine('Graph integrity:', health.integrity),
  ];

  const grouped = groupDiagnostics(graph.diagnostics);
  if (grouped.length > 0) {
    lines.push('', 'Warnings:');
    for (const { code, count } of grouped) {
      const label = DIAGNOSTIC_LABELS[code];
      lines.push(`${count} ${label}${count === 1 ? '' : 's'}`);
    }
  }

  return lines;
}

/** Prints the health section. */
export function printHealth(graph: ApplicationGraph): void {
  console.log('');
  const lines = formatHealthReport(graph);
  const [heading, ...rest] = lines;
  console.log(pc.bold(heading ?? ''));
  for (const line of rest) console.log(line);
}

/** The closing block naming where the graph landed. */
export function printWritten(relativePath: string): void {
  console.log('');
  console.log(pc.dim('Product graph written to:'));
  console.log('');
  console.log(relativePath);
}

/** Writes the graph itself to stdout, for `--json`. */
export function printJson(json: string): void {
  console.log(json);
}

/** Writes arbitrary lines, used for `--help`. */
export function printLines(lines: readonly string[]): void {
  for (const line of lines) console.log(line);
}

/** A failure a user can read. Stack traces never reach the terminal. */
export function printError(message: string): void {
  console.error(`${pc.red('✗')} ${message}`);
}
