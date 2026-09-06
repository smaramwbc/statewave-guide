/**
 * Guide memory, kept in Statewave.
 *
 * Closed Loop #19 built the memory layer against a Map and a browser, and said
 * in code that no Statewave client existed to wire it to. That was wrong, and
 * the correction is the reason this file exists: `@statewavedev/sdk` is
 * published, has no runtime dependencies, and speaks the same `/v1` HTTP API the
 * MCP server wraps. What #19 got right was the contract — an event is an
 * episode, a scope is a subject, forgetting is deleting the subject — and this
 * adapter implements exactly that mapping and nothing more.
 *
 * ## Where this runs
 *
 * **On a server, never in a browser.** Statewave authenticates with a
 * server-wide `X-API-Key` and a client-asserted `X-Tenant-ID`; there is no
 * user-scoped browser token, so a key in frontend code would be a key handed to
 * every visitor. The browser talks to the host application's own backend, and
 * the backend talks to Statewave. Nothing in this package imports a DOM API, and
 * nothing in `@statewavedev/guide-core` imports this package.
 *
 * ## What crosses the boundary
 *
 * The plain object `validateMemoryEvent` returns, and nothing else. Not the
 * caller's object — an audit of #19 put a raw question, an email, an instance
 * label and a secret into a store through an inherited `toJSON` that the
 * own-property scan could not see. The same rule applies with more force here,
 * because the destination is a network.
 *
 * ## What Statewave is not allowed to become
 *
 * A receipt proves Statewave stored a record. It does not prove the remembered
 * thing is true now. Nothing read back from here reaches feature resolution,
 * and a remembered completion cannot make an action appear, a permission pass,
 * or a refusal turn into an answer.
 *
 * @packageDocumentation
 */

import {
  GUIDE_PREFERENCE_CLAIM_KEYS,
  acceptMemoryEvents,
  canonicalPreferenceValue,
  ingestKeyFor,
  isDurableRemoteEvent,
  preferenceForClaimKey,
  preferenceValueFromCanonical,
  scopeKey,
  validateMemoryEvent,
} from '@statewavedev/guide-core';
import type {
  GuideMemoryEvent,
  GuideMemoryScope,
  GuideMemoryStore,
  GuideMemoryStoreDiagnostics,
} from '@statewavedev/guide-core';
import type { Episode, StatewaveClient } from '@statewavedev/sdk';

/**
 * The `source` every Guide episode carries.
 *
 * Statewave subjects can hold episodes from anything. This is how a Guide read
 * ignores what it did not write, so a subject shared with another producer does
 * not turn that producer's records into guide memory.
 */
export const GUIDE_EPISODE_SOURCE = 'statewave-guide';

/** The `type` every Guide episode carries. One kind of thing is written here. */
export const GUIDE_EPISODE_TYPE = 'guide.interaction';

/**
 * How many episodes `GET /v1/timeline` returns, and which ones.
 *
 * Measured against a real server rather than read off a doc: inserting 105
 * episodes and reading the timeline returns exactly 100, and they are the
 * **oldest** hundred — `n` ran 1..100 and the five most recent were absent.
 * There is no pagination parameter on the endpoint.
 *
 * This is the sharpest limit on the adapter, and it is not hidden: a read that
 * comes back at exactly this size is reported as `truncated`, because past it a
 * subject's *recent* history is the part that disappears.
 */
export const STATEWAVE_TIMELINE_CEILING = 100;

/**
 * How many episodes one read asks for.
 *
 * `GET /v1/timeline` caps `limit` at 200 per collection. Guide asks for the
 * maximum because its durable set is now keyed state — one record per completed
 * feature per build, one per preference — so 200 is a large number of *distinct
 * facts*, not a large number of repetitions.
 */
export const STATEWAVE_READ_LIMIT = 200;

/**
 * What the adapter is doing, for a developer surface. Never shown to a user.
 *
 * Describes the **last** call, not the lifetime. `readFailures`,
 * `writeFailures` and `lastFailure` are the history; a mode that never returns
 * to `REMOTE` after one bad response tells a developer the system is broken long
 * after it recovered.
 */
