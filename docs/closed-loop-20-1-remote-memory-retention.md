# Closed Loop #20.1 — Durable Remote Memory & Retention

> **Remember less. Retrieve the right history.**

Continues from `1d1ba7e`. Closed Loop #20 made guide memory durable and wrote down the limitation it
found: `GET /v1/timeline` returns at most 100 episodes and returns the **oldest** hundred, with no
pagination. Past that point a subject's _recent_ history is what disappears.

#20 framed that as a retrieval problem. It is also a writing problem, and the writing half is the one
this project controls.

## 1. What the ceiling cost, before

A typical session wrote **11 events**, of which **1** could ever change a later answer.

| session                                     | written | durable | reduction | sessions to 100 |
| ------------------------------------------- | ------- | ------- | --------- | --------------- |
| light — 3 questions, no steps               | 4       | 0       | 100%      | 25 → never      |
| typical — 6 questions, one guide finished   | 11      | 1       | 91%       | 10 → 100        |
| heavy — 15 questions, three guides finished | 33      | 4       | 88%       | 4 → 25          |

Ten sessions. What filled the window was `GUIDANCE_VIEWED` — one record per answer shown, the
highest-volume record in the system, and one nothing has ever read.

## 2. The rule

> **No future presentation effect, no durable guide memory.**

A rule about exclusion, not inclusion. It does not say what to keep; it says what cannot be kept.

## 3. The classification, demonstrated

Not asserted. Each kind was written on its own, projected into a profile, and planned across the four
response shapes the emphasis and collapse rules actually distinguish. This is what the real planner
did:

| kind                      | durability       | what reads it                 | applied outcomes |
| ------------------------- | ---------------- | ----------------------------- | ---------------- |
| `EXPLICIT_PREFERENCE_SET` | `DURABLE_REMOTE` | `explicitPreferences.*`       | 10               |
| `STEP_THROUGH_COMPLETED`  | `DURABLE_REMOTE` | `hasCompletedGuide`           | 6                |
| `SHOW_ME_USED`            | `DERIVED_ONLY`   | `preferredAssistanceModeHint` | 2                |
| `STEP_THROUGH_STARTED`    | `DERIVED_ONLY`   | `preferredAssistanceModeHint` | 2                |
| `GUIDANCE_VIEWED`         | `NOT_USEFUL`     | nothing                       | **0**            |
| `FULL_STEPS_EXPANDED`     | `NOT_USEFUL`     | nothing                       | **0**            |

Of the five counters in `GuideFeatureHistory`, exactly one — `stepThroughCompletions` — is read by
anything.

`scripts/memory-durability.mjs` re-derives this on every run and fails three ways: a `NOT_USEFUL`
kind that moves a presentation, a `DURABLE_REMOTE` kind that moves nothing, and a `DERIVED_ONLY` kind
that turns out inert — because then the cost it documents is imaginary and the honest label is
`NOT_USEFUL`.

## 4. What the derived pair costs

`SHOW_ME_USED` and `STEP_THROUGH_STARTED` do reach the screen, through a three-state hint derived from
two running counts. They are also the unbounded pair: every press, forever. Dropping them is a cost
decision rather than the rule, so the cost is stated:

**On a remote store the assistance-mode hint stops forming at all.** Not merely across sessions — the
profile is projected from whatever `store.read(scope)` returns, so a record the store never kept is
one no projection ever sees.

What survives is the _explicit_ preference, which outranks the derived hint anyway, which the user
sets deliberately, and which is durable. Losing the inferred version of a signal somebody can state
outright is the cheapest thing on the table to lose — but it is a loss, not a deferral.

## 5. Two defects found on the way, both older than this loop

**A preference resolved by array position.** Repeated `EXPLICIT_PREFERENCE_SET` took whichever record
came last _in the array_, so the same two records gave `CONCISE` on one read and `FULL` on the next.
Harmless for a local store, which returns what it was given in the order it was given; not harmless
for a remote one, which returns whatever order the database felt like — and preferences are now one of
only two durable kinds. Resolved by `occurredAt`, tie-broken by `eventId`.

The ordering fixture held exactly one preference event, so forty deterministic shuffles never permuted
the only order-sensitive branch in the projection. Counters commute; that is why the suite was green.
It now holds two, and all three pre-existing shuffle tests fail against the old behaviour.

