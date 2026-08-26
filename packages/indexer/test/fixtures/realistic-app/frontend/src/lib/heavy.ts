/**
 * Deliberately expensive module, only ever reached through `await import()`.
 *
 * The indexer must record the import as unresolved-by-design and must *not*
 * emit a `calls` edge for `mod.exportToCsv(...)`: the binding `mod` is the
 * resolution of a promise, and treating it as a static namespace would let one
 * lazily-loaded module invent call edges for every other.
 */
import type { Client } from '../types/client';

/** Renders clients as CSV, including the header row. */
export function exportToCsv(clients: Client[]): string {
  const header = ['id', 'name', 'email', 'plan', 'status'].join(',');
  const rows = clients.map((client) =>
    [client.id, client.name, client.email, client.plan, client.status].map(escapeCell).join(','),
  );
  return [header, ...rows].join('\n');
}

/** Quotes a CSV cell when it contains a separator. */
export function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Hands a generated file to the browser. */
export function downloadBlob(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