export type StatewaveMemoryMode = 'REMOTE' | 'REMOTE_DEGRADED';

export interface StatewaveMemoryDiagnostics extends GuideMemoryStoreDiagnostics {
  mode: StatewaveMemoryMode;
  /** Episodes Statewave returned, before Guide validated any of them. */
  recordsFetched: number;
  /** Reads that could not complete. Personalisation is lost; guidance is not. */
  readFailures: number;
  /** Writes that could not complete. */
  writeFailures: number;
  /**
   * A read came back at the server's ceiling, so older events may be all there
   * is and newer ones may be unreachable.
   */
  truncatedReads: number;
  /** Why the last failure happened, in the adapter's words rather than a stack. */
  lastFailure?: string;
  /**
   * Events the retention policy declined to make durable.
   *
   * Deliberately not folded into `rejectedOnWrite`. A rejection means a record
   * was malformed or hostile and somebody should look; a withheld record means
   * the policy worked. Counting them together would leave an inspector showing
   * a rejection rate climbing steadily through completely normal use.
   */
  withheldByPolicy: number;
  /**
   * Preferences the last read resolved from an active Statewave claim.
   *
   * Zero is the ordinary answer for a host that has not registered the claim
   * keys, and means preferences fell back to replaying the episodes — the
   * pre-#20.2 behaviour, which is correct but unbounded. A developer looking
   * for "is keyed state actually on?" needs one number, not a shrug.
   */
  activeClaims: number;
  /** Statewave's own ids for what this process wrote, newest last. */
  episodeIds: readonly string[];
}

export interface StatewaveGuideMemoryStoreOptions {
  /**
   * A configured `StatewaveClient`. Constructed by the host, so the credential
   * and the base URL are the host's business and never this package's.
   */
  client: Pick<StatewaveClient, 'createEpisode' | 'getTimeline' | 'deleteSubject'>;
  /**
   * How long any one call may take before personalisation is given up on.
   *
   * Guidance never waits on this — the answer is already computed — but a memory
   * read that hangs would leave a returning user looking at a first-time screen
   * for as long as the socket stays open.
   */
  timeoutMs?: number;
}

export interface StatewaveGuideMemoryStore extends GuideMemoryStore {
  diagnostics(): StatewaveMemoryDiagnostics;
}

/**
 * The Statewave subject a Guide scope lives under.
 *
 * Deliberately `scopeKey` and not a second scheme. It is already hardened —
 * every part must be an opaque id with no separators, so one subject cannot
 * forge another's key — and using it means `deleteSubject` erases exactly this
 * app's memory for this person in this workspace and nothing else. A subject
 * shared with unrelated Statewave data would make "reset Guide memory" into a
 * button that deletes somebody's other records.
 */
/**
 * An ISO timestamp narrowed to the millisecond precision guide events allow.
 *
 * `undefined` for anything that is not a timestamp this can narrow — the
 * caller drops the record rather than inventing a time for it.
 */
function toMillisecondIso(value: string): string | undefined {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(
    value,
  );
  if (match === null) return undefined;
  const [, stamp, fraction, zone] = match;
  const millis = fraction === undefined ? '' : `.${fraction.slice(0, 3)}`;
  return `${stamp}${millis}${zone}`;
}

/** The stored payload without the candidate block this adapter attaches. */
function withoutCandidates(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload;
  const source = payload as Record<string, unknown>;
  const plain: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    if (key === 'statewave') continue;
    plain[key] = source[key];
  }
  return plain;
}

/**
 * The preference events Statewave's active claims stand for.
 *
 * Every value is re-derived through the closed vocabulary and then through the
 * full event validator, so a memory an operator edited — or one some other
 * producer wrote under a key that happens to look like Guide's — cannot become
 * a preference. A row that fails any of it is dropped, not repaired.
 *
 * `template` supplies the scope. It is taken from an event that already passed
 * validation and already proved it belongs to this subject, so the synthesised
 * record inherits an identity that was checked rather than one assembled here.
 */
