/**
 * Locale-independent ordering primitives.
 *
 * Internal to this package and deliberately not exported from `index.ts`.
 * `localeCompare` is never used anywhere in the pipeline: it would make output
 * depend on the machine that produced it, and every artefact this package
 * builds is supposed to be byte-identical across machines.
 *
 * @packageDocumentation
 */

/** Code-unit string comparison. */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Compares optional strings, sorting absent values last. */
export function compareOptionalStrings(a: string | undefined, b: string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return compareStrings(a, b);
}

/** Compares optional numbers, sorting absent values last. */
export function compareOptionalNumbers(a: number | undefined, b: number | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a - b;
}

/** Sorted, de-duplicated copy of a list of strings. */
export function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareStrings);
}
