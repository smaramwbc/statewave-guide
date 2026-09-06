/**
 * What happened before, and nothing about what is true.
 *
 * Eighteen loops of this project have been spent deciding what may establish a
 * product fact. Memory establishes none of them. It answers exactly one
 * question — *what has this person done with the guide before* — and the moment
 * it is asked *what is true now* the answer comes from somewhere else.
 *
 * The separation is easiest to see in the case it was hardest to hold. A user
 * who opened `INV-001` on the invoices screen yesterday has not made the rows on
 * a client screen into invoices today. That relationship is missing from the
 * ProductModel, it was missing yesterday too, and a record of somebody's
 * behaviour is not evidence about a product.
 *
 * ## What is stored
 *
 * Semantic identifiers and bounded counters. Not questions, not answers, not
 * anything the interface rendered. The forbidden list is long and specific
 * because every item on it is a plausible thing to store and a bad thing to
 * keep: a query is a person's words, a runtime instance name is one row on one
 * screen at one moment, and an accessible name can be a key.
 *
 * A stored event is `{ featureId, kind }` plus scope. That is enough to adapt a
 * presentation and too little to reconstruct a session.
 *
 * @packageDocumentation
 */

/**
 * The closed set of things worth remembering.
 *
 * Deliberately small. Each one is an interaction a person actually had with the
 * guide, and each supports exactly one adaptation — which is the test for
 * whether a new kind belongs here at all.
 */
export type GuideMemoryEventKind =
  /** Guidance for a feature was shown. */
  | 'GUIDANCE_VIEWED'
  /** The user asked to be shown where something is. */
  | 'SHOW_ME_USED'
  /** The user began working through the steps one at a time. */
  | 'STEP_THROUGH_STARTED'
  /** The user reached the end of them. The only evidence of completion. */
  | 'STEP_THROUGH_COMPLETED'
  /** The user expanded steps that had been collapsed. */
  | 'FULL_STEPS_EXPANDED'
  /** The user chose a presentation preference for themselves. */
  | 'EXPLICIT_PREFERENCE_SET';

/**
 * Frozen, not merely typed readonly.
 *
 * `readonly` is a compile-time promise and this array is a runtime validation
 * input: an audit pushed `ACCOUNT_DELETED` onto it and watched the validator
 * start accepting the exact kind the failing-store fixture uses as its canary.
 */
export const GUIDE_MEMORY_EVENT_KINDS: readonly GuideMemoryEventKind[] = Object.freeze([
  'GUIDANCE_VIEWED',
  'SHOW_ME_USED',
  'STEP_THROUGH_STARTED',
  'STEP_THROUGH_COMPLETED',
  'FULL_STEPS_EXPANDED',
  'EXPLICIT_PREFERENCE_SET',
]);

/**
 * Where a piece of remembered knowledge gets its standing.
 *
 * The distinction that keeps the guide honest about its own certainty. Three
 * `SHOW_ME_USED` events are an observation; they are not the sentence *you
 * prefer Show me*, which is a claim about a person's mind that only that person
 * can make. Saying the second when only the first happened is the small lie
 * that makes a product feel presumptuous.
 */
export type GuideMemoryAuthority =
  /** It happened. The event was recorded when the interaction occurred. */
  | 'OBSERVED_INTERACTION'
  /** The user said so, explicitly, by choosing it. */
  | 'EXPLICIT_USER_PREFERENCE'
  /** A deterministic projection over observations. Never described as a wish. */
  | 'DERIVED_ADAPTATION';

export const GUIDE_MEMORY_AUTHORITIES: readonly GuideMemoryAuthority[] = Object.freeze([
  'OBSERVED_INTERACTION',
  'EXPLICIT_USER_PREFERENCE',
  'DERIVED_ADAPTATION',
]);

/** The bounded values a preference event may carry. */
export type GuidanceDetailPreference = 'AUTO' | 'CONCISE' | 'FULL';
export type AssistanceModePreference = 'AUTO' | 'SHOW_ME' | 'STEP_THROUGH';

