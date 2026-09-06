/**
 * Guide memory over the host application's own backend.
 *
 * This is the browser half of remote memory, and the only reason it exists is
 * that Statewave has no browser-safe credential. Authentication is a server-wide
 * `X-API-Key` plus a client-asserted `X-Tenant-ID`; a key in frontend code is a
 * key given to every visitor, and a tenant header the client asserts is not an
 * isolation boundary when the client is a stranger's browser.
 *
 * So the browser never talks to Statewave. It talks to the application it is
 * already part of:
 *
 * ```
 *   browser  ->  host's trusted backend  ->  Statewave
 * ```
 *
 * The backend is where the credential lives, and where the *subject* is decided.
 * That second part matters more than it looks: this store sends a scope, and a
 * host that trusts the browser's scope has built an authorization bug. The
 * endpoint contract below says so, and the reference implementation in the
 * example host derives the subject from its own session instead.
 *
 * @packageDocumentation
 */

import {
  acceptMemoryEvents,
  isDurableRemoteEvent,
  scopeKey,
  validateMemoryEvent,
} from '@statewavedev/guide-core';
import type {
  GuideMemoryEvent,
  GuideMemoryScope,
  GuideMemoryStore,
  GuideMemoryStoreDiagnostics,
} from '@statewavedev/guide-core';

/** What the browser half is doing. A developer surface; never a user-facing one. */
export type RemoteMemoryMode = 'REMOTE_CONNECTING' | 'REMOTE' | 'REMOTE_DEGRADED';

export interface RemoteGuideMemoryDiagnostics extends GuideMemoryStoreDiagnostics {
  mode: RemoteMemoryMode;
  recordsFetched: number;
  readFailures: number;
  writeFailures: number;
  /**
   * Events the retention policy kept in the page.
   *
   * Separate from `rejectedOnWrite` for the same reason as in the adapter: one
   * of them means something went wrong and the other means nothing did.
   */
  withheldByPolicy: number;
  lastFailure?: string;
}

export interface RemoteGuideMemoryStoreOptions {
  /**
   * The host's own endpoint. A path on the application's origin, not a
   * Statewave URL — pointing this at Statewave directly is the mistake this
   * whole file exists to prevent.
   */
  endpoint: string;
  /** Injectable for tests, and for a host that needs its own credentials attached. */
  fetch?: typeof globalThis.fetch;
  /** How long the browser waits before giving up on personalisation. */
  timeoutMs?: number;
}

export interface RemoteGuideMemoryStore extends GuideMemoryStore {
  diagnostics(): RemoteGuideMemoryDiagnostics;
}

/**
 * A memory store backed by the host's backend.
 *
 * Validates on the way out and on the way in, exactly as the browser and
 * reference stores do. The backend is untrusted in the same sense they are: it
 * is a place records come from, and shape is what decides whether they are guide
 * memory.
 */
export function createRemoteGuideMemoryStore(
  options: RemoteGuideMemoryStoreOptions,
): RemoteGuideMemoryStore {
  const timeoutMs = options.timeoutMs ?? 5000;
  const call = options.fetch ?? globalThis.fetch?.bind(globalThis);
  const endpoint = options.endpoint.replace(/\/+$/, '');
  const diagnostics: RemoteGuideMemoryDiagnostics = {
    written: 0,
    read: 0,
    rejectedOnWrite: 0,
    ignoredOnRead: 0,
    bytesPersisted: 0,
    writeErrors: 0,
    mode: 'REMOTE_CONNECTING',
    recordsFetched: 0,
    readFailures: 0,
    writeFailures: 0,
    withheldByPolicy: 0,
  };

  const degrade = (why: string): void => {
    diagnostics.mode = 'REMOTE_DEGRADED';
    diagnostics.lastFailure = why;
  };

  /** One request, bounded, with failure treated as absence rather than an error. */
  async function send(path: string, init: RequestInit): Promise<unknown> {
    if (call === undefined) throw new Error('no fetch available');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await call(`${endpoint}${path}`, {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
      if (!response.ok) throw new Error(`the memory endpoint answered ${response.status}`);
      const text = await response.text();
      return text.length === 0 ? undefined : (JSON.parse(text) as unknown);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async append(event: GuideMemoryEvent) {
      // Validated before it leaves the page. The backend validates again — it
      // has to, because a browser is not a trustworthy caller — but sending
      // something already known to be unacceptable would be this layer failing
      // to do its own job.
      const result = validateMemoryEvent(event);
      if (!result.ok || result.event === undefined) {
        diagnostics.rejectedOnWrite += 1;
        return;
      }
      // Applied here as well as in the adapter, and deliberately not only
      // there. A record with no future presentation effect has no reason to
      // cross the network at all, and the cheapest place to not send something
      // is before it is sent. The backend still enforces its own copy — a
      // browser is not a trustworthy caller — so this is the polite half of a
      // rule that is kept somewhere the page cannot reach.
      if (!isDurableRemoteEvent(result.event)) {
        diagnostics.withheldByPolicy += 1;
        return;
      }

      const body = JSON.stringify({ event: result.event });
      diagnostics.bytesPersisted += body.length;
      try {
        await send('/events', { method: 'POST', body });
        diagnostics.written += 1;
        diagnostics.mode = 'REMOTE';
      } catch (error) {
        // A memory write that failed is not a guidance failure. The answer the
        // user is reading was computed before this was attempted.
        diagnostics.writeFailures += 1;
        diagnostics.writeErrors += 1;
        degrade(error instanceof Error ? error.message : 'write failed');
      }
    },

    async read(scope: GuideMemoryScope) {
      const key = scopeKey(scope);
      let raw: unknown;
      try {
        raw = await send(`/events?scope=${encodeURIComponent(key)}`, { method: 'GET' });
      } catch (error) {
        diagnostics.readFailures += 1;
        degrade(error instanceof Error ? error.message : 'read failed');
        return [];
      }
      const events = Array.isArray((raw as { events?: unknown })?.events)
        ? ((raw as { events: unknown[] }).events as unknown[])
        : [];
      diagnostics.recordsFetched += events.length;
      const { accepted, ignored } = acceptMemoryEvents(events);
      // The scope a record claims must be the scope it was asked for. A backend
      // returning somebody else's history — by accident or otherwise — does not
      // get to decide whose memory this is.
      const belongs = accepted.filter((event) => scopeKey(event) === key);
      diagnostics.read += belongs.length;
      diagnostics.ignoredOnRead += ignored.length + (accepted.length - belongs.length);
      if (diagnostics.mode !== 'REMOTE_DEGRADED') diagnostics.mode = 'REMOTE';
      return belongs;
    },

    async clear(scope: GuideMemoryScope) {
      // Rethrows. A reset that quietly failed would leave somebody believing
      // they had been forgotten.
      await send(`/events?scope=${encodeURIComponent(scopeKey(scope))}`, { method: 'DELETE' });
      diagnostics.mode = 'REMOTE';
    },

    // `lastWriteError` as well as `lastFailure`, because that is the name the
    // developer inspector already reads from a store.
    diagnostics: () => ({
      ...diagnostics,
      ...(diagnostics.lastFailure === undefined ? {} : { lastWriteError: diagnostics.lastFailure }),
    }),
  };
}
