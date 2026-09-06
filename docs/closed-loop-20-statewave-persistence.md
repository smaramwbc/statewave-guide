# Closed Loop #20 — Real Statewave Persistence

**"Persist experience. Never persist authority."**

**Hypothesis.** Can Statewave Guide replace browser-local persistence with actual Statewave-backed
durable memory while preserving every existing authority, privacy, failure and usefulness boundary?

**Answer: YES**, with one measured limitation that a production deployment would have to plan around.
A person completes a guide in one browser context; that context is destroyed; a second, independent
one with an empty `localStorage` recognises them from a Statewave server and shortens the answer.
Nothing was mocked, and the loop's first act was to discover that the previous loop's central claim
about Statewave was wrong.

- Starting commit: `0d20755`
- Tests **1461 → 1508**, gates **118 → 129**, ProductClaims **113 → 113**, ProductModel hash
  unchanged.

---

## 1. Discovery: **A — DIRECT_CLIENT_AVAILABLE**

Closed Loop #19 wrote, in code that shipped:

> No Statewave JavaScript client is present in this repository, its dependencies or the installed
> store. The Statewave surface available in this environment is an MCP tool server, which is
> agent-side and cannot be imported by a browser package.

**That was wrong.** `@statewavedev/sdk` is published on npm at **1.4.0**, has **zero runtime
dependencies**, and is checked out at `../statewave-ts`. The MCP server
(`statewave-connectors/packages/mcp-server`) is a thin wrapper over the same `/v1` HTTP API — every
tool bottoms out in a `fetch` against it — so it is an agent transport, and using it as an application
persistence path would have been dressing one up as the other. The reasoning in #19 was sound; the
premise was not, and I did not look hard enough.

What #19 got _right_ was the contract, which mapped onto the real API without adjustment:

| Guide                      | Statewave                                               |
| -------------------------- | ------------------------------------------------------- |
| one `GuideMemoryEvent`     | one episode — `POST /v1/episodes`                       |
| a `GuideMemoryScope`       | a subject                                               |
| reading a subject's memory | `GET /v1/timeline` → `episodes[].payload`, **verbatim** |
| forgetting                 | `DELETE /v1/subjects/{id}`                              |
| a retried write            | `idempotencyKey`, deduplicated **server-side**          |

Every one of those was verified by hand against a running server before a line of adapter was written.

**The server ran locally, by the documented method, with no credentials.** `statewave/DOCKER.md`
publishes a compose quickstart; with no LLM key it runs in demo mode and makes no external calls. I
started an isolated instance on port 8110 with its own database.

> **A correction I owe you.** My first attempt started that instance from the repository checkout,
> whose untracked `.env` docker-compose injects — so the container inherited `ANTHROPIC_API_KEY` and
> `STATEWAVE_LITELLM_API_KEY`, and `/readyz` made an outbound LLM call with one. That is exactly what
> §29 told me not to do. I tore it down and restarted from the published compose, which has no
> `env_file`; `/readyz` now reports `STATEWAVE_LITELLM_API_KEY is not set`. No Guide data was written
> during that window, and the other Statewave stack already running on this machine was never touched.

## 2. Where the credential lives

Statewave authenticates with a **server-wide `X-API-Key`**, and `X-Tenant-ID` is **asserted by the
caller**, not verified. There is no user-scoped browser token. So:

```
  browser  ──▶  host application's trusted backend  ──▶  Statewave
   (no key)              (holds the key)
```

`@statewavedev/guide-statewave` is a new package that runs on a server. The browser gets
`createRemoteGuideMemoryStore({ endpoint })`, which talks to a path on the host's own origin and
carries nothing secret. `test:statewave-credential-placement` fails if anything in the React package
imports the SDK or handles a key, and if core depends on either.