export const GUIDANCE_DETAIL_VALUES: readonly GuidanceDetailPreference[] = Object.freeze([
  'AUTO',
  'CONCISE',
  'FULL',
]);
export const ASSISTANCE_MODE_VALUES: readonly AssistanceModePreference[] = Object.freeze([
  'AUTO',
  'SHOW_ME',
  'STEP_THROUGH',
]);

/**
 * The only metadata an event may carry.
 *
 * A closed shape rather than a free record, because `metadata` is where every
 * memory system eventually starts keeping the thing it promised not to.
 */
export interface GuideMemoryEventMetadata {
  /** Which preference was set, for `EXPLICIT_PREFERENCE_SET` only. */
  preference?: 'guidanceDetail' | 'assistanceMode';
  /** The chosen value. Bounded by the unions above. */
  value?: GuidanceDetailPreference | AssistanceModePreference;
  /** How many steps the guidance had, for completion events. A small integer. */
  stepCount?: number;
}

/**
 * One thing that happened, scoped to who it happened to.
 *
 * `subjectId` and `workspaceId` are opaque ids the host supplies. They are never
 * derived from anything on screen — not an email in the DOM, not a client
 * record, not a route — because identity read off a page is whoever is being
 * displayed rather than whoever is looking.
 */
export interface GuideMemoryEvent {
  eventId: string;
  appId: string;
  subjectId: string;
  workspaceId?: string;
  featureId?: string;
  kind: GuideMemoryEventKind;
  /** Supplied by the caller. Adaptation never reads a clock of its own. */
  occurredAt: string;
  /**
   * The build this happened against.
   *
   * Feature history is scoped by it: a guide completed against a version the
   * application has moved past is history, not a reason to collapse today's
   * instructions.
   */
  applicationVersion?: string;
  authority: GuideMemoryAuthority;
  metadata?: GuideMemoryEventMetadata;
}

/** Field names an event may carry. Anything else is discarded on the way in. */
const ALLOWED_EVENT_FIELDS: readonly string[] = [
  'eventId',
  'appId',
  'subjectId',
  'workspaceId',
  'featureId',
  'kind',
  'occurredAt',
  'applicationVersion',
  'authority',
  'metadata',
];
const ALLOWED_METADATA_FIELDS: readonly string[] = ['preference', 'value', 'stepCount'];

/**
 * Shapes that must never be written down, whatever field they arrive in.
 *
 * The same policy the runtime-instance and runtime-language layers use. A
 * `featureId` is supposed to be a semantic identifier and a caller can put
 * anything in a string, so the check is applied to the values rather than
 * trusted from the types.
 */
