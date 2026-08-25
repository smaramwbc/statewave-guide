/**
 * Terminal output.
 *
 * This module and `cli.ts` are the only two files allowed to call `console`
 * (ESLint enforces it). Keeping every byte of human-facing output in one place
 * means the library half of the package can never accidentally write to a
 * stream a consumer is parsing.
 *
 * @packageDocumentation
 */

import pc from 'picocolors';
import type { IndexerDiagnostic } from './graph.js';

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