**The inspector counted writes that never happened.** `written` counted every validated event, which
stopped being true the moment a store began withholding. The store's own `withheldByPolicy` is now
surfaced, kept separate from `rejectedOnWrite`: one means something went wrong and the other means
nothing did, and an inspector whose rejection count climbs through ordinary use is one nobody reads.

## 6. Performance was never the problem

Measured, so the ADR does not overclaim:

| events | project  | plan     | profile |
| ------ | -------- | -------- | ------- |
| 10     | 0.003 ms | 0.001 ms | 1.8 KB  |
| 100    | 0.008 ms | 0.001 ms | 3.6 KB  |
| 500    | 0.023 ms | 0.001 ms | 3.6 KB  |
| 1000   | 0.047 ms | 0.001 ms | 3.6 KB  |

Linear, with planning constant. The profile plateaus because its size is bounded by features ×
versions rather than by events. A thousand stored events is nothing to a browser. **The cost of
keeping everything was never CPU — it was a fixed hundred-record read window that spends itself
oldest-first.**

## 7. Verified against a real server

All fifteen scenarios pass against the Statewave instance from #20 — **19 episodes where #20 wrote
29**.

Two scenarios needed repair rather than re-baselining, and both had become vacuous in the same way:

- **SW14 / SW15** — the privacy sweep over a live database was fed entirely by the kinds this loop
  drops. It would have swept an empty set and reported zero secrets found, which is true of nothing.
  The session now sets a preference on the screen with the rotated key on it and completes a guide,
  so the sweep runs over both durable kinds. It sweeps 2 records; it found 0 forbidden values.
- **SW07** — "a failed memory write does not break the interaction" tolerated a write that no longer
  occurred, because the store withheld it before the socket was touched. It now completes a guide,
  which _is_ written, against a dead port, and reads the developer inspector to confirm the write was
  attempted and failed.

## 8. What this does not do

**It does not bound the store, and does not claim to.** A repeat completion of the same feature on the
same build writes another episode; the profile needs only `stepThroughCompletions > 0`, so every one
after the first is redundant. The filter reads the kind and nothing else — deliberately, because a
policy that can see the payload is one that can be argued with a record at a time — so it cannot tell
a first completion from a fiftieth without read-before-write state. Growth is now proportional to
distinct meaningful actions rather than to usage. That is not the same as bounded.

**The other half is not ours.** Bounding it properly needs either a keyed write that supersedes a
previous value, or a recent-first read. Statewave has neither today. The read half is raised as
[statewave#363](https://github.com/smaramwbc/statewave/pull/363), with the SDK changes it needs in
[statewave-ts#31](https://github.com/smaramwbc/statewave-ts/pull/31) and
[statewave-py#32](https://github.com/smaramwbc/statewave-py/pull/32); the supersession half was described here as not existing
at all, which was wrong — see the correction in
[ADR 0033](adr/0033-durable-memory-is-what-a-later-answer-can-read.md). Consumer-reachable keyed
primitives do exist; none of them is usable for this yet.

## 9. Gates added

| gate                                    | what it fails on                                          |
| --------------------------------------- | --------------------------------------------------------- |
| `test:memory-durability-coverage`       | a kind in the taxonomy with no durability, or the reverse |
| `test:memory-durability-classification` | the table and the planner disagreeing, in any direction   |
| `test:memory-durability-effect`         | the filter and the durable list drifting apart            |
| `test:memory-durability-volume`         | a policy that keeps everything                            |
| `test:statewave-remote-write-policy`    | a non-durable kind reaching Statewave                     |
| `test:retention-review-package`         | the recorded evidence no longer being true of the code    |

All six are reached through the canonical `test:` discovery in `package.json`. There is no second
manifest.

## 10. Verdict

**PARTIALLY.**

What was asked was to bound durable remote memory and retrieve the right history. Half of that is
done and proved: the highest-volume records are no longer persisted, the classification is derived
from the planner rather than asserted, the reduction is measured at 88–100% per session, and it holds
against a real server. Two real defects older than this loop were found and fixed on the way.

The other half is not done, and cannot be done from this repository. Retrieving the _right_ history
needs a recent-first read, which Statewave does not expose; keeping the durable set genuinely bounded
needs a keyed write that supersedes, which Statewave does not have at all. The first is raised as a
pull request with its SDK counterparts and is out of this project's hands. The second has no proposal
yet, because designing a supersession primitive for somebody else's memory runtime is a larger
question than a write policy.

Calling this YES would mean claiming a bounded store. It is not bounded. It is smaller, for a reason
that is written down and checked.
