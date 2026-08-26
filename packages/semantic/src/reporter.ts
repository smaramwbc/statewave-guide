/* eslint-disable no-console -- This module and `./cli.ts` are the only files in
   the package allowed to talk to a terminal, and every byte of that output is
   built here so the library half can never write to a stream a consumer is
   parsing. The repository's ESLint config grants the same exemption to the
   indexer's pair by path; this is how the semantic package earns it without
   reaching into a config file it does not own. */

/**
 * Terminal output.
 *
 * Every report is a pure function returning an array of lines, and only the
 * {@link CliIo} at the very edge of the process turns a line into a byte on a
 * stream. That split is worth the extra type: a test can assert the exact words
 * a user will read without capturing stdout, and the formatters have access to
 * nothing but the run, so no figure can be rounded into looking better than it
 * is.
 *
 * Every caveat {@link EnrichmentRun.warnings} carries is printed. That is the
 * only surface they have: `ProductModel` has no field for a warning, so nothing
 * in `product.json` or in the Markdown projection can carry one, and a warning
 * nobody prints is indistinguishable from a run that had nothing to warn about.
 *
 * The block that matters most here is {@link PROVIDER_FREE_REPORT}. It is a
 * constant rather than a template because it is a promise. The deterministic
 * half of Statewave Guide is the half that matters, and it has to be usable by a
 * team with no model budget, no vendor account and no intention of getting
 * either — so a run with no provider configured *says so and succeeds*. A tool
 * that errors when its optional half is absent has made the optional half
 * mandatory.
 *
 * @packageDocumentation
 */

import pc from 'picocolors';
import type { ProductModel } from '@statewavedev/guide-shared';
import { compareStrings } from './compare.js';
import type { WriteDocsResult } from './docs.js';
import type { EnrichmentRun } from './enrich.js';

/** Where a command's output goes. Injected so tests never capture a stream. */
export interface CliIo {
  /** One line of ordinary output. */
  out(line: string): void;
  /** One line of failure or warning output. */
  err(line: string): void;
}

/** Column the value half of a summary line starts at. */
const LABEL_WIDTH = 32;
/** Width the value half is right-aligned in, so `9%` lines up under `91%`. */
const VALUE_WIDTH = 4;

/** The heading every report opens with, and the only line printed in bold. */
const HEADING = 'Statewave Guide';

/** `1 claim` / `4 claims`, without a lookup table nobody maintains. */
function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? `${count} ${singular}` : `${count} ${plural}`;
}