**One thing the demo does that a real host must not, at full strength.** The example backend takes the
memory scope _from the browser_, and has no authentication and no rate limiting. An audit made me say
this less softly than I first did: any page that can reach that endpoint can **read** any subject's
guide memory, **write** into any subject's history, and **delete** any subject's memory entirely — as
fast as it likes, spending a credential the browser never sees. That is acceptable in a fixture with no
accounts, on a loopback port, started by a harness; it is not a pattern to copy. A real host derives
the subject from its own session, ignores what the page sends, and puts the same auth and rate
limiting on this route as on any other write endpoint it owns. The status route reports
`subjectTrust: CLIENT_ASSERTED_DEMO_ONLY` and now discloses nothing else. Two leaks were fixed there
after an audit found them: the status route handed the browser the **Statewave base URL**, in the same
file that promises the page never learns one; and the ordinary GET path returned the store's
diagnostics — including `lastFailure`, the upstream error message — from a file whose own comment says
"never the upstream body".

## 3. Exactly what is stored

> **Superseded by Closed Loop #20.1.** The record below is a faithful copy of what this loop
> captured, and it is the record the system no longer writes. #20.1 found that `GUIDANCE_VIEWED`
> changes no later presentation and stopped making it durable; the durable kinds are now
> `EXPLICIT_PREFERENCE_SET` and `STEP_THROUGH_COMPLETED` only. The shape of a stored record, the
> empty `metadata`/`provenance`, and the idempotency key are all unchanged — it is the _set of kinds_
> that narrowed. Every episode count in this document is likewise a measurement of what #20 wrote,
> not of what the system writes today. See
> [ADR 0033](adr/0033-durable-memory-is-what-a-later-answer-can-read.md).

```json
{
  "kind": "GUIDANCE_VIEWED",
  "appId": "statewave-crm-fixture",
  "eventId": "ev-195gi0-1",
  "authority": "OBSERVED_INTERACTION",
  "featureId": "clients.create",
  "subjectId": "sw_alice",
  "occurredAt": "2026-08-29T22:23:08.973Z",
  "applicationVersion": "28146cd0…"
}
```

`source: statewave-guide`, `type: guide.interaction`, `idempotencyKey` = the event id.
`metadata` and `provenance` are sent **empty** — Statewave passes those bags through verbatim, which
makes them precisely where a well-meaning change would begin posting page state.

Twenty-nine episodes across nine Statewave subjects, **16,929 bytes** for the whole matrix. Those
figures, and every other number below, come from
`benchmarks/statewave-persistence-review-v1/statewave-evidence.json`, which the capture writes.

## 4. The headline: SW01 → SW02

|                           | process A                     | process B                               |
| ------------------------- | ----------------------------- | --------------------------------------- |
| browser                   | fresh context                 | **a second, independent context**       |
| `localStorage` guide keys | **0**                         | **0**, before and after                 |
| what happened             | asked, completed Step through | asked the same question                 |
| result                    | 3 episodes in Statewave       | **steps folded, "Show full steps (3)"** |

**"Process" is doing more work in that heading than the evidence supports.** These are two Playwright
`BrowserContext`s — separate storage, separate cookies, nothing shared — in one Chromium on one
machine. That is enough to prove the claim that matters, which is that the continuity did not come
from the browser: the second context's `localStorage` is empty before it asks and empty after. It is
not a proof about two machines, and an audit was right to say the word implied one.

The verified sentence, the condition and the actions are identical on both sides. What differs is
whether three steps start on screen — and the only thing carrying that across was a row in a database.

## 5. SW01–SW15, against a running server

