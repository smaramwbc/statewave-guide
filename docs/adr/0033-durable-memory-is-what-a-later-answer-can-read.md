# 33. Durable memory is what a later answer can read

- **Status:** Accepted
- **Date:** 2026-08-30
- **Refines:** [ADR 0032](0032-remote-memory-persists-experience-not-authority.md)
- **Applies:** [ADR 0031](0031-an-adaptation-that-changes-nothing-is-not-an-adaptation.md) to storage

## Context

ADR 0032 made guide memory durable and recorded the sharpest limitation it found: `GET /v1/timeline`
returns at most 100 episodes and returns the **oldest** hundred, with no pagination. Past that point
a subject's _recent_ history is the half that disappears, which for a memory system is the wrong half
to lose.

That was framed as a retrieval problem. It is also a writing problem, and the writing half is the
one this project controls. Guide was persisting every event kind it had, and the arithmetic of that
is not subtle:

| session                                     | events written | durable under this ADR | sessions to reach 100 |
| ------------------------------------------- | -------------- | ---------------------- | --------------------- |
| light — 3 questions, no steps               | 4              | 0                      | 25 → never            |
| typical — 6 questions, one guide finished   | 11             | 1                      | 10 → 100              |
| heavy — 15 questions, three guides finished | 33             | 4                      | 4 → 25                |

A typical user crossed the ceiling in **ten sessions**. What filled it was `GUIDANCE_VIEWED`, written
once per answered question — the highest-volume record in the system.

ADR 0031 established that an adaptation which changes nothing is not an adaptation. The same question
had never been asked about storage.

## Decision

**No future presentation effect, no durable guide memory.**

A rule about exclusion, not inclusion. A kind that cannot change what anybody sees later has no
business surviving a session, whatever else might be said for it. A kind that can change something
may still be excluded for cost — but deliberately, and with the cost of excluding it written down.

The classification is not an opinion, and it is not maintained by hand. Each kind was written on its
own, projected into a profile, and planned across the four response shapes the emphasis and collapse
rules actually distinguish. What follows is what the real planner did:

| kind                      | durability       | what reads it                 | applied outcomes |
| ------------------------- | ---------------- | ----------------------------- | ---------------- |
| `EXPLICIT_PREFERENCE_SET` | `DURABLE_REMOTE` | `explicitPreferences.*`       | 10               |
| `STEP_THROUGH_COMPLETED`  | `DURABLE_REMOTE` | `hasCompletedGuide`           | 6                |
| `SHOW_ME_USED`            | `DERIVED_ONLY`   | `preferredAssistanceModeHint` | 2                |
| `STEP_THROUGH_STARTED`    | `DERIVED_ONLY`   | `preferredAssistanceModeHint` | 2                |
| `GUIDANCE_VIEWED`         | `NOT_USEFUL`     | nothing                       | **0**            |
| `FULL_STEPS_EXPANDED`     | `NOT_USEFUL`     | nothing                       | **0**            |

`scripts/memory-durability.mjs` re-derives this table on every run and fails if the code and the
table disagree, in both directions: a kind classified `NOT_USEFUL` that moves a presentation, and a
kind persisted durably that moves nothing. The failure it exists to catch is not somebody editing the
table. It is somebody making `views` matter and leaving behind a table that now says the
highest-volume record in the system is safe to drop.

## Consequences

**The two kinds nothing read were the two written most often.** One per answer shown, one per fold
opened. That is the finding in a sentence, and it is the reason the ceiling arrived in ten sessions
rather than a hundred.

**`DERIVED_ONLY` is the honest name for the interesting pair, and it costs something real.**
`SHOW_ME_USED` and `STEP_THROUGH_STARTED` do reach the screen — but only through
`preferredAssistanceModeHint`, a three-state value derived from two running counts. What a later
session needs is that value, not the hundred presses behind it. Guide cannot keep a mutable value in
Statewave — though the reason is narrower than this ADR first claimed, and the first claim was wrong.