/** `1482` → `1,482`, without `Intl` and therefore without a locale. */
export function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A whole-number percentage. */
export function formatPercentage(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function summaryLine(label: string, value: string): string {
  return `${label.padEnd(LABEL_WIDTH)}${value.padStart(VALUE_WIDTH)}`;
}

/**
 * What a run with no provider prints, exactly.
 *
 * Exported as data so the guarantee is testable as a value rather than as a
 * string a test has to re-type and can therefore get wrong in the same way the
 * implementation did.
 */
export const PROVIDER_FREE_REPORT: readonly string[] = [
  HEADING,
  '',
  'Application graph loaded.',
  '',
  'Semantic enrichment skipped:',
  'No model provider configured.',
];

/** How many feature ids a grouped caveat names before it stops listing them. */
const NAMED_FEATURES = 4;

/**
 * The run's caveats, one line per distinct caveat rather than one per feature.
 *
 * Enrichment prefixes each warning with the feature it came from, so a run over
 * seventy candidates produces seventy copies of "the evidence pack was
 * truncated". Printed raw that is a wall nobody reads, which is the same
 * outcome as not printing them — so identical messages are grouped and the
 * features are named, up to a point.
 */
function groupWarnings(warnings: readonly string[]): string[] {
  const grouped = new Map<string, string[]>();
  for (const warning of warnings) {
    const match = /^([^\s:]+): (.*)$/s.exec(warning);
    const message = match?.[2] ?? warning;
    const feature = match?.[1];
    const features = grouped.get(message) ?? [];
    if (feature !== undefined) features.push(feature);
    grouped.set(message, features);
  }

  const lines: string[] = [];
  for (const [message, features] of grouped) {
    if (features.length === 0) {
      lines.push(message);
      continue;
    }
    const named = features.slice(0, NAMED_FEATURES).join(', ');
    const rest = features.length - NAMED_FEATURES;
    const where = rest > 0 ? `${named} and ${rest} more` : named;
    lines.push(`${message} (${pluralise(features.length, 'feature')}: ${where})`);
  }
  return lines;
}

/** The enrichment report, as lines. */
export function formatEnrichmentReport(run: EnrichmentRun): string[] {
  const { verification } = run.model;
  const lines: string[] = [
    HEADING,
    '',
    'Verifying application semantics...',
    '',
    `✓ ${pluralise(verification.featureCandidates, 'feature candidate')}`,
    `✓ ${pluralise(verification.featuresAccepted, 'feature')} accepted`,
    `✓ ${pluralise(verification.structurallyVerified, 'claim')} structurally verified`,
    `✓ ${pluralise(verification.semanticallyGrounded, 'claim')} recorded as interpretation`,
  ];
  if (run.reused.length > 0) {
    lines.push(`✓ ${pluralise(run.reused.length, 'feature')} reused unchanged (no model call)`);
  }
  if (verification.claimsRejected > 0) {
    lines.push(`! ${pluralise(verification.claimsRejected, 'claim')} refused`);
  }
  if (verification.featuresRejected > 0) {
    lines.push(`! ${pluralise(verification.featuresRejected, 'feature')} refused`);
  }

  lines.push(
    '',
    'Refusals by category — a breakdown, not a total',
    '',
    summaryLine(
      'Unsupported capabilities:',
      formatCount(verification.blocked.unsupportedCapabilities),
    ),
    summaryLine(
      'Unsupported constraints:',
      formatCount(verification.blocked.unsupportedConstraints),
    ),
    summaryLine(
      'Unsupported permissions:',
      formatCount(verification.blocked.unsupportedPermissions),
    ),
    summaryLine(
      'Steps without evidence:',
      formatCount(verification.blocked.workflowStepsWithoutEvidence),
    ),
    summaryLine('Unknown references:', formatCount(verification.blocked.unknownReferences)),
    '',
    summaryLine('Evidence coverage:', formatPercentage(verification.evidenceCoverage)),
  );

  const totals = new Map<string, number>();
  for (const feature of run.model.features) {
    for (const [key, count] of Object.entries(feature.claimSummary.unsupportedActions)) {
      totals.set(key, (totals.get(key) ?? 0) + count);
    }
  }
  if (totals.size > 0) {
    lines.push('', 'Could not be checked — no verification rule exists:');
    for (const key of [...totals.keys()].sort(compareStrings)) {
      lines.push(summaryLine(`  ${key}:`, formatCount(totals.get(key) ?? 0)));
    }
    lines.push('', 'That is not the same as being disproved.');
  }

  // The caveats the verifier produced. Without this they went nowhere at all:
  // `ProductModel` has no field for them, the Markdown projection cannot see
  // them, and "the pack was truncated, so these claims were checked against a
  // partial neighbourhood" is exactly the sort of thing a reader has to be told
  // rather than left to infer from a number that looks fine.
  const caveats = groupWarnings(run.warnings);
  if (caveats.length > 0) {
    lines.push('', 'Caveats — things this run could not do, or did partially:', '');
    for (const caveat of caveats) lines.push(`! ${caveat}`);
  }

  return lines;
}

/** The docs report, as lines. */
export function formatDocsReport(model: ProductModel, result: WriteDocsResult): string[] {
  return [
    HEADING,
    '',
    'Projecting documentation from the Product Model...',
    '',
    `✓ ${pluralise(model.features.length, 'feature page')}`,
    `✓ ${pluralise(model.workflows.length, 'workflow page')}`,
    ...(result.removed.length > 0
      ? [`✓ ${pluralise(result.removed.length, 'stale page')} removed`]
      : []),
    '',
    'Documentation is a projection of product.json. It is regenerated, never edited.',
  ];
}

/** The closing block naming where an artefact landed. */
export function formatWritten(label: string, relativePath: string): string[] {
  return ['', label, '', relativePath];
}

/**
 * The terminal-backed sink.
 *
 * Colour is decided from the shape of a line rather than passed alongside it, so
 * a formatter never has to know whether its output is going to a terminal, a
 * pipe or a test.
 */
export function createConsoleIo(): CliIo {
  return {
    out(line: string): void {
      if (line === HEADING) console.log(pc.bold(line));
      else if (line.startsWith('✓ ')) console.log(`${pc.green('✓')} ${line.slice(2)}`);
      else if (line.startsWith('! ')) console.log(pc.yellow(line));
      else console.log(line);
    },
    err(line: string): void {
      console.error(line);
    },
  };
}

/**
 * A sink for `--silent`.
 *
 * Reports are discarded; failures are not. A tool that can be asked to fail
 * without saying so is a tool that will one day fail without anyone noticing,
 * and the exit code is not always where someone is looking.
 */
export function createSilentIo(base: CliIo = createConsoleIo()): CliIo {
  return { out: () => undefined, err: (line) => base.err(line) };
}

/** A failure a user can read. Stack traces never reach the terminal. */
export function reportError(io: CliIo, message: string): void {
  io.err(`${pc.red('✗')} ${message}`);
}

/** A note that is not a failure. */
export function reportWarning(io: CliIo, message: string): void {
  io.err(`${pc.yellow('!')} ${message}`);
}