|      | scenario                   | result                                                                                                            |
| ---- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| SW01 | remote write               | 3 episodes, 0 browser keys                                                                                        |
| SW02 | new-process restore        | **folded, from the server**                                                                                       |
| SW03 | user isolation             | Bob first-time; Alice's records present and not applied                                                           |
| SW04 | workspace isolation        | first-time                                                                                                        |
| SW05 | version boundary           | first-time — a completion belongs to its build                                                                    |
| SW06 | read failure               | unchanged guidance, no error text, no fold                                                                        |
| SW07 | write failure              | Show me still works; nothing blocked                                                                              |
| SW08 | idempotency                | 2 writes of one event → **1 episode**                                                                             |
| SW09 | malformed remote record    | ignored                                                                                                           |
| SW10 | hostile well-formed record | `invented.feature` + `DELETE_ACCOUNT` + another subject's completion: all ignored                                 |
| SW11 | reset                      | `DELETE /v1/subjects` → 0 episodes; next process is a first visit                                                 |
| SW12 | **authority negative**     | nine invoice records in the database; still _"I do not have anything verified about that."_                       |
| SW13 | **permission negative**    | remembered delete guide; permission absent; **no Delete offered**, and the guide does not present it as available |
| SW14 | runtime instances          | `INV-001` appears **0** times                                                                                     |
| SW15 | secrets                    | **0** secret-shaped values                                                                                        |

Privacy sweep across everything persisted: raw queries **0**, raw answers **0**, DOM text **0**,
runtime instance names **0**, secret-shaped values **0**, emails **0**, client names **0**. SW14/SW15
require episodes from the screens that carry instances and secrets before that
sweep counts for anything — an audit pointed out that the first version swept a single episode, from a
screen that had neither on it.

The sweep exempts `applicationVersion` from the long-hex rule and nothing else — a build identity is a
long hex string and so is a token, which is the exemption Closed Loop #19 made in the validator after
an audit. A first version of the sweep did not make it and reported all 25 build identities as
secrets; a gate that cries wolf is not a gate.

## 6. Latency

Statewave calls: **p50 3 ms, p95 10 ms** over 161 calls against a local instance on loopback. That is
a real distribution and it is also the easiest possible one — same machine, no TLS, no contention.

The answer latencies are **not** a measurement. Each is a single stopwatch reading from one run:
**215 ms** for a returning user, **257 ms** with the memory backend unreachable. Two numbers, one
sample each, and they say the failure case was _slower_ on that run — an earlier draft of this
section claimed the opposite, and an audit was right that the numbers cited contradicted the sentence
citing them.

What the architecture actually guarantees is not speed, it is ordering: the answer is computed from
the ProductModel and the RuntimeContext **before** any memory read is attempted, and a memory read
that never returns is bounded by a 5-second deadline. Whether an unreachable backend costs a user
perceptible time is not something this loop measured, and it is not claimed.

## 7. The limitation worth planning around

**`GET /v1/timeline` returns at most 100 episodes, and returns the oldest hundred, with no
pagination.** Measured on every capture run, not read off a document and not remembered from a
session: `metrics.readCeiling` in the evidence file records `inserted: 105, returned: 100,
lowestOrdinalReturned: 1, highestOrdinalReturned: 100, newestReachable: false`, and the capture fails
if the server stops behaving that way. An audit pointed out that the first version of this claim
rested on an ad-hoc command nothing in the repository reproduced, which is the exact criticism the
previous loop earned.

For a memory system that is the wrong half to lose. Past a hundred interactions, a subject's _recent_
completions become unreachable while their oldest stay. The adapter reports such a read as
`truncated` and degrades rather than presenting it as complete, and `statewaveAdapterStatus.readCeiling`
states it in code. `POST /v1/context` does return the newest thirty with payloads intact, but it is a
ranked, token-budgeted assembly rather than a query — using it as the read path would put a retrieval
system inside the one place this project has spent five loops keeping deterministic.

A production deployment needs either a narrower write policy or a paginated episode read that
Statewave does not currently expose. This is the reason the answer below is not an unqualified yes on
every axis.

## 8. Found by running

**The e2e harness had been serving IPv6 only.** `vite preview` binds `localhost`, which Node resolves
to `::1` first, while every probe and every spec in this repository addresses `127.0.0.1`. The
readiness probe could never reach the server it had just started. `--host 127.0.0.1` binds the stack we
address.

