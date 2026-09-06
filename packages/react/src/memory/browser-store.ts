/**
 * Remembering across a reload, using what a browser already has.
 *
 * `localStorage` is the honest default for a guide that must work in somebody
 * else's application with no backend to call. It survives a reload and a browser
 * restart, which is the continuity Closed Loop #19 is actually testing, and it
 * belongs to one browser profile, which is the correct blast radius for
 * something no server was asked to hold.
 *
 * The interesting part is not the storage. It is that this store validates on
 * the way in *and* on the way out, exactly as a remote one would. A person can
 * open developer tools and write anything into `localStorage`; a record claiming
 * `featureId: 'invented.feature'`, or carrying an instruction, or holding a key,
 * is refused at the boundary rather than trusted because it came from "our" key.
 *
 * A host with a real backend replaces this with an adapter over their own store.
 * Nothing above this file knows which one it has.
 *
 * @packageDocumentation
 */

import { acceptMemoryEvents, scopeKey, validateMemoryEvent } from '@statewavedev/guide-core';
import type {
  GuideMemoryEvent,
  GuideMemoryScope,
  GuideMemoryStore,
  GuideMemoryStoreDiagnostics,
} from '@statewavedev/guide-core';

export interface BrowserGuideMemoryStore extends GuideMemoryStore {
  diagnostics(): GuideMemoryStoreDiagnostics;
  /** Everything this store holds, for a developer inspector or a gate sweep. */
  dump(): string;
}

/**
 * How many events one subject may accumulate.
 *
 * A cap rather than a retention policy with dates, because adaptation reads
 * counters and a counter does not get better after a few hundred samples. The
 * oldest are dropped first; nothing here needs a clock to decide that.
 */
const MAX_EVENTS_PER_SCOPE = 200;

/** A memory store backed by the browser, or by nothing if storage is unavailable. */
export function createBrowserGuideMemoryStore(
  options: { storage?: Storage } = {},
): BrowserGuideMemoryStore {
  const diagnostics: GuideMemoryStoreDiagnostics = {
    written: 0,
    read: 0,
    rejectedOnWrite: 0,
    ignoredOnRead: 0,
    bytesPersisted: 0,
    writeErrors: 0,
  };

  /**
   * Storage, if this browser will give us any.
   *
   * A private window, disabled site data or a quota error all mean the same
   * thing to a guide: no memory, and everything else works. Losing
   * personalisation is not an error worth telling a user about.
   */
  const storage = (): Storage | undefined => {
    try {
      return options.storage ?? globalThis.localStorage ?? undefined;
    } catch {
      return undefined;
    }
  };

  const readRaw = (key: string): GuideMemoryEvent[] => {
    const store = storage();
    if (store === undefined) return [];
    try {
      const raw = store.getItem(key);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const { accepted, ignored } = acceptMemoryEvents(parsed);
      // And the event must belong in the bucket it was found in. Shape alone is
      // not enough: a hand-edited store could park a well-formed record for one
      // subject under another's key, and every check downstream would treat the
      // key as the authority on whose history it is.
      const belongs = accepted.filter((event) => scopeKey(event) === key);
      diagnostics.ignoredOnRead += ignored.length + (accepted.length - belongs.length);
      return belongs;
    } catch {
      // Malformed storage is a store that failed. It is not a reason to stop
      // answering questions.
      return [];
    }
  };

  /**
   * Returns whether the bytes actually landed.
   *
   * It used to swallow the failure and return nothing, which meant the
   * `writeErrors` counter added to diagnose exactly this could never fire: quota
   * errors and browsers that only pretend to have storage were indistinguishable
   * from a successful write. A store that cannot write is still not an error
   * worth telling a *user* about; it is very much one worth telling a developer.
   */
  const writeRaw = (key: string, events: readonly GuideMemoryEvent[]): boolean => {
    const store = storage();
    if (store === undefined) return false;
    try {
      store.setItem(key, JSON.stringify(events));
      return true;
    } catch (error) {
      diagnostics.writeErrors += 1;
      diagnostics.lastWriteError = error instanceof Error ? error.message : 'storage refused';
      return false;
    }
  };

  const measure = (): void => {
    const store = storage();
    if (store === undefined) {
      diagnostics.bytesPersisted = 0;
      return;
    }
    let total = 0;
    try {
      for (let index = 0; index < store.length; index += 1) {
        const key = store.key(index);
        if (key === null || !key.startsWith('statewave-guide:')) continue;
        total += (store.getItem(key) ?? '').length;
      }
    } catch {
      total = 0;
    }
    diagnostics.bytesPersisted = total;
  };

  /**
   * Appends run one at a time.
   *
   * Writing is read-modify-write, and two records can be in flight at once — a
   * question is recorded when the answer arrives, and pressing Show me records
   * another a moment later. Interleaved, the second read happens before the
   * first write and the first record is lost.
   *
   * That is exactly what happened: a scenario that asked three times and pressed
   * Show me three times ended with **one** event in the store, and the derived
   * pattern it was meant to demonstrate never appeared. A queue costs nothing
   * here and turns a lost update into a wait of microseconds.
   */
  let queue: Promise<void> = Promise.resolve();

  return {
    append(event) {
      const step = (): void => {
        const result = validateMemoryEvent(event);
        if (!result.ok || result.event === undefined) {
          diagnostics.rejectedOnWrite += 1;
          return;
        }
        // `scopeKey` throws on a scope field it will not build a key from, and
        // that throw used to travel out through the queue below.
        const key = scopeKey(result.event);
        const events = [...readRaw(key), result.event].slice(-MAX_EVENTS_PER_SCOPE);
        // Counted only when the bytes landed. `written` used to increment for a
        // write that had silently failed.
        if (writeRaw(key, events)) diagnostics.written += 1;
        measure();
      };
      // Ordered, and isolated.
      //
      // The first version chained straight onto `queue`, so one rejected append
      // left the chain rejected and *every* later append silently did nothing —
      // for the life of the page, with no error anywhere. It reproduced about
      // once in ten runs as "the guide recorded nothing", which is the worst
      // shape a bug can have: rare, silent, and total.
      //
      // Each append now runs after the previous one has settled, whether that
      // one succeeded or not, and its own failure is reported to its own caller.
      const settled = queue.then(step, step);
      queue = settled.then(
        () => undefined,
        (error: unknown) => {
          diagnostics.writeErrors += 1;
          diagnostics.lastWriteError = error instanceof Error ? error.message : String(error);
        },
      );
      return settled;
    },
    async read(scope: GuideMemoryScope) {
      // Behind anything still being written, so a read never sees a half-applied
      // sequence of appends.
      await queue;
      const events = readRaw(scopeKey(scope));
      diagnostics.read += events.length;
      return events;
    },
    async clear(scope: GuideMemoryScope) {
      await queue;
      const store = storage();
      if (store === undefined) return;
      try {
        store.removeItem(scopeKey(scope));
      } catch {
        // Nothing to do, and nothing worth saying.
      }
      measure();
    },
    diagnostics: () => ({ ...diagnostics }),
    dump: () => {
      const store = storage();
      if (store === undefined) return '[]';
      const entries: [string, string][] = [];
      try {
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (key === null || !key.startsWith('statewave-guide:')) continue;
          entries.push([key, store.getItem(key) ?? '']);
        }
      } catch {
        return '[]';
      }
      return JSON.stringify(entries);
    },
  };
}
