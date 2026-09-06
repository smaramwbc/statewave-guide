/**
 * Where remembered events live, and what a store is allowed to be.
 *
 * The contract is small on purpose: append an event, read a subject's events,
 * clear them. There is no query language, no search, no similarity, and no
 * retrieval over past conversations — a store that could answer *find me
 * something like this* would be a second knowledge base, and this project has
 * exactly one.
 *
 * Every store is treated as untrusted. Records come back from somewhere else,
 * may have been edited, and are validated on the way in *and* on the way out.
 * A store that returns `featureId: 'invented.feature'`, an unknown event kind,
 * or a sentence beginning "Ignore previous instructions" loses at the boundary
 * rather than in a renderer.
 *
 * ## Statewave
 *
 * This project's persistent backend is meant to be Statewave, and the contract
 * below is shaped to fit its vocabulary — subjects, episodes, kinds — so an
 * adapter is a translation rather than a redesign. It is not wired to a live
 * service here; `statewaveAdapterStatus` explains exactly why, in code rather
 * than in a document that can drift from it.
 *
 * @packageDocumentation
 */

import type { GuideMemoryEvent } from './events.js';
import { acceptMemoryEvents, validateMemoryEvent } from './events.js';

/** Who the memory belongs to. Opaque ids from the host, never read off a page. */
export interface GuideMemoryScope {
  appId: string;
  subjectId: string;
  workspaceId?: string;
}

/**
 * The whole persistence surface.
 *
 * Deliberately three methods. Anything richer starts to look like a database
 * the guide reasons over, and the guide reasons over the ProductModel.
 */
export interface GuideMemoryStore {
  /** Record one thing that happened. May reject; rejection is not an error. */
  append(event: GuideMemoryEvent): Promise<void>;
  /** Everything remembered for this scope, oldest first. */
  read(scope: GuideMemoryScope): Promise<readonly GuideMemoryEvent[]>;
  /** Forget this scope entirely. */
  clear(scope: GuideMemoryScope): Promise<void>;
}

/** What a store did with what it was given, for the developer inspector. */
export interface GuideMemoryStoreDiagnostics {
  written: number;
  read: number;
  rejectedOnWrite: number;
  ignoredOnRead: number;
  bytesPersisted: number;
  /**
   * Writes that threw, as opposed to writes that were refused.
   *
   * A refusal is the boundary working. A throw is the store failing, and one of
   * them silently stopping every later write is a failure mode that cost a day
   * to find — so it is counted, and the last message is kept.
   */
  writeErrors: number;
  lastWriteError?: string;
}

/**
 * The reference store: a Map, and the validation every store must apply.
 *
 * Exists so the architecture is exercised without a network, a credential or a
 * service. `pnpm verify` uses it and nothing else.
 */
export function createInMemoryGuideMemoryStore(): GuideMemoryStore & {
  diagnostics(): GuideMemoryStoreDiagnostics;
  /** The raw persisted payload, for gates that sweep it for things it must not hold. */
  dump(): string;
} {
  const byScope = new Map<string, GuideMemoryEvent[]>();
  const diagnostics: GuideMemoryStoreDiagnostics = {
    written: 0,
    read: 0,
    rejectedOnWrite: 0,
    ignoredOnRead: 0,
    bytesPersisted: 0,
    writeErrors: 0,
  };

  const keyOf = (scope: GuideMemoryScope): string => scopeKey(scope);

  const recomputeBytes = (): void => {
    diagnostics.bytesPersisted = [...byScope.values()].reduce(
      (total, events) => total + JSON.stringify(events).length,
      0,
    );
  };

  return {
    async append(event) {
      const result = validateMemoryEvent(event);
      if (!result.ok || result.event === undefined) {
        diagnostics.rejectedOnWrite += 1;
        return;
      }
      const key = keyOf(result.event);
      const events = byScope.get(key) ?? [];
      events.push(result.event);
      byScope.set(key, events);
      diagnostics.written += 1;
      recomputeBytes();
    },
    async read(scope) {
      const stored = byScope.get(keyOf(scope)) ?? [];
      // Validated again on the way out. The store is untrusted even when it is
      // this one, because the next one will not be.
      const { accepted, ignored } = acceptMemoryEvents(stored);
      diagnostics.read += accepted.length;
      diagnostics.ignoredOnRead += ignored.length;
      return accepted;
    },
    async clear(scope) {
      byScope.delete(keyOf(scope));
      recomputeBytes();
    },
    diagnostics: () => ({ ...diagnostics }),
    dump: () => JSON.stringify([...byScope.entries()]),
  };
}

/**
 * The key a scope lives under.
 *
 * Namespaced rather than global, so one subject's history cannot be reached by
 * asking for another's, and a workspace-scoped record cannot be read by a
 * workspace-less query. These keys are internal and never appear in the
 * interface.
 */
