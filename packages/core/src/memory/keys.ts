/**
 * The logical state a durable record stands for, rather than the moment it was observed.
 *
 * Closed Loop #20.1 stopped Guide persisting records nothing would read. It did
 * not stop the surviving records accumulating: a person who finishes the same
 * walkthrough fifty times wrote fifty durable episodes, all asserting one thing.
 * #20.1 said so plainly and declined to claim the store was bounded.
 *
 * The fix is to name the *state*. "This person finished `clients.create` on
 * build 28146cd" is one fact whatever number of times it is observed, and a key
 * that says so lets the store collapse the repetitions instead of counting them.
 *
 * **Two kinds of state, and only one of them is safe to key at ingest.**
 *
 * A completion is monotonic: once true it stays true, and re-observing it adds
 * nothing. Statewave's episode idempotency is first-write-wins over
 * `(tenant, subject, idempotency_key)`, which is exactly right for that — the
 * first observation lands and the rest are no-ops.
 *
 * A preference is not. Its whole content is a value that changes, and
 * first-write-wins would pin it to whatever somebody chose first: measured on a
 * real server, `FULL → CONCISE → FULL → CONCISE` under one ingest key stores one
 * episode reading `FULL`, and the three later choices are gone. So the
 * preference key is defined here and deliberately not used as an idempotency
 * key. It is the shape a claim key will take once Statewave has a namespace a
 * consumer can register — the open half of statewave#369 — where supersession,
 * not deduplication, is what resolves it.
 *
 * @packageDocumentation
 */

import type { GuideMemoryEvent } from './events.js';

/** The namespace every Guide state key is written under. */
export const GUIDE_STATE_NAMESPACE = 'guide.state';

/**
 * What a key stands for.
 *
 * `COMPLETION` is monotonic and safe to deduplicate at ingest. `PREFERENCE` is a
 * value that changes and must be superseded, never deduplicated.
 */
export type GuideStateKind = 'COMPLETION' | 'PREFERENCE';

export interface GuideStateKey {
  kind: GuideStateKind;
  /** The joined key, stable for the same logical state. */
  key: string;
  /**
   * Whether first-write-wins deduplication is the correct resolution.
   *
   * True only for monotonic state. A false value here does not mean "no key" —
   * it means the key needs supersession, which is a different mechanism.
   */
  dedupeOnWrite: boolean;
}

// The same shape `scopeKey` polices, for the same reason: a key built by joining
// has to refuse anything containing its separator, or two different states can
// be spelled into one.
const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const part = (label: string, value: string): string => {
  if (!OPAQUE.test(value)) {
    throw new TypeError(`guide state key ${label} must be an opaque id without separators`);
  }
  return value;
};

/**
 * The logical state key for an event, or `undefined` when it stands for none.
 *
 * Takes an event that has already been through `validateMemoryEvent`. Every
 * field is read once and the key is built from what was read — the same
 * discipline as `scopeKey`, and for the same reason: a getter that answers
 * differently the second time could otherwise produce a key for a state it was
 * never allowed to name.
 *
 * `appId` and `workspaceId` are in the key even though Statewave's idempotency
 * is already scoped per subject, and the subject already encodes both. The
 * redundancy buys independence: the subject mapping is a separate decision, and
 * a key that carries its own scope keeps two workspaces' completions apart even
 * if that mapping is ever narrowed.
 */
export function guideStateKey(event: GuideMemoryEvent): GuideStateKey | undefined {
  const kind = event.kind;
  const appId = event.appId;
  const workspaceId = event.workspaceId;
  const featureId = event.featureId;
  const applicationVersion = event.applicationVersion;
  const preference = event.metadata?.preference;

  const scope = [
    part('appId', appId),
    ...(workspaceId === undefined ? [] : [part('workspaceId', workspaceId)]),
  ];

  if (kind === 'STEP_THROUGH_COMPLETED') {
    // A completion belongs to the build it happened on — the version rule
    // Closed Loop #19 froze. Without the version in the key, finishing a guide
    // once would mark it finished for every future build of those steps.
    if (featureId === undefined || applicationVersion === undefined) return undefined;
    return {
      kind: 'COMPLETION',
      key: [
        GUIDE_STATE_NAMESPACE,
        'completion',
        ...scope,
        part('featureId', featureId),
        part('applicationVersion', applicationVersion),
      ].join(':'),
      dedupeOnWrite: true,
    };
  }

  if (kind === 'EXPLICIT_PREFERENCE_SET') {
    // Deliberately NOT version-scoped: somebody who asked for concise answers in
    // March did not withdraw the request by the product shipping in April. Same
    // rule the profile projection already applies.
    if (typeof preference !== 'string') return undefined;
    return {
      kind: 'PREFERENCE',
      key: [GUIDE_STATE_NAMESPACE, 'preference', ...scope, part('preference', preference)].join(
        ':',
      ),
      // The value changes. Deduplicating would keep the first answer forever.
      dedupeOnWrite: false,
    };
  }

  return undefined;
}

