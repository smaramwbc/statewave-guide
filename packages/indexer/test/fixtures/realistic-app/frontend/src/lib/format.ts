/** Presentation helpers. No I/O, no navigation, nothing for the graph to join. */

/** Formats minor units as a currency string, e.g. `1234` -> `$12.34`. */
export function formatCurrency(amountInCents: number, currency = 'USD'): string {
  const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency });
  return formatter.format(amountInCents / 100);
}

/** Formats an ISO timestamp as a short human date. */
export function formatDate(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** `1 client` / `3 clients`. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Shortens a string, keeping whole words where it can. */
export function truncate(value: string, maxLength = 60): string {
  if (value.length <= maxLength) return value;
  const cut = value.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Upper-cases the first letter and leaves the rest alone. */
export function titleCase(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}