const LONG_HEX = /\b[A-Fa-f0-9]{32,}\b/;
const SECRET_SHAPED: readonly RegExp[] = [
  /(sk|pk|api|key|tok|tkn|sess|pat|ghp|priv)[-_][A-Za-z0-9_-]{6,}/i,
  LONG_HEX,
  /\beyJ[A-Za-z0-9_-]{4,}\./,
  /^\s*(bearer|basic|token)\s+\S{8,}/i,
  /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/,
  // Credential shapes that carry no underscore-separated prefix. An audit
  // pointed out that the list above recognises the vendors who happen to use
  // one, which is a rule about naming conventions rather than about secrets.
  /\bAKIA[0-9A-Z]{12,}\b/,
  /\bASIA[0-9A-Z]{12,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /\bxox[abposr]-[0-9A-Za-z-]{10,}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/**
 * Runtime instance labels, which look like identifiers and are not.
 *
 * `INV-001` names one row on one screen at one moment. Closed Loop #16 made it
 * addressable for exactly as long as that screen exists; persisting it would
 * turn a within-snapshot handle into a durable identity nobody granted it.
 */
const INSTANCE_SHAPED = /^[A-Za-z]{2,8}[-_]?\d{2,}$/;

/** A semantic id: dotted, lowercase, and nothing a person typed. */
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:[-.][a-z0-9]+)*$/;

/**
 * An ISO timestamp, and nothing else.
 *
 * `occurredAt` was exempted from the length and prose checks because a
 * timestamp contains a `T` and a `:` and would have tripped them. An audit
 * pointed out what that exemption actually bought: the one field in the record
 * that accepted a raw user question verbatim. Exempting a field from the general
 * rules means giving it a specific one.
 */
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * A build identity: hex, semver, a tag. Never a sentence.
 *
 * Same lesson. This field is exempt from the long-hex secret rule because build
 * ids are hashes, and the first version of that exemption also let through 128
 * characters of prose and anything with a space in it.
 */
const BUILD_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;

/**
 * Characters an opaque id may contain.
 *
 * `:` is excluded deliberately. Storage keys are built by joining scope parts
 * with colons, so an id containing one can be crafted to collide with another
 * scope's key — an audit found that a subject called `a:user:b` lands in
 * somebody else's bucket.
 */
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export interface MemoryRejection {
  reason:
    | 'UNKNOWN_KIND'
    | 'UNKNOWN_AUTHORITY'
    | 'FOREIGN_FIELD'
    | 'SECRET_SHAPED'
    | 'INSTANCE_SHAPED'
    | 'NOT_A_SEMANTIC_ID'
    | 'MISSING_SCOPE'
    | 'FREE_TEXT'
    | 'UNBOUNDED_VALUE';
  field?: string;
}

/**
 * Whether an event may be written, and why not.
 *
 * Memory is untrusted persistence: it comes back from a store somebody else
 * runs, it may have been edited, and a record claiming
 * `featureId: 'invented.feature'` or carrying a sentence beginning *"Ignore
 * previous instructions"* must lose on the way in rather than on the way out.
 */
export function validateMemoryEvent(candidate: unknown): {
  ok: boolean;
  event?: GuideMemoryEvent;
  rejections: MemoryRejection[];
} {
  const rejections: MemoryRejection[] = [];
  if (candidate === null || typeof candidate !== 'object') {
    return { ok: false, rejections: [{ reason: 'FOREIGN_FIELD' }] };
  }
  const incoming = candidate as Record<string, unknown>;

  // Own keys, so a field hidden on a prototype cannot arrive unlisted.
  const ownFields = Object.getOwnPropertyNames(incoming);
  for (const field of ownFields) {
    if (!ALLOWED_EVENT_FIELDS.includes(field)) rejections.push({ reason: 'FOREIGN_FIELD', field });
  }

  /**
   * Every field, read exactly once, before a single rule runs.
   *
   * Closed Loop #19.1 returned a copy instead of the caller's object, which
   * closed an inherited `toJSON`. It did not close an own *accessor*: the rules
   * below read a field several times each and the copy read it once more at the
   * end, so a getter that answers well for the first N reads and badly after
   * still decided what got stored. The test that "proved" otherwise had `N`
   * tuned to the read count of the day, which is not a defence — it is a
   * coincidence with a number in it.
   *
   * Snapshotting first makes the attack impossible rather than difficult: a
   * getter is called once, its result is what every rule inspects, and its result
   * is what is written. A Proxy gets one `get` per field and no second chance.
   */
  const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const field of ALLOWED_EVENT_FIELDS) {
    if (!Object.hasOwn(incoming, field)) continue;
    const value = incoming[field];
    if (field === 'metadata' && value !== null && typeof value === 'object') {
      // One level deeper, for the same reason. `metadata` is the only nested
      // shape, and its keys are a closed list.
      const meta = value as Record<string, unknown>;
      const copied: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      for (const key of Object.getOwnPropertyNames(meta)) copied[key] = meta[key];
      record[field] = copied;
      continue;
    }
    record[field] = value;
  }
  // A field present on the object but not as an own property came from a
  // prototype, which is not where an event's data lives. Detected with `in`
  // rather than by reading the value: reading it would be a second read of a
  // field the snapshot above has already taken, which is the whole thing this
  // function is trying not to do.
  for (const field of ALLOWED_EVENT_FIELDS) {
    if (field in incoming && !ownFields.includes(field)) {
      rejections.push({ reason: 'FOREIGN_FIELD', field });
    }
  }

  const kind = record['kind'];
  if (
    typeof kind !== 'string' ||
    !GUIDE_MEMORY_EVENT_KINDS.includes(kind as GuideMemoryEventKind)
  ) {
    rejections.push({ reason: 'UNKNOWN_KIND', field: 'kind' });
  }
  const authority = record['authority'];
  if (
    typeof authority !== 'string' ||
    !GUIDE_MEMORY_AUTHORITIES.includes(authority as GuideMemoryAuthority)
  ) {
    rejections.push({ reason: 'UNKNOWN_AUTHORITY', field: 'authority' });
  } else {
    // The authority must match the kind, or the field is decorative.
    //
    // An audit found every pairing legal, including the self-contradictory one:
    // an EXPLICIT_PREFERENCE_SET stamped OBSERVED_INTERACTION was accepted, and
    // the plan it produced then claimed EXPLICIT_USER_PREFERENCE and told the
    // user "Matching your answer detail preference". The whole point of this
    // field is to keep a choice and an inference apart, and an unenforced field
    // keeps nothing apart.
    const isPreference = kind === 'EXPLICIT_PREFERENCE_SET';
    if (isPreference && authority !== 'EXPLICIT_USER_PREFERENCE') {
      rejections.push({ reason: 'UNKNOWN_AUTHORITY', field: 'authority' });
    }
    if (!isPreference && authority !== 'OBSERVED_INTERACTION') {
      // Only a preference may be an explicit choice, and nothing written to the
      // store is ever a derivation — those are computed, not remembered.
      rejections.push({ reason: 'UNKNOWN_AUTHORITY', field: 'authority' });
    }
  }

  for (const field of ['appId', 'subjectId', 'eventId', 'occurredAt']) {
    if (typeof record[field] !== 'string' || (record[field] as string).length === 0) {
      rejections.push({ reason: 'MISSING_SCOPE', field });
    }
  }

  // Fields with an exemption get a shape of their own instead.
  const occurredAt = record['occurredAt'];
  if (typeof occurredAt === 'string' && !ISO_TIMESTAMP.test(occurredAt)) {
    rejections.push({ reason: 'FREE_TEXT', field: 'occurredAt' });
  }
  const version = record['applicationVersion'];
  if (version !== undefined && (typeof version !== 'string' || !BUILD_IDENTITY.test(version))) {
    rejections.push({ reason: 'FREE_TEXT', field: 'applicationVersion' });
  }
  for (const field of ['appId', 'subjectId', 'workspaceId', 'eventId']) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || !OPAQUE_ID.test(value)) {
      rejections.push({ reason: 'FREE_TEXT', field });
    }
  }

  const featureId = record['featureId'];
  if (featureId !== undefined) {
    if (typeof featureId !== 'string' || !SEMANTIC_ID.test(featureId)) {
      rejections.push({ reason: 'NOT_A_SEMANTIC_ID', field: 'featureId' });
    }
  }

  // Every string, wherever it came from, checked for the things that must not
  // be kept. A caller that puts a sentence in `appId` is refused there too.
  // Own properties only, and read the same way they are scanned.
  //
  // An audit found the two halves disagreeing: fields were *read* with
  // `record[x]`, which walks the prototype chain, and *scanned* with
  // `Object.entries`, which does not. An object carrying its values on a
  // prototype passed every shape check without one of them being looked at.
  for (const field of Object.getOwnPropertyNames(record)) {
    if (!Object.hasOwn(record, field)) continue;
    const value = record[field];
    if (typeof value !== 'string') continue;
    // A build identity is a long hex string by design — this repository's is a
    // 64-character digest — and the general "long hex looks like a secret" rule
    // reads it as one. The exemption is for that pattern in that field only;
    // every other secret shape still applies there, so a token parked in
    // `applicationVersion` is still refused.
    const shapes =
      field === 'applicationVersion'
        ? SECRET_SHAPED.filter((pattern) => pattern.source !== LONG_HEX.source)
        : SECRET_SHAPED;
    if (shapes.some((pattern) => pattern.test(value))) {
      rejections.push({ reason: 'SECRET_SHAPED', field });
    }
    // Every field, `eventId` included.
    //
    // Closed Loop #19.1 exempted `eventId` because the hook's generated ids
    // collided with this shape about one session in eleven — silently refusing
    // every event that session. It fixed the generator in the same change, so
    // the exemption was belt *and* braces, and an audit pointed out what the
    // belt cost: a caller could park a runtime instance label in `eventId` and
    // have it stored. With the generator no longer colliding, the exemption buys
    // nothing and is gone.
    if (INSTANCE_SHAPED.test(value)) rejections.push({ reason: 'INSTANCE_SHAPED', field });
    // Prose. Nothing stored here is ever a sentence, so anything with spaces
    // and length is somebody's words arriving where they do not belong.
    // A build identity may legitimately be long, and a timestamp legitimately
    // contains punctuation. Both now have their own shapes above, so the general
    // rules apply to every field without exception.
    const limit = field === 'applicationVersion' ? 128 : 64;
    if (value.length > limit) rejections.push({ reason: 'FREE_TEXT', field });
    if (/\s/.test(value)) rejections.push({ reason: 'FREE_TEXT', field });
  }

  const metadata = record['metadata'];
  if (metadata !== undefined) {
    if (metadata === null || typeof metadata !== 'object') {
      rejections.push({ reason: 'FOREIGN_FIELD', field: 'metadata' });
    } else {
      const meta = metadata as Record<string, unknown>;
      for (const field of Object.keys(meta)) {
        if (!ALLOWED_METADATA_FIELDS.includes(field)) {
          rejections.push({ reason: 'FOREIGN_FIELD', field: `metadata.${field}` });
        }
      }
      if (meta['preference'] !== undefined) {
        if (!['guidanceDetail', 'assistanceMode'].includes(meta['preference'] as string)) {
          rejections.push({ reason: 'UNBOUNDED_VALUE', field: 'metadata.preference' });
        }
      }
      if (meta['value'] !== undefined) {
        const allowed = [...GUIDANCE_DETAIL_VALUES, ...ASSISTANCE_MODE_VALUES] as string[];
        if (!allowed.includes(meta['value'] as string)) {
          rejections.push({ reason: 'UNBOUNDED_VALUE', field: 'metadata.value' });
        }
      }
      if (meta['stepCount'] !== undefined) {
        const count = meta['stepCount'];
        if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 50) {
          rejections.push({ reason: 'UNBOUNDED_VALUE', field: 'metadata.stepCount' });
        }
      }
    }
  }

  if (rejections.length > 0) return { ok: false, rejections };

  /**
   * A plain copy of exactly the values that were inspected.
   *
   * Returning the caller's object was a hole an audit walked straight through.
   * Everything above reads own properties, and `JSON.stringify` — which is how
   * every store persists — does not: it calls an inherited `toJSON`, so an event
   * whose *prototype* carried one validated with zero rejections and then wrote a
   * raw question, an email, an instance label and a secret in a single field. A
   * getter that returned a good value while being checked and a payload
   * afterwards did the same thing without a prototype.
   *
   * Reading each field once, into an object with a null prototype and no
   * accessors, closes both. What is validated is what is written, because they
   * are the same values and nothing can compute them again.
   */
  const clean = Object.create(null) as Record<string, unknown>;
  for (const field of ALLOWED_EVENT_FIELDS) {
    // `record` is already the snapshot taken before any rule ran, so these reads
    // cannot reach an accessor and cannot differ from what was inspected.
    if (!(field in record)) continue;
    const value = record[field];
    if (value === undefined) continue;
    if (field === 'metadata') {
      const meta = value as Record<string, unknown>;
      const metaCopy = Object.create(null) as Record<string, unknown>;
      for (const key of ALLOWED_METADATA_FIELDS) {
        if (meta[key] !== undefined) metaCopy[key] = meta[key];
      }
      clean[field] = { ...metaCopy };
      continue;
    }
    clean[field] = value;
  }
  // Spread into an ordinary object so the result serialises and compares like
  // any other event; the null-prototype step above is what kept `toJSON` out.
  return { ok: true, event: { ...clean } as unknown as GuideMemoryEvent, rejections: [] };
}

/** Every event that survives validation, with the rest reported rather than dropped silently. */
export function acceptMemoryEvents(candidates: readonly unknown[]): {
  accepted: GuideMemoryEvent[];
  ignored: { index: number; rejections: MemoryRejection[] }[];
} {
  const accepted: GuideMemoryEvent[] = [];
  const ignored: { index: number; rejections: MemoryRejection[] }[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const result = validateMemoryEvent(candidate);
    if (result.ok && result.event !== undefined) accepted.push(result.event);
    else ignored.push({ index, rejections: result.rejections });
  }
  return { accepted, ignored };
}