**The fixture's network observer swallowed the memory transport.** The benchmark application installs
an observing `fetch` that answers every request from its in-memory routes and never falls through —
that is how it "physically cannot reach anything real", which earlier loops depend on and which must
stay true. Guide memory is not part of the fixture's API, so every memory request came back 404 and
the guide looked like it had forgotten everybody. The page now captures the browser's own `fetch` in
the document, before the first module is evaluated, because a module-scope capture is already too
late: importing the runtime is what installs the observer.

Neither was reasoning. Both took a browser.

## 9. The numbers

|                                  |      Before |       After |
| -------------------------------- | ----------: | ----------: |
| ProductModel claim-set hash      | `bb27c5db…` | `bb27c5db…` |
| ProductClaims                    |         113 |     **113** |
| Static title set                 |           — |   unchanged |
| Memory-created facts / actions   |           — |   **0 / 0** |
| Raw queries persisted            |           — |       **0** |
| Raw answers persisted            |           — |       **0** |
| DOM text persisted               |           — |       **0** |
| Runtime instance names persisted |           — |       **0** |
| Secret-shaped values persisted   |           — |       **0** |
| Cross-user leaks                 |           — |       **0** |
| Cross-workspace leaks            |           — |       **0** |
| Remote episodes / bytes          |           — | 26 / 15,080 |
| Tests                            |        1461 |    **1508** |
| Gates                            |         118 |     **129** |

Nothing in the ordinary loop needs a Statewave, a credential or a network. Precisely: `pnpm verify` is
`build && typecheck && test && lint && format:check`, and the adapter's own suite inside `pnpm test`
fakes at the **socket** — so the real SDK, the real adapter and the real validator all run and only
the connection is invented. The eleven `test:statewave-*` gates run under `node scripts/gates.mjs`,
which is the canonical runner CI uses, and they fake at the socket too. An earlier draft of this
paragraph said `verify` ran those gates; it does not, and an audit caught the conflation. The
scenarios that need a server are `capture:statewave`, which skips itself rather than faking when none
is configured.

## 10. Review artifact

**`statewave-persistence-review-v1` — UNSCORED.** Seven paired items, every score `null`, reviewer
type `non_human_independent`, `FORMAL_HUMAN_VALIDATION_GATE` deferred until pre-release. It exists
only because a real round trip happened; the capture refuses to run against a fake.

Each item carries `browserStorageUsed`, which is **0** on every side — the continuity a reviewer is
being asked to judge came from a server, not from the machine.

## 11. What an adversarial audit found

Agents were pointed at the adapter with a real server to attack and at the report with instructions to
check every number. They found two **blocking** defects in the code, and rather more in what I had
written about it.

**Both code defects were the same mistake in two places: a value read more than once between being
checked and being used.**

Closed Loop #19.1 closed an inherited `toJSON` by returning a plain copy of the validated event. It did
not close an own **accessor**: the rules read each field several times and the copy read it once more
at the end, so a getter that answered well while being validated and badly on its final invocation
decided what got stored — a raw question, an email, a JWT and an API secret all reached Statewave that
way. The test that "proved" otherwise had its read count tuned to the number of reads on the day,
which is a coincidence with a number in it rather than a defence. `validateMemoryEvent` now snapshots
every field **once, before a single rule runs**, and the new test counts the reads and asserts there
was exactly one.

`scopeKey` had it too, in four lines instead of four hundred: it validated one read of each field and
interpolated a second into the key. A scope whose `subjectId` changed between the two produced a key
for a subject it was never allowed to name — `read()` returned the victim's events and `clear()`
deleted their subject. It also accepted missing ids, so every scope lacking them shared the literal
key `statewave-guide:undefined:user:undefined`.