function activePreferenceEvents(
  memories: readonly Record<string, unknown>[],
  belongs: readonly GuideMemoryEvent[],
  subject: string,
): GuideMemoryEvent[] {
  const template = belongs[0];
  if (template === undefined) return [];

  const out: GuideMemoryEvent[] = [];
  const seen = new Set<string>();
  for (const memory of memories) {
    if (memory['status'] !== 'active') continue;
    const metadata = memory['metadata'];
    if (typeof metadata !== 'object' || metadata === null) continue;
    const claim = (metadata as Record<string, unknown>)['claim'];
    if (typeof claim !== 'object' || claim === null) continue;

    const preference = preferenceForClaimKey((claim as Record<string, unknown>)['key']);
    if (preference === undefined) continue;
    const value = preferenceValueFromCanonical(
      preference,
      (claim as Record<string, unknown>)['value'],
    );
    // Not in this product's vocabulary, so not this product's preference.
    if (value === undefined) continue;
    // One active claim per key is what `single` cardinality means. A second is
    // a server Guide does not recognise, and guessing between them would be
    // inventing an answer.
    if (seen.has(preference)) continue;
    seen.add(preference);

    const id = memory['id'];
    // The moment the person chose it, which is what the claim carries and what
    // the resolver ordered by. The memory row's own `valid_from` is the
    // episode's temporal anchor and can be the compile time, so preferring it
    // would date every preference to when Statewave got round to compiling.
    const chosenAt =
      (claim as Record<string, unknown>)['valid_from'] ??
      memory['valid_from'] ??
      memory['validFrom'];
    if (typeof id !== 'string' || typeof chosenAt !== 'string') continue;
    // Postgres hands back microseconds; guide events are validated at
    // millisecond precision. Truncating rather than rounding keeps the value
    // ordered the same way, and a timestamp that will not narrow is dropped
    // rather than reshaped into something that merely looks valid.
    const occurredAt = toMillisecondIso(chosenAt);
    if (occurredAt === undefined) continue;

    const candidate = {
      eventId: id,
      appId: template.appId,
      subjectId: template.subjectId,
      ...(template.workspaceId === undefined ? {} : { workspaceId: template.workspaceId }),
      kind: 'EXPLICIT_PREFERENCE_SET',
      occurredAt,
      applicationVersion: template.applicationVersion,
      authority: 'EXPLICIT_USER_PREFERENCE',
      metadata: { preference, value },
    };
    const result = validateMemoryEvent(candidate);
    if (!result.ok || result.event === undefined) continue;
    if (statewaveSubjectFor(result.event) !== subject) continue;
    out.push(result.event);
  }
  return out;
}

/**
 * The structured memory candidate that makes a preference supersede its
 * predecessor, or `undefined` when the event is not a preference.
 *
 * Built from the validated snapshot only. `text` is derived from the two closed
 * vocabularies — a preference name and one of its allowed values — so no free
 * text, no page state and nothing a person typed can reach it.
 */
function preferenceClaimFor(event: GuideMemoryEvent): Record<string, unknown> | undefined {
  if (event.kind !== 'EXPLICIT_PREFERENCE_SET') return undefined;
  const preference = event.metadata?.preference;
  const value = event.metadata?.value;
  if (typeof preference !== 'string' || typeof value !== 'string') return undefined;
  const claimKey = GUIDE_PREFERENCE_CLAIM_KEYS[preference];
  if (claimKey === undefined) return undefined;

  return {
    memory_candidates: [
      {
        kind: 'domain_fact',
        text: `${preference} ${value}`,
        metadata: {},
        claim: {
          key: claimKey,
          value: canonicalPreferenceValue(value),
          // The moment the person chose it. Statewave orders a claim bucket by
          // this, so without it two choices in one compile fall through to a
          // random tie-break — measured, before statewave#373 fixed the
          // default.
          valid_from: event.occurredAt,
          schema_version: 1,
        },
      },
    ],
  };
}

