# Closed Loop #20.2 — Bounded Statewave Memory

> **Remember state, not every time state became true.**

Continues from `a0cd547`. Closed Loop #20.1 ended in PARTIALLY and said why: the write policy was
much smaller, but a repeated completion still wrote a durable episode every time, and the fix needed
platform primitives that did not exist.

They exist now. Part of this loop was making that true: the capability report found the gaps, the
gaps became statewave issues and PRs, and the platform closed every one — recent-first reads
(#363), a resolutions fix (#367/#368), deterministic claim ordering (#373), same-value supersession
(#374), an active-only read (#371), and tenant-registrable claim keys (#378). This loop consumed
them; it worked around none of them.

## 1. The rule

A durable record names the **state** it asserts, not the moment it was observed.

Two kinds of state, and the split is the design:

**A completion is monotonic.** Once true it stays true, and re-observing it adds nothing. So its
idempotency key _is_ its logical key —
`guide.state:completion:<appId>[:<workspaceId>]:<featureId>:<applicationVersion>` — and Statewave's
first-write-wins collapses every repeat at the front door. Nothing on the Guide side counts, dedupes,
compacts or forgets.

**A preference is not.** Its content is a value that changes, and first-write-wins would pin
somebody to their first choice — measured: `FULL, CONCISE, FULL, CONCISE` under one ingest key
stores one episode reading `FULL`. So a preference episode carries a claim envelope on a key the
host registers (`guide.preference.guidancedetail`, cardinality `single`), and Statewave
_supersedes_: the write path keeps every change, the read path gets one active value.

## 2. Measured, against a real server, through the production adapter

| scenario    | result                                                                                |
| ----------- | ------------------------------------------------------------------------------------- |
| BS01        | 1000 observations of one completion → **1 durable record**, completed = true          |
| BS02        | 4 preference changes → active value `CONCISE`; 4 episodes, **1 active claim**         |
| BS03        | 200 distinct completion keys → 200 records, 200 features in the profile               |
| BS04        | newest of 150 records reachable (`newest_first`)                                      |
| BS06        | three ingest orders → one outcome                                                     |
| BS07        | a build-1 completion does not mark build-2 complete                                   |
| BS10        | reset leaves nothing and resurrects nothing                                           |
| BS11 / BS12 | a retry deduplicates; a new value supersedes — different mechanisms, both held        |
| BS13 / BS14 | read and write failure degrade to absence; nothing thrown, nothing invented           |
| BS15        | 26 records swept: 0 instance labels, secrets, emails, questions, or UI text           |
| BS16 / BS17 | active remote state adds no authority: unsupported stays refused, Delete stays absent |
| BS19        | same-instant competing writes → an arbitrary but **stable** winner                    |
| combined    | **504 writes → 5 durable episodes → 2 events read**                                   |

"Latest", documented rather than implied: claim `valid_from`, then `created_at`, then memory id.
Two writes carrying the same instant resolve arbitrarily — and stably, which is the property reset
and rereads depend on.

## 3. ADR 0032 rule 4, narrowed to what it protected

The rule said _reads are episodes, never compiled memories_. The preference read now touches one
field of one compiled memory: `metadata.claim`, the envelope Guide wrote itself. The amendment names
the actual boundary — never compiled **prose**. `content` and `summary` are still never read, and a
claim value is re-derived through the closed preference vocabulary and the full event validator
before it becomes an event. A memory carrying `SUDO` is dropped, and a test holds the door.

## 4. What building it caught

Three silent defects, each visible only as a counter:

- the candidate block rode inside the payload, and the payload is also the event — so validation
  refused every preference on the way out as carrying a foreign field. Written 4, fetched 4,
  ignored 4.
- the synthesised event took the memory row's `valid_from`, which can be the _compile_ time —
  dating every preference to when Statewave got round to compiling it. The claim's own timestamp is
  what the resolver ordered by, and is what the event now carries.
- Postgres returns microseconds; guide events validate at milliseconds. Rejected, `FREE_TEXT`,
  every one.

And one instrument problem worth remembering: the adapter-contract gate asserted "the event id is
the idempotency key" — an implementation pinned as if it were an intention. It had to be rewritten,
not relaxed.

## 5. Limitations, stated

- The preference half needs a tenant id on the client and a host-registered claim key. Without
  either, Guide replays preference episodes — correct, and unbounded by the number of changes.
- Physical history still grows: episodes per distinct fact plus one per preference change, and
  superseded memory rows are retained by Statewave as history. Bounded _active state_ is the claim;
  bounded storage is Statewave's ledger design, deliberately untouched.
- `status=active` is not yet in a published SDK; the adapter filters the documented `status` field
  client-side until it is.

## 6. Verdict

**YES.**

Every condition in the brief's own list is met and measured: recent history is consumer-reachable;
durable state is bounded by logical keys rather than repetitions; a thousand repeated completions
need no replay and produce one record; repeated preference updates resolve deterministically under
distinct timestamps, stably under identical ones, and shuffle-independently always; reset does not
resurrect; a real server proves all of it; and the privacy and authority boundaries came through
unchanged — 26 records swept clean, and remembered state still cannot put an action on the screen or
an answer in a mouth.

Guide can maintain bounded durable user memory through Statewave without replaying an arbitrarily
growing event log and without losing recent relevant state.
