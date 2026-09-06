# 32. Remote memory persists experience, not authority

- **Status:** Accepted
- **Date:** 2026-08-29
- **Extends:** [ADR 0029](0029-memory-remembers-experience-not-truth.md)
- **Corrects:** [ADR 0029](0029-memory-remembers-experience-not-truth.md) — its "no Statewave client
  exists" limitation was wrong

## Context

Closed Loop #19 built guide memory against a `Map` and `localStorage`, and recorded in code why it had
not been wired to Statewave: no JavaScript client existed, the only surface in this environment was an
MCP tool server, and inventing an API would have proved only the invention.

The reasoning was right. **The premise was wrong.** `@statewavedev/sdk` is published on npm at 1.4.0,
has zero runtime dependencies, and speaks the same `/v1` HTTP API the MCP server wraps. I did not look
hard enough, and the note asserted an absence more confidently than it had earned.

What #19 got right was the contract, which turned out to map onto the real API without adjustment:

| Guide                      | Statewave                                 |
| -------------------------- | ----------------------------------------- |
| one `GuideMemoryEvent`     | one episode (`POST /v1/episodes`)         |
| a `GuideMemoryScope`       | a subject                                 |
| reading a subject's memory | `GET /v1/timeline` → `episodes[].payload` |
| forgetting                 | `DELETE /v1/subjects/{id}`                |
| a retried write            | `idempotencyKey`, enforced server-side    |

## Decision

**Statewave is where guide memory is kept. It is not where guide truth comes from.**

Four rules, each with a mechanism rather than an intention.

**1 · The credential never reaches a browser.** Statewave authenticates with a server-wide
`X-API-Key`, and `X-Tenant-ID` is asserted by the caller rather than verified — there is no
user-scoped browser token, so a key in frontend code is a key given to every visitor. The browser
holds a store that talks to the _host application's own backend_; the backend holds the client. A gate
fails if anything in the React package imports the SDK or handles a key.

**2 · The subject is the guide scope, and only the guide scope.**
`statewave-guide:<appId>:user:<subjectId>[:workspace:<workspaceId>]` — the same hardened `scopeKey`
the local store uses, where every part must be an opaque id with no separators. This is what makes
whole-subject deletion the _right_ deletion: "reset Guide memory" erases this app's memory of this
person in this workspace and cannot reach a record Guide did not write. A subject shared with
unrelated Statewave data would have turned that button into one that deletes somebody's other
memories.

**3 · What is validated is what is sent, by value.** The plain object `validateMemoryEvent` returns —
never the caller's. An audit of #19 put a raw question, an email, an instance label and a secret into a
store through an inherited `toJSON` the own-property scan could not see; the destination here is a
network, so the same rule applies with more force. `metadata` and `provenance` are sent empty, because
Statewave passes those bags through verbatim and they are exactly where a well-meaning change would
begin posting page state.

**4 · Reads are episodes, never compiled prose.** Statewave's `Memory` objects are prose a compiler
wrote; `searchMemories` and the compiled half of a context bundle are a retrieval system, and this
project has one knowledge base. The adapter reads `GET /v1/timeline`, filters to its own
`source`/`type`, validates every payload, and discards any record whose own scope does not match the
subject it was found under.

