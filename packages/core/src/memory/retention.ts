/**
 * What is worth keeping after the tab closes.
 *
 * Closed Loop #20 made guide memory durable, and durability made a question
 * urgent that a `Map` had let us ignore: a store that never forgets grows
 * forever, and `GET /v1/timeline` hands back the *oldest* hundred episodes. A
 * subject that writes an episode per viewed answer therefore spends its recent
 * history first — the half a memory system exists to have.
 *
 * The rule this file enforces is narrow and testable:
 *
 * > **No future presentation effect, no durable guide memory.**
 *
 * It is a rule about *exclusion*, not inclusion. A kind that cannot change what
 * anybody sees later has no business surviving a session, whatever else might be
 * said for it. A kind that can change something may still be excluded for cost,
 * but it has to be excluded deliberately and the cost of excluding it has to be
 * stated.
 *
 * The classification below is not an opinion. Each kind was written on its own,
 * projected into a profile, and planned across four response shapes, and the
 * classification records what the real planner did — see
 * `scripts/memory-durability.mjs`, which re-derives it on every run and fails if
 * the code and this table disagree. That is deliberate: the day somebody makes
 * `GUIDANCE_VIEWED` matter, this table becomes a lie, and a lie about what is
 * worth persisting is how a memory system quietly starts keeping everything.
 *
 * @packageDocumentation
 */

import type { GuideMemoryEvent, GuideMemoryEventKind } from './events.js';

/**
 * How long one kind of record deserves to live.
 *
 * Closed, and closed on purpose: a fifth category would be somewhere to put a
 * kind nobody wanted to decide about.
 */
export type GuideMemoryDurability =
  /** A future answer reads this record itself. It survives the session. */
  | 'DURABLE_REMOTE'
  /**
   * Useful while the tab is open and not worth carrying past it.
   *
   * Nothing is classified this way today. The category exists because the
   * alternative — filing such a kind under `NOT_USEFUL` — would claim it does
   * nothing, and that is a different and false statement.
   */
  | 'SESSION_ONLY'
  /**
   * A future answer reads something *derived* from this record, never the
   * record. Persisting the derivation would be bounded; persisting the events
   * it is derived from is not.
   */
  | 'DERIVED_ONLY'
  /** Nothing reads it, directly or derived. It changes no presentation, ever. */
  | 'NOT_USEFUL';

/**
 * The classification, by kind.
 *
 * `GUIDANCE_VIEWED` and `FULL_STEPS_EXPANDED` are the two that produce no
 * `APPLIED` adaptation in any response shape. They are also the two written most
 * often — one per answer shown, one per fold opened — which is the whole
 * problem in one sentence: the highest-volume records were the ones nothing read.
 *
 * `SHOW_ME_USED` and `STEP_THROUGH_STARTED` are the interesting pair. They do
 * reach the screen, but only through `preferredAssistanceModeHint`, which is a
 * three-state value derived from two running counts. What a later session needs
 * is that value, not the hundred presses behind it. Guide cannot keep a mutable
 * value in Statewave — there is no upsert or keyed write for a consumer, only an
 * append — so the honest position is that their durable form does not exist yet,
 * and the cost of not keeping them is written down rather than hidden:
 *
 * **on a remote store the assistance-mode hint stops forming at all.** Not
 * merely across sessions — the profile is projected from whatever the store
 * returns, so a record the store never kept is one no projection ever sees, in
 * this session or any later one. A person who reaches for Step through three
 * times is not emphasised into it, then or afterwards.
 *
 * That is a larger consequence than "it stops persisting", and it is written
 * here in the larger form on purpose. What survives instead is the *explicit*
 * preference, which outranks the derived hint anyway, which the user sets
 * deliberately, and which is durable. Losing the inferred version of a signal
 * the user can state outright is still the cheapest thing on this table to
 * lose — but it is a loss, not a deferral.
 */
export const GUIDE_MEMORY_DURABILITY: Readonly<
  Record<GuideMemoryEventKind, GuideMemoryDurability>
> = Object.freeze({
  // Read directly: `explicitPreferences.guidanceDetail` / `.assistanceMode`.
  EXPLICIT_PREFERENCE_SET: 'DURABLE_REMOTE',
  // Read directly: `hasCompletedGuide`, which is the only one of the five
  // per-feature counters anything looks at.
  STEP_THROUGH_COMPLETED: 'DURABLE_REMOTE',
  // Read only through `preferredAssistanceModeHint`.
  SHOW_ME_USED: 'DERIVED_ONLY',
  STEP_THROUGH_STARTED: 'DERIVED_ONLY',
  // Feeds `featureHistory[].views`, which nothing reads.
  GUIDANCE_VIEWED: 'NOT_USEFUL',
  // Feeds `featureHistory[].fullStepsExpansions`, which nothing reads.
  FULL_STEPS_EXPANDED: 'NOT_USEFUL',
});

/** The kinds a remote store is allowed to keep, derived from the table above. */
export const DURABLE_REMOTE_EVENT_KINDS: readonly GuideMemoryEventKind[] = Object.freeze(
  (Object.keys(GUIDE_MEMORY_DURABILITY) as GuideMemoryEventKind[])
    .filter((kind) => GUIDE_MEMORY_DURABILITY[kind] === 'DURABLE_REMOTE')
    .sort(),
);

/** Why a record was or was not kept, in words a developer inspector can show. */
export interface RemoteMemoryWriteDecision {
  persist: boolean;
  kind: GuideMemoryEventKind;
  durability: GuideMemoryDurability;
}

/**
 * Decide whether one event earns a durable remote record.
 *
 * Takes the *kind* rather than the event, because that is the entire input. A
 * policy that consulted the payload would be a policy that could be argued with
 * one record at a time, and the first argument anybody wins is "this one is
 * important".
 */
export function remoteMemoryWriteDecision(kind: GuideMemoryEventKind): RemoteMemoryWriteDecision {
  const durability = GUIDE_MEMORY_DURABILITY[kind];
  return { persist: durability === 'DURABLE_REMOTE', kind, durability };
}

/**
 * The filter a remote store applies before it writes.
 *
 * Local and session stores do not call this. Dropping a record that never
 * leaves the tab buys nothing and would make the in-session profile disagree
 * with itself — the hint is still worth having while somebody is using the
 * thing.
 */
export function isDurableRemoteEvent(event: Pick<GuideMemoryEvent, 'kind'>): boolean {
  return remoteMemoryWriteDecision(event.kind).persist;
}