export function statewaveSubjectFor(scope: GuideMemoryScope): string {
  return scopeKey(scope);
}

/** An `AbortSignal` that fires after a bound, without depending on a timer API shape. */
function deadline(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/**
 * Guide memory in Statewave.
 *
 * Three methods, matching the three the rest of the system already knows. There
 * is no query language here and no search: a read is one subject's episodes,
 * validated, oldest first. Anything richer would be a second knowledge base, and
 * this project has one.
 */
export function createStatewaveGuideMemoryStore(
  options: StatewaveGuideMemoryStoreOptions,
): StatewaveGuideMemoryStore {
  const { client } = options;
  const timeoutMs = options.timeoutMs ?? 5000;
  const episodeIds: string[] = [];
  const diagnostics: StatewaveMemoryDiagnostics = {
    written: 0,
    read: 0,
    rejectedOnWrite: 0,
    ignoredOnRead: 0,
    bytesPersisted: 0,
    writeErrors: 0,
    mode: 'REMOTE',
    recordsFetched: 0,
    readFailures: 0,
    writeFailures: 0,
    truncatedReads: 0,
    withheldByPolicy: 0,
    activeClaims: 0,
    episodeIds,
  };

  const degrade = (why: string): void => {
    diagnostics.mode = 'REMOTE_DEGRADED';
    diagnostics.lastFailure = why;
  };

  return {
    async append(event) {
      // Validated here, and what is sent is what validation returned. The
      // caller's object never reaches the wire: a getter that changes between
      // the check and the send, or a `toJSON` on a prototype, would otherwise
      // decide the request body.
      const result = validateMemoryEvent(event);
      if (!result.ok || result.event === undefined) {
        diagnostics.rejectedOnWrite += 1;
        return;
      }
      const validated = result.event;

      // Retention is decided after validation and before anything is counted or
      // sent. After, because the kind has to be one validation vouched for
      // rather than one the caller asserted; before, because a record that will
      // not be kept should not appear in the bytes-persisted total either.
      //
      // The two kinds this drops — one written per answer shown, one per fold
      // opened — are the highest-volume records Guide produces and the only two
      // that cannot change a later presentation. Keeping them meant a subject
      // spent its hundred-episode read window on records nothing would ever
      // read back.
      if (!isDurableRemoteEvent(validated)) {
        diagnostics.withheldByPolicy += 1;
        return;
      }

      const payload = JSON.parse(JSON.stringify(validated)) as Record<string, unknown>;

      // A preference is a value that changes, so it cannot be deduplicated at
      // ingest the way a completion can — the first answer would win forever.
      // What it can be is *superseded*, and Statewave does that through a claim
      // envelope on a structured memory candidate.
      //
      // The candidate is built only from fields validation already vouched for,
      // and the text is two closed-vocabulary tokens rather than anything a
      // person typed: the rule that what is sent is what was validated does not
      // get an exception for being convenient.
      //
      // Inert unless the host registered the key. Statewave stores no claim for
      // an unregistered key, so this costs a few bytes and changes nothing.
      const claim = preferenceClaimFor(validated);
      if (claim !== undefined) payload['statewave'] = claim;

      diagnostics.bytesPersisted += JSON.stringify(payload).length;

      const { signal, done } = deadline(timeoutMs);
      try {
        const episode = await client.createEpisode(
          {
            subjectId: statewaveSubjectFor(validated),
            source: GUIDE_EPISODE_SOURCE,
            type: GUIDE_EPISODE_TYPE,
            payload,
            // No metadata and no provenance. Both are free-form bags that
            // Statewave passes through verbatim, which makes them exactly the
            // place a well-meaning change would start posting page state.
            metadata: {},
            provenance: {},
            // The logical state this record stands for, where there is one.
            //
            // A retry was always meant to collapse to a single episode, and the
            // event id did that. What it could not do is collapse a *repeat*:
            // finishing the same walkthrough on the same build fifty times is
            // one fact, and it wrote fifty durable episodes. Statewave resolves
            // an idempotency collision by keeping the first write, which is
            // exactly right for a fact that once true stays true.
            //
            // `ingestKeyFor` falls back to the event id for everything else, so
            // a preference — whose whole content is a value that changes — is
            // never deduplicated into its first answer.
            idempotencyKey: ingestKeyFor(validated),
          },
          { signal },
        );
        episodeIds.push(episode.id);
        diagnostics.written += 1;
        diagnostics.mode = 'REMOTE';
      } catch (error) {
        // A write that did not land costs personalisation and nothing else. The
        // interaction it describes already happened and the guidance that
        // prompted it was already correct.
        diagnostics.writeFailures += 1;
        diagnostics.writeErrors += 1;
        degrade(error instanceof Error ? error.message : 'write failed');
      } finally {
        done();
      }
    },

    async read(scope) {
      // Inside the try. `statewaveSubjectFor` throws on a scope it will not build
      // a key from, and a read that throws at the caller is a memory failure
      // turning into an error in a path that was promised absence.
      const { signal, done } = deadline(timeoutMs);
      let subject: string;
      let episodes: readonly Episode[];
      let memories: readonly Record<string, unknown>[] = [];
      let degradedThisCall = false;
      try {
        subject = statewaveSubjectFor(scope);
        // The most recent `STATEWAVE_READ_LIMIT` records, not the oldest
        // hundred. Until server v1.5.0 the route took no parameters at all and
        // answered with its default page, which is the oldest end — so a
        // subject past the ceiling lost precisely the half a memory system
        // exists to have. `newestFirst` is the fix, shipped in statewave#363.
        //
        // Rows still arrive in ascending chronological order; this chooses
        // which rows, not how they are sorted, so nothing downstream reorders.
        const timeline = await client.getTimeline(
          subject,
          { limit: STATEWAVE_READ_LIMIT, newestFirst: true },
          { signal },
        );
        // `?? []` is not a guard. A server — or a proxy in front of one —
        // answering with `episodes: "none"` produced a TypeError inside the
        // read, which is a memory failure turning into a thrown error in a
        // caller that was promised absence instead.
        if (Array.isArray(timeline?.episodes)) {
          episodes = timeline.episodes;
          // Memories are read for one purpose: the active claim that says what
          // a preference currently is. Absent or malformed, preferences simply
          // fall back to the episodes, which is what this adapter did before.
          memories = Array.isArray(timeline?.memories)
            ? (timeline.memories as unknown as Record<string, unknown>[])
            : [];
        } else {
          // A 200 whose body is not the shape the contract promises is a failed
          // read wearing a success code. Returning absence is right; calling it
          // healthy is not.
          episodes = [];
          diagnostics.readFailures += 1;
          degradedThisCall = true;
          degrade('the timeline response was not the documented shape');
        }
      } catch (error) {
        // No memory is the memory-off state, which the whole system is built to
        // be indistinguishable from.
        diagnostics.readFailures += 1;
        degrade(error instanceof Error ? error.message : 'read failed');
        return [];
      } finally {
        done();
      }

      diagnostics.recordsFetched += episodes.length;
      if (episodes.length >= STATEWAVE_READ_LIMIT) {
        // At the ceiling, a complete read and a truncated one are the same
        // response. Reporting the possibility is right; it is deliberately not
        // called a failure, and it does not stick to later reads that came back
        // under the ceiling.
        diagnostics.truncatedReads += 1;
        diagnostics.lastFailure = `timeline returned the full page of ${STATEWAVE_READ_LIMIT} episodes, so older events may exist beyond it`;
        diagnostics.mode = 'REMOTE_DEGRADED';
      } else if (!degradedThisCall) {
        // `mode` describes the last call, not the history — the counters are the
        // history. Gating recovery on a lifetime failure count was the same
        // latching bug in a longer form: one blip and every later read reported
        // a broken system. `degradedThisCall` is what stops the recovery from
        // overwriting a degradation this very call already recorded.
        diagnostics.mode = 'REMOTE';
      }

      // Only what this adapter wrote. A subject may hold episodes from anything.
      const mine = episodes.filter(
        (episode) => episode.source === GUIDE_EPISODE_SOURCE && episode.type === GUIDE_EPISODE_TYPE,
      );

      // Validated on the way out exactly as on the way in. Statewave is
      // untrusted persistence in precisely the sense `localStorage` is: a record
      // can be written by something else, or edited by an operator, and shape is
      // the only thing that decides whether it is guide memory.
      // The candidate block is a sibling of the event, not part of it.
      //
      // Statewave's structured-candidate contract puts candidates at
      // `payload.statewave`, and the payload is also the guide event verbatim —
      // so the key this adapter adds on write has to come off again on read, or
      // the validator refuses the whole record as carrying a foreign field.
      // It did, silently, and every preference was ignored on the way out.
      //
      // Stripped by rebuilding from the payload's own keys rather than by
      // deleting from it: what gets validated is a plain object this function
      // constructed, which is the same discipline as the write path.
      const { accepted, ignored } = acceptMemoryEvents(
        mine.map((episode) => withoutCandidates(episode.payload)),
      );

      // And the record must belong in the subject it was found under. The key is
      // not the authority on whose history this is; the event is.
      const belongs = accepted.filter((event) => statewaveSubjectFor(event) === subject);

      // The currently-authoritative preference, where Statewave has resolved
      // one. This is the only place the adapter reads a compiled memory, and it
      // reads exactly one field of it — the claim envelope Guide itself wrote.
      // See ADR 0032, which is amended rather than contradicted by this: the
      // rule is that a compiler's *prose* may never become product truth, and
      // `content` is not read here at all.
      const resolved = activePreferenceEvents(memories, belongs, subject);

      diagnostics.activeClaims = resolved.length;
      const withPreferences =
        resolved.length === 0
          ? belongs
          : // Statewave has said which preference is current, so the episodes
            // that recorded the changes are history. Keeping both would leave
            // the projection resolving a question that has already been
            // answered, from records the answer supersedes.
            [...belongs.filter((event) => event.kind !== 'EXPLICIT_PREFERENCE_SET'), ...resolved];

      diagnostics.read += withPreferences.length;
      diagnostics.ignoredOnRead +=
        episodes.length - mine.length + ignored.length + (accepted.length - belongs.length);
      return withPreferences;
    },

    async clear(scope) {
      // Whole-subject deletion is the only deletion Statewave offers, and it is
      // the right one *because* the subject is the Guide scope. Reset erases
      // this app's memory of this person in this workspace, and cannot reach a
      // record Guide did not write — a shared subject would have made this
      // button delete somebody's unrelated memories.
      //
      // **It forgets one scope, and a person in three workspaces is three
      // scopes.** `clear({ appId, subjectId })` deletes the workspace-less
      // subject and leaves `…:workspace:w1` and `…:workspace:w2` standing. An
      // audit called that "forget me does not forget", and it is right that the
      // natural reading of the button is wider than the behaviour. It is not
      // silently partial: a host that offers a workspace-wide reset must call
      // this once per workspace it put the person in, because nothing here can
      // enumerate them — Statewave's subject listing is tenant-wide and is not a
      // prefix query, and walking it would be this adapter reading other
      // products' subjects to find its own.
      const { signal, done } = deadline(timeoutMs);
      try {
        await client.deleteSubject(statewaveSubjectFor(scope), { signal });
        diagnostics.mode = 'REMOTE';
      } catch (error) {
        diagnostics.writeFailures += 1;
        degrade(error instanceof Error ? error.message : 'reset failed');
        // Rethrown: a reset that silently did not happen is worse than one that
        // failed loudly, because the user was told they were forgotten.
        throw error;
      } finally {
        done();
      }
    },

    diagnostics: () => ({ ...diagnostics, episodeIds: [...episodeIds] }),
  };
}