export function scopeKey(scope: GuideMemoryScope): string {
  // Validated here, not only on the events that land under the key.
  //
  // An audit pointed out that `read` and `clear` take a scope directly and never
  // saw the event validator, so `subjectId: 'u1:workspace:w1'` produced the same
  // key as a genuine workspace scope — one bucket reachable by two identities.
  // A key built by joining has to police its own separator.
  // The three scope fields, and only those. A full event is also a valid scope —
  // that is how `append` finds its bucket — and iterating everything on it
  // rejected `occurredAt` for containing the colons a timestamp is made of.
  // Read once, validate what was read, build from what was validated.
  //
  // The first version read each field twice — once to check it and once to build
  // the key — so an own getter could pass the check and then return a different
  // value, producing a key for a subject it was never allowed to name. Same
  // defect as the event validator had, in four lines instead of four hundred.
  const appId = scope.appId;
  const subjectId = scope.subjectId;
  const workspaceId = scope.workspaceId;
  const opaque = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  for (const [field, value] of [
    ['appId', appId],
    ['subjectId', subjectId],
    ['workspaceId', workspaceId],
  ] as const) {
    // `appId` and `subjectId` are required. Letting them be absent produced the
    // literal key `statewave-guide:undefined:user:undefined`, which every scope
    // missing them would have shared.
    if (value === undefined) {
      if (field === 'workspaceId') continue;
      throw new TypeError(`guide memory scope.${field} is required`);
    }
    if (typeof value !== 'string' || !opaque.test(value)) {
      throw new TypeError(`guide memory scope.${field} must be an opaque id without separators`);
    }
  }
  const base = `statewave-guide:${appId}:user:${subjectId}`;
  return workspaceId === undefined ? base : `${base}:workspace:${workspaceId}`;
}

/**
 * A store that always fails, for proving that failure is survivable.
 *
 * Memory going down may cost personalisation. It may never cost truthfulness,
 * and the only way to know that is to run the product against a store that
 * cannot answer.
 */
export function createFailingGuideMemoryStore(
  mode: 'throw' | 'malformed' | 'unknown-kind' = 'throw',
): GuideMemoryStore {
  return {
    async append() {
      if (mode === 'throw') throw new Error('memory unavailable');
    },
    async read() {
      if (mode === 'throw') throw new Error('memory unavailable');
      if (mode === 'malformed') return [{ nonsense: true } as unknown as GuideMemoryEvent];
      return [
        {
          eventId: 'e1',
          appId: 'demo',
          subjectId: 'someone',
          kind: 'ACCOUNT_DELETED' as GuideMemoryEvent['kind'],
          occurredAt: '2026-01-01T00:00:00Z',
          authority: 'OBSERVED_INTERACTION',
        },
      ];
    },
    async clear() {
      if (mode === 'throw') throw new Error('memory unavailable');
    },
  };
}

/**
 * Where the Statewave adapter is, now that there is one.
 *
 * Closed Loop #19 wrote a paragraph here explaining that no Statewave JavaScript
 * client existed, that the only surface in this environment was an MCP tool
 * server, and that inventing an API would have proved only the invention. The
 * reasoning was sound and the premise was **wrong**: `@statewavedev/sdk` is
 * published, is on npm, has no runtime dependencies, and speaks the same `/v1`
 * HTTP API the MCP server wraps. I did not look hard enough, and the note said
 * more confidently than it had earned that the capability was absent.
 *
 * What #19 got right was the contract, which survived unchanged: an event is an
 * episode, a scope is a subject, forgetting is deleting that subject. Closed
 * Loop #20 implements exactly that in `@statewavedev/guide-statewave`, which
 * core does not and must not depend on.
 *
 * Core stays unaware on purpose. `GuideMemoryStore` is three methods; a Map
 * satisfies it, so does `localStorage`, and so does a database on the other side
 * of a network. Nothing above this line knows which one it has.
 */
export const statewaveAdapterStatus = {
  wired: true,
  adapter: '@statewavedev/guide-statewave',
  client: '@statewavedev/sdk',
  surface: 'HTTP /v1 — POST /v1/episodes, GET /v1/timeline, DELETE /v1/subjects/{id}',
  /**
   * Server-side only, and this is not a preference.
   *
   * Statewave authenticates with a server-wide `X-API-Key`, and `X-Tenant-ID` is
   * asserted by the caller rather than verified. There is no user-scoped browser
   * token, so a key in frontend code is a key given to every visitor. The
   * browser talks to the host application's own backend; the backend talks to
   * Statewave.
   */
  placement: 'HOST_BACKEND',
  contract: {
    append:
      'one GuideMemoryEvent -> one episode, source statewave-guide, type guide.interaction, idempotencyKey = eventId',
    read: "a subject's episodes -> validated GuideMemoryEvent[], oldest first",
    clear: 'DELETE the scope subject, which holds guide memory and nothing else',
    subjectNaming: 'statewave-guide:<appId>:user:<subjectId>[:workspace:<workspaceId>]',
    provenance:
      'Statewave receipts and episode ids are preserved as memory provenance. They prove a record exists; they never establish that a remembered product fact is currently true.',
  },
  /**
   * The limit worth knowing before relying on this.
   *
   * `GET /v1/timeline` returns at most 100 episodes and returns the **oldest**
   * hundred, with no pagination. Measured, not read off a doc: 105 episodes in,
   * 100 out, numbered 1..100. Past that point a subject's recent history is the
   * part that disappears, and the adapter reports the read as truncated rather
   * than pretending it was complete.
   */
  readCeiling: {
    call: 'GET /v1/timeline',
    episodes: 100,
    order: 'OLDEST_FIRST',
    pagination: 'NONE',
  },
} as const;