**Four more real defects**, all fixed: `read()` threw at the caller instead of degrading when the scope
could not make a key; a degraded mode latched forever, so one bad response made every later read
report a broken system; the demo backend republished the upstream error message to the browser on the
success path, in a file whose comment says it never does; and its status route handed the browser the
Statewave base URL, in a file that promises the page never learns one. The `eventId` exemption from the
instance-shape rule is gone too — #19.1 added it because the id generator collided, and fixed the
generator in the same change, so the exemption was buying nothing and letting a caller park `INV-001`
in an event id.

**Two gaps in what was tested**, both now closed. The browser-side store — the code every scenario a
user walks actually runs — had no unit tests at all; it has twelve. And "deterministic" had only ever
been tested as "clock-free", never as order-independent, which is the half that matters when events
come back from a database: forty deterministic shuffles now have to produce the same profile and the
same plan. That test immediately found that the projection counted a **repeated delivery** of one
event as two things happening. Statewave deduplicates writes by idempotency key, which is proved
against the server, but a replica answering a retry or a caller reading twice would have inflated the
counts. The projection now collapses by event id as well.

**And the report was wrong in six places.** SW01 wrote 3 episodes, not 4. The latency section cited two
single stopwatch readings as though they were measurements — and the numbers it cited said the failure
case was _slower_, contradicting the sentence citing them. "A different browser process" was a second
`BrowserContext` in one Chromium. The 100-episode ceiling rested on an ad-hoc command nothing in the
repository reproduced; it is measured by the capture now. `pnpm verify` does not run the
`test:statewave-*` gates, which I said it did. SW13's assertion passed whenever the guide said nothing
at all, and SW14/SW15 swept a single episode from a screen that had neither an instance nor a secret on
it. All corrected above, and the review package now lists `reusedCaptures` — SW02 is the left-hand side
of six of seven items, which a reviewer should be told rather than left to notice.

## 12. Limitations

**The 100-episode read ceiling** (§7) is the one that matters.

**`X-Tenant-ID` is asserted, not verified**, so Guide does not use it as an isolation boundary.
Isolation comes from the subject namespace, which the backend controls.

**The demo backend trusts the browser's scope** (§2), and says so in its own status output.

**One Statewave instance, on one machine.** Nothing here says anything about latency across a real
network, about a server under load, or about a deployment with authentication enabled — the adapter
carries a key when the host configures one, and that path is gate-tested but has not been exercised
against a server that requires it.

**Two id shapes a host cannot use, and both refuse silently.** The instance-shape rule refuses
`user1024` and `tenant01` as ids — it cannot tell them from `INV-001` — so a host naming subjects that
way records nothing, and the only sign is `rejectedOnWrite` climbing in the inspector. And
`applicationVersion` is exempt from the long-hex rule, so a host that puts a secret in its own build id
will persist it. Both are stated in [ADR 0032](adr/0032-remote-memory-persists-experience-not-authority.md).

**Nothing verifies the wire format against a live Statewave except the capture.** The gates fake at the
socket, which is what keeps `pnpm verify` offline, but it means the request shape they assert is this
author's model of the SDK. If Statewave 1.5 changed a field name, `capture:statewave` would notice and
no gate would — and no `test:` gate runs the capture, by design, because a gate that needs a database
is a gate that gets disabled.

**Nothing here says whether being remembered is worth it.** That is what the review is for, and
`NEITHER` remains a permitted answer on every item.

---

**`DEVELOPMENT_STATEWAVE_PERSISTENCE_REVIEW` — UNSCORED.**
**`FORMAL_HUMAN_VALIDATION_GATE` — `DEFERRED_UNTIL_PRE_RELEASE`.** Unchanged, unattempted.

No live model was called. No RAG — Statewave's compiled memories are never read. No autonomous
actions. No chat transcript persisted. The memory event taxonomy, the authority classes, the scope key
model and the version-scoping semantics are exactly as Closed Loop #19 left them.
