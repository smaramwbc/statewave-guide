/**
 * A {@link MemoryProvider} that keeps everything in process.
 *
 * The reference implementation of the memory port. It makes the runtime usable
 * and testable today, and it is the shape the Statewave adapter (roadmap Day 5)
 * has to satisfy — which is the point of writing it now: the port gets proven
 * before it gets a dependency.
 *
 * Nothing here persists. Reload the page and the memories are gone.
 *
 * @packageDocumentation
 */

import type {
  MemoryProvider,
  MemoryRecord,
  MemoryRetrieveInput,
  MemoryWriteInput,
} from './providers.js';
import { byScoreThenId, scoreFields, tokenize } from './lexical-score.js';

/** Options for {@link createInMemoryMemoryProvider}. */
export interface InMemoryMemoryProviderOptions {
  /** Records to start with. */
  initial?: MemoryWriteInput[];
  /** Default maximum number of records returned by `retrieve`. Defaults to `5`. */
  limit?: number;
  /** Clock, injectable so tests can assert on `createdAt`. */
  now?: () => Date;
}

/** An in-memory provider, plus the inspection helpers a test or demo needs. */
export interface InMemoryMemoryProvider extends MemoryProvider {
  /** Every stored record, in insertion order. */
  all(): MemoryRecord[];
  /** Discards everything. */
  clear(): void;
}

/**
 * Creates an in-process {@link MemoryProvider}.
 *
 * @example
 * ```ts
 * const memory = createInMemoryMemoryProvider();
 * await memory.remember({ text: 'Prefers keyboard shortcuts', subject: 'user:42' });
 * const hits = await memory.retrieve({ query: 'shortcuts', subject: 'user:42' });
 * ```
 */
export function createInMemoryMemoryProvider(
  options: InMemoryMemoryProviderOptions = {},
): InMemoryMemoryProvider {
  const defaultLimit = options.limit ?? 5;
  const now = options.now ?? (() => new Date());
  const records: MemoryRecord[] = [];
  let counter = 0;

  function write(input: MemoryWriteInput): void {
    const record: MemoryRecord = {
      id: `mem_${++counter}`,
      text: input.text,
      createdAt: now().toISOString(),
    };
    if (input.subject !== undefined) record.subject = input.subject;
    if (input.kind !== undefined) record.kind = input.kind;
    if (input.metadata !== undefined) record.metadata = input.metadata;
    records.push(record);
  }

  for (const initial of options.initial ?? []) write(initial);

  return {
    name: 'in-memory',

    async retrieve(input: MemoryRetrieveInput) {
      const queryTokens = tokenize(input.query);
      if (queryTokens.length === 0) return [];

      const scored = records
        .filter((record) => input.subject === undefined || record.subject === input.subject)
        .map((record) => ({
          ...record,
          score: scoreFields(queryTokens, [{ text: record.text, weight: 1 }]),
        }))
        .filter((record) => record.score > 0);

      return scored.sort(byScoreThenId).slice(0, input.limit ?? defaultLimit);
    },

    async remember(input) {
      write(input);
    },

    all: () => records.map((record) => ({ ...record })),

    clear() {
      records.length = 0;
      counter = 0;
    },
  };
}