> **Amended 2026-09-03 (Closed Loop #20.2).** This rule was written as "reads are episodes, never
> compiled memories", and the narrowing to _prose_ is deliberate. Guide now reads exactly one field of
> a compiled memory: `metadata.claim`, the envelope it wrote itself, on a claim key the host
> registered. It does so to learn which preference is currently authoritative after Statewave has
> superseded the others.
>
> What the rule was protecting is untouched. `content` and `summary` are never read — a compiler's
> sentences still cannot become product truth. The claim value is not trusted because it came back
> from a memory: it is re-derived through Guide's closed preference vocabulary and then through the
> full event validator, and anything that fails either is dropped rather than repaired. A value
> outside the vocabulary is not this product's preference, whoever wrote it. The adapter's own tests
> pin that with a memory carrying `SUDO`.
>
> The distinction that makes this a refinement rather than a reversal: a claim envelope is _structured
> data from a closed vocabulary that Guide authored_, and prose is a text generator's opinion. The
> first is safe to read back by key. The second never was.

**A Statewave receipt proves that Statewave stored a guide memory record. It does not prove that the
remembered product fact is true now.** Provenance is provenance; it is not evidence about the product.

## Consequences

**The pipeline order is unchanged, and that is the point.** A question is resolved against the
ProductModel and the RuntimeContext, a verified `GuideQueryResponse` is produced, and only then does
memory shape how it is presented. Remote memory enters at the same place local memory did — after the
answer exists. Seeding a real database with nine invoice records does not make an unverified invoice
question answerable, and a remembered delete guide does not make Delete appear for somebody who has
lost the permission. Both are proved against a running server, not argued.

**An outage costs personalisation and nothing else.** A read that fails returns absence, which is the
memory-off state the whole system is built to be indistinguishable from. A write that fails is silent
to the user and counted for a developer. Neither blocks an answer, because the answer was computed
before either was attempted.

**Deletion is real.** `DELETE /v1/subjects/{id}` is the documented erasure boundary and it returns
what it deleted. There is no tombstone to fake and no local-only "forget" that leaves records behind.

**The read ceiling is the sharpest limitation, and it is measured.** `GET /v1/timeline` returns at
most 100 episodes and returns the **oldest** hundred, with no pagination parameter. The Closed Loop
#20 capture measures this every run rather than quoting a number somebody once saw: 105 in, 100 out,
ordinals 1..100, the newest unreachable. Past that point a subject's _recent_ history is
what disappears, which for a memory system is the wrong half to lose. The adapter reports such a read
as truncated and degrades rather than presenting it as complete. A production deployment would need
either a narrower write policy or a paginated read that Statewave does not currently expose.

**`X-Tenant-ID` is asserted, not verified.** Guide does not use it as an isolation boundary; isolation
comes from the subject namespace, which the backend controls. A host that wants Statewave's tenancy as
well should set it server-side and treat it as defence in depth rather than as the boundary.

**The backend decides the subject, and a host that forgets this has built an authorization bug.** The
browser store sends a scope, and the endpoint that receives it is holding a credential the browser
cannot see. If that endpoint takes the scope on trust, any page that can reach it can read, write and
**delete** any subject's guide memory — the whole isolation story collapses into a string a stranger
supplied. The example host in this repository does exactly that, deliberately and disclosed, because
its fixture has no accounts and its scenarios need two people from a query string; it reports
`subjectTrust: CLIENT_ASSERTED_DEMO_ONLY` so it cannot be mistaken for a pattern. A real host derives
the subject from the session it already authenticated, ignores what the page sends, and applies the
same authentication and rate limiting it applies to any other write endpoint it owns.

**Deduplication happens twice, on purpose.** Statewave collapses a retried write by idempotency key —
proved against a running server — and the profile projection collapses a repeated _delivery_ by event
id. The second is not redundant: it is what keeps the profile correct when the store is a replica that
answered a retry, a caller that read twice, or something other than Statewave entirely.

**Two shapes a host cannot use as ids, and both refuse silently.** The instance-shape rule — added so a
label read off a screen (`INV-001`) can never be persisted as an identifier — also refuses ordinary
ids like `user1024` and `tenant01`, because it cannot tell them apart. A host that names subjects that
way records nothing at all, and the only sign is `rejectedOnWrite` climbing in the developer
inspector. The rule stays, because the failure it prevents is worse than the one it causes and a host
can pick a different id shape; the constraint is stated here because discovering it from an empty
memory would be miserable.

The mirror of it: `applicationVersion` is exempt from the long-hex rule, because a build digest is
indistinguishable from a hex-encoded token. A host that puts a secret in its own build id will persist
it. Every other secret shape still applies to that field.

**Core does not know any of this exists.** `GuideMemoryStore` is three methods. A Map satisfies it, so
does `localStorage`, and so does a database across a network — and a gate asserts that none of the
browser-bound packages depend on the SDK or the adapter.