/**
 * The key to hand a store that resolves collisions by keeping the first write.
 *
 * Returns the logical state key only when that is the honest thing to
 * deduplicate on, and the event's own id otherwise — so a retry still collapses
 * to one record, which is what the id was always for.
 */
export function ingestKeyFor(event: GuideMemoryEvent): string {
  const state = guideStateKey(event);
  return state !== undefined && state.dedupeOnWrite ? state.key : event.eventId;
}

/**
 * The claim keys a host registers with Statewave, one per preference name.
 *
 * Statewave validates a registered key as lowercase dotted segments, so this is
 * a different spelling from the colon-joined state key above — and deliberately
 * a much smaller one. The scope is *not* in it: a claim buckets within a
 * Statewave subject, and the subject already encodes app, user and workspace,
 * so putting them in the key again would mint a key per workspace and blow
 * through the 64-key registration limit for no isolation that does not already
 * exist.
 *
 * Registered by the host operator, once, with:
 *
 *     PATCH /admin/tenants/{id}/config
 *     { "claim_keys": { "guide.preference.guidancedetail": "single" } }
 *
 * `single` is what makes a later value supersede an earlier one instead of
 * coexisting with it. An unregistered key is not merely non-authoritative —
 * Statewave stores no claim at all — so a host that skips this step gets the
 * pre-#20.2 behaviour rather than a broken one.
 */
export const GUIDE_PREFERENCE_CLAIM_KEYS: Readonly<Record<string, string>> = Object.freeze({
  guidanceDetail: 'guide.preference.guidancedetail',
  assistanceMode: 'guide.preference.assistancemode',
});

/** The preference name a registered claim key stands for, or `undefined`. */
export function preferenceForClaimKey(claimKey: unknown): string | undefined {
  if (typeof claimKey !== 'string') return undefined;
  for (const [preference, key] of Object.entries(GUIDE_PREFERENCE_CLAIM_KEYS)) {
    if (key === claimKey) return preference;
  }
  return undefined;
}

/**
 * The closed vocabulary a claim value is allowed to come back as.
 *
 * Statewave canonicalises a v1 claim value by lowercasing it, so `CONCISE` is
 * stored and returned as `concise`. Mapping it back has to be a lookup in a
 * closed set rather than an upper-casing rule: upper-casing would faithfully
 * turn any value the server happened to hold — including one Guide never wrote
 * — into something that looks like a preference this product understands.
 */
const PREFERENCE_VALUES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  guidanceDetail: Object.freeze(['AUTO', 'CONCISE', 'FULL']),
  assistanceMode: Object.freeze(['AUTO', 'SHOW_ME', 'STEP_THROUGH']),
});

/** The canonical form Statewave stores for a preference value. */
export function canonicalPreferenceValue(value: string): string {
  return value.toLowerCase();
}

/**
 * The vocabulary member a canonical value stands for, or `undefined`.
 *
 * `undefined` is the right answer for anything unrecognised, and the caller
 * must drop it rather than guess: a value that is not in this product's
 * vocabulary is not this product's preference.
 */
export function preferenceValueFromCanonical(
  preference: string,
  canonical: unknown,
): string | undefined {
  if (typeof canonical !== 'string') return undefined;
  const allowed = PREFERENCE_VALUES[preference];
  if (allowed === undefined) return undefined;
  return allowed.find((value) => canonicalPreferenceValue(value) === canonical);
}