> **Corrected 2026-08-30 (Closed Loop #20.2).** This ADR said "there is no upsert and no keyed write
> for a consumer, only an append". That is false. `POST /v1/resolutions` is a genuine keyed upsert on
> `(subject_id, session_id, tenant_id)`, exposed by both SDKs. Statewave also has claim-keyed
> supersession — a canonical claim key with `SCOPE_SINGLE` meaning one current value wins — reachable
> from a consumer through `payload.statewave.memory_candidates[].claim`, with no LLM key. The
> primitives exist. What does not exist is a _usable_ one: the claim vocabulary is a closed hardcoded
> allowlist a consumer cannot extend, the claim path deliberately refuses to collapse repeated
> observations of the same value, and every update through `/v1/resolutions` returns HTTP 500 while
> persisting. Measured, not read: see the #20.2 capability report.

The consequence for this ADR is unchanged; the reason for it is not. So the durable form
of these does not exist yet, and the price is stated rather than hidden — **on a remote store the
assistance-mode hint stops forming at all.**

Not merely across sessions, which is how a first draft of this ADR put it and which was too kind. The
profile is projected from whatever `store.read(scope)` returns, so a record the store never kept is
one no projection ever sees — in this session or any later one. Somebody who reaches for Step through
three times is not emphasised into it, then or afterwards.

That is the cheapest thing on the table to lose. The hint is the _inferred_ version of a signal the
user can state outright, and the explicit version outranks it anyway and is durable. Calling these
two `NOT_USEFUL` would have produced the same write behaviour through a false statement, and the next
person to read the table would have believed it.

**The policy reads the kind and nothing else.** A policy that could see the payload is a policy that
can be argued with one record at a time, and the first argument anybody wins is "this one is
important". It also fails closed: a kind outside the taxonomy is not durable, so a future kind cannot
reach storage because nobody remembered to classify it.

**Withholding is not rejection, and the counters say so.** `withheldByPolicy` is separate from
`rejectedOnWrite` in both remote stores. A rejection means a record was malformed and somebody should
look; a withheld record means the policy worked. An inspector showing a rejection rate climbing
steadily through ordinary use is an inspector nobody reads.

**It is enforced twice, and the browser copy is the polite one.** The React store drops a withheld
record before it crosses the network, and the adapter drops it again at the boundary the browser
cannot reach. A browser is not a trustworthy caller; the backend keeps its own copy of the rule.

**Performance was never the problem, and this ADR does not claim it was.** Measured on the fixture
bundle: projecting 1000 events takes 0.047 ms, planning is constant at 0.001 ms regardless of event
count, and the profile plateaus at ~3.6 KB because its size is bounded by features × versions rather
than by events. A thousand stored events is nothing to a browser. The cost of keeping everything was
never CPU — it was the read window, which is a fixed hundred and spends itself oldest-first.

**Growth is now proportional to distinct meaningful actions, not to usage — and that is not the same
as bounded.** A repeat completion of the same feature on the same build writes another episode, and a
user who toggles a preference fifty times writes fifty records. The profile needs only
`stepThroughCompletions > 0`, so all but the first are redundant; the filter cannot tell them apart
without read-before-write state, which it deliberately does not have. **This ADR does not claim the
store is bounded.** It claims the store stopped filling with records nothing would ever read.

**The other half is not ours.** Bounding the store properly needs either a keyed write that supersedes
a previous value, or a recent-first read so that the window holds the history that matters.
Statewave has neither today. The read half has been raised as
[statewave#363](https://github.com/smaramwbc/statewave/pull/363) with matching SDK changes in
[statewave-ts#31](https://github.com/smaramwbc/statewave-ts/pull/31) and
[statewave-py#32](https://github.com/smaramwbc/statewave-py/pull/32); the supersession half does not
exist as a consumer-reachable primitive at all. Until one of those lands, this is one half of a
two-part fix and is described as such.
