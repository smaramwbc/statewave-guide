/**
 * The formatting helpers the previous dashboard used, kept until its last
 * consumer is migrated.
 *
 * Two name collisions live here on purpose. `formatDate` is *also* declared in
 * `./format.ts`, with different output, so a resolver that maps a bare name to
 * "the one file in the project that declares it" picks whichever it saw first.
 * And `ClientTable` is a plain function with the same name as the component in
 * `components/ClientTable.tsx`, so two ids that differ only by kind have to
 * stay distinct.
 */
import type { Client } from '../types/client';

/** `2024-03-01`. Deliberately not the same output as `./format.ts`'s `formatDate`. */
export function formatDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10);
}

/** Renders clients as tab-separated text. Not the component of the same name. */
export function ClientTable(clients: Client[]): string {
  return clients.map((client) => `${client.name}\t${client.email}`).join('\n');
}
