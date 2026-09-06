# Closed Loop #19 — Statewave Memory & Adaptive Guidance

**Hypothesis.** Can Statewave Guide remember a user's previous guide interactions and adapt future
guidance across sessions, without letting memory create product facts, capabilities, permissions,
routes, titles, semantic ids, or resolve anything the evidence refuses?

> **Later.** Closed Loop #19.1 acted on the independent review of this work. The completion sentence
> below no longer ships, the inferred Show me emphasis is reported as changing nothing rather than
> dressed up, and _"inside the list"_ is fixed. This report is left as the record of what #19 shipped.

**Answer: PARTIALLY.** The separation holds under every attack this loop could build, and it holds in
a real browser across reloads. What is not established is whether being remembered is worth it —
which is the same shape of answer the last two loops gave, for the same reason: it is a question about
people, and there is a review for that.

---

## 1. Why this was the dangerous one

Every previous loop added a source of evidence and then spent its length deciding what that source
may not establish. Memory is different in kind. It is not evidence about the product at all, and it
is the most tempting thing in the system to reason from:

> The user opened an invoice yesterday. Therefore these rows are invoices.
> The user had delete permission last week. Therefore show them Delete.
> The user pressed Show me three times. Therefore they prefer it.

All three are the same mistake. **A record of what a person did is not evidence about what a product
is** — and the third is the subtle one, because it is a claim about somebody's mind that only they can
make.

## 2. Four layers, four questions

| layer                  | answers                          |
| ---------------------- | -------------------------------- |
| ProductModel           | what the product is              |
| RuntimeContext         | what exists now                  |
| RuntimeVisibleLanguage | what the user can see now        |
| Statewave Memory       | what this person has done before |

## 3. The boundary is a stage, not a rule

```
GuideQueryResponse → MemoryAdaptationPlanner → GuidePresentationPlan → renderer
```

The planner receives a verified response and returns a **plan**. There is no code path by which it
could rewrite an answer, remove a step or add an action, because it never holds the response as
something writable. The original sits beside the plan, so _"the facts did not move"_ is a comparison a
test makes rather than a promise a comment offers.

`stepCount` travels with the plan precisely so a renderer showing fewer steps than exist is caught.

## 4. What is stored

```json
{ "featureId": "clients.create", "kind": "STEP_THROUGH_COMPLETED" }
```

Plus `eventId`, `appId`, `subjectId`, optional `workspaceId`, `occurredAt`, `applicationVersion`,
`authority`, and bounded `metadata` (`preference` | `value` | `stepCount`). **1,700 bytes** for a full
session's history.

Never stored: the question, the answer, DOM text, placeholders, accessible names, runtime instance
labels, input values, client names, invoice ids, keys, tokens, or anything secret-shaped. Refused **by
shape at the boundary**, on the way in and on the way out, because memory is untrusted persistence
that anyone with developer tools can edit.

Six event kinds. Three authority classes: `OBSERVED_INTERACTION`, `EXPLICIT_USER_PREFERENCE`,
`DERIVED_ADAPTATION`.

## 5. The rules with teeth

**Completion must be observed.** _"You've completed this guide before"_ appears against a recorded
`STEP_THROUGH_COMPLETED` for that feature on that build, and nothing weaker. Viewing is not
completing. Show me is not completing. Starting the steps is emphatically not completing them.

**An observation is not a preference.** Three Show me presses license _emphasis_, recorded as
`DERIVED_ADAPTATION`. `EXPLICIT_USER_PREFERENCE` exists only for what somebody actually chose, and it
outranks any pattern.

**Version scopes history; preference does not.** A guide completed against a build the application has
moved past is history, not a reason to collapse today's instructions. A request for concise answers is
about how a person wants to be spoken to and survives the product shipping.

## 6. What a returning user sees

| first time                               | returning                               |
| ---------------------------------------- | --------------------------------------- |
| New client                               | New client                              |
| Lets you create a new client.            | Lets you create a new client.           |
| You need permission to create a client.  | You need permission to create a client. |
| 1. Choose "New client" … (3 steps shown) | _You've completed this guide before._   |
|                                          | **Show full steps (3)**                 |
| [Show me] [Step through]                 | [Show me] [Step through]                |

Same verified sentence, same condition, same actions, same three steps — one click away instead of on
screen, plus one closed sentence.

## 7. M01–M15, in a real browser

All pass. The ones worth naming:

- **M10** — a user with six invoice memories, on a client screen where nothing establishes the
  concept, still gets _"I do not have anything verified about that."_ The refusal is byte-identical
  with memory on and off.
- **M11** — a remembered delete guide does not make Delete appear in a session without the
  permission.
- **M06** — three failure modes (throws, malformed, unknown kind), each producing the neutral plan,
  which is byte-identical to a build with no memory. No provider diagnostic reaches a user.
- **M15** — a hand-written `localStorage` record with `featureId: invented.feature`,
  `kind: DELETE_ACCOUNT`, `route: /admin` and an instruction is ignored — not because it was
  recognised as hostile, but because it is not in the closed taxonomy.
- **M07/M08** — a second opaque id in the same browser gets nothing; a second workspace gets nothing.
- **M03** — three Show me presses make Show me visually primary **and** add the line _"Based on how you
  have used Guide before"_, which is what makes the change something a person can actually see.

## 8. The numbers

|                                  |      Before |       After |
| -------------------------------- | ----------: | ----------: |
| ProductModel claim-set hash      | `bb27c5db…` | `bb27c5db…` |
| ProductClaims                    |         113 |     **113** |
| Static title delta               |           — |       **0** |
| Raw user text persisted          |           — |       **0** |
| Runtime instance names persisted |           — |       **0** |
| Secret-shaped strings persisted  |           — |       **0** |
| Cross-user leaks                 |           — |       **0** |
| Cross-workspace leaks            |           — |       **0** |
| Tests                            |        1373 |    **1436** |
| Gates                            |          93 |     **110** |

## 9. Found by running, not reasoning

The memory hook depended on the **options object**, which a host recreates on every render — so the
load effect refired every render, which re-rendered, which refired it. In Playwright it looked like a
click that never completed. In production it would have looked like a tab that was inexplicably hot.

The second one is better. A scenario that presses Show me three times kept finding **one** event in
storage, not three. `append` read the whole bucket, pushed, and wrote it back, and two writes in flight
together each wrote a copy of what they had read — so a question and a click landing at the same
moment left one of them behind. Every unit test passed throughout, because a unit test does one thing
at a time. Appends are queued now.

Both took a browser. This is the fourth loop in a row where the real defect came from running the
thing rather than reasoning about it.

## 10. Statewave

**No adapter is wired, and the reason is in code rather than in a document that can drift from it**
(`statewaveAdapterStatus`):

1. There is no Statewave JavaScript client in this repository, its dependencies, or the installed
   store. **(Wrong — see Closed Loop #20. `@statewavedev/sdk` is published on npm. The rest of this
   section's reasoning held; its premise did not.)**
2. The Statewave surface available here is an **MCP tool server** — agent-side, and not importable by
   a browser package.
3. Writing one anyway would have meant inventing an API and then testing the invention.
4. `pnpm verify` must pass with no credentials and no network. It does.

The contract is stated so it can be reviewed now: a scope is a **subject**, an event is an **episode**
of a bounded **kind**, and the three store methods map onto that vocabulary. Statewave provenance
proves a record exists; it never proves that what the record describes is currently true.

## 11. Why PARTIALLY

The separation half is answered as thoroughly as this project knows how. Memory cannot create a fact,
a capability, a permission, a route, a title or a semantic id; cannot resolve what the evidence
refuses; cannot survive a version change where it would matter; cannot reach another subject; and
cannot cost truthfulness when it fails. Seventeen gates, sixty-three unit tests and fifteen browser
scenarios say so, and ProductModel delta is zero.

The usefulness half is not answered. Three adaptations exist — collapse, emphasis, one sentence — and
whether that is the _useful_ adaptation or merely the _safe_ one is exactly what an independent review
is for. The previous two rounds both found the guide adding words that were true and not worth
reading; it would be consistent for a reviewer to find the same here, and the instrument accepts
`NEITHER` on every pairing.

### What an adversarial audit found

Agents were pointed at the memory layer with instructions to make it establish something. **It
established nothing** — every attempt to fabricate a fact, an action, a permission, a preference
authority or another subject's history was refused, and `metadata` held under every attack, where the
closed field list and bounded unions turned back everything.

They found thirty-six other things, in three groups.

**A pattern in my own validation: every field exempted from a general rule had no specific rule in its
place.**

| hole                                                                                                     | closed by                                    |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `occurredAt` exempt from length _and_ prose checks — a raw question persisted verbatim                   | an ISO-timestamp shape                       |
| `applicationVersion` exempt from three rules, not one — 128 characters of prose passed                   | a build-identity shape                       |
| fields **read** through the prototype chain, **scanned** own-properties only                             | own-property reads on both halves            |
| `:` legal in ids, so a subject could forge another's storage key                                         | an opaque-id charset, enforced in `scopeKey` |
| secret patterns recognised prefixes, so AWS, Google and Slack keys passed                                | shapes for credentials without one           |
| version scoping **failed open** when the session supplied no version                                     | an unknown version is not a match            |
| the browser store trusted the bucket a record was found in                                               | a record's own scope must match its key      |
| `authority` was decorative — a preference stamped `OBSERVED_INTERACTION` still claimed the user chose it | kind and authority must agree                |
| lowercase instance labels (`inv-001`) passed where `INV-001` was refused                                 | the shape is case-insensitive                |
| the closed copy table and kind list were `readonly` at compile time and mutable at runtime               | `Object.freeze`                              |

**Three real defects in the product.** `clear()` ignored `enabled`, so a host with memory switched off
could still erase a bucket. Event ids restarted at `ev1` on every reload, so a second session wrote on
top of the first. And **appends were read-modify-write with nothing serialising them** — a question and
a Show me press in flight together clobbered each other, which is why one scenario kept _one_ event out
of seven and the pattern it existed to demonstrate never appeared. Writes are queued now.

**Two claims I made that the evidence did not support.** Stepping through a _collapsed_ guide walked a
list nobody could see and recorded a completion — Step through unfolds first now. And the derived
emphasis applied the same styling the default already gave Show me, with `data-emphasis` carrying no
rule at all, so "emphasis changed" rested on two byte-identical screenshots. The pattern now states
itself in words as well, and fifteen captures hold nine distinct images rather than six.

**A set of things nothing was watching.** Thirteen gates tested the memory boundary and **none of
them reached the React package**, where the browser store lives and where a person with developer
tools actually writes. Three of the four closed meta-copy strings were asserted nowhere, so the
planner could have emitted one the panel silently dropped. `stepCount` travels with the plan, and a
comment in the panel says it exists so that a renderer showing fewer steps than exist is caught —
nothing was comparing them. `onThemeIssues` depended on the whole props object, which is the render
loop again in a second place; a host passing an inline `store` would have reintroduced it in a third.
And the rule that interaction patterns are _not_ version-scoped while feature history is — the
distinction between a claim about this build and a claim about this person — existed only in my head.
Fourteen React tests, a gate that reaches that package, two unit tests and a paragraph of `architecture.md` that
describes the memory the guide actually uses.

The review instrument had its own set, all corrected: metrics hardcoded rather than derived from the
capture, a pairing described as one user when it was two, an instruction that asserted the answer to
one of the package's own questions, a rubric dimension whose direction fought its wording, a misquoted
sentence a reviewer was asked to judge, an action-inventory check that ignored a control, and one
capture standing in four of twelve slots without saying so.

**Limitations.**

Two things the audit surfaced that are not fixable at this layer, and are disclosed rather than
papered over. A **forty-character hex** in `applicationVersion` is stored, because that is also
exactly what a git SHA looks like and no rule here can tell them apart. And a **well-formed forged
record** — right subject, right build, `STEP_THROUGH_COMPLETED` — will collapse the steps of a guide
nobody finished; client-side memory cannot stop somebody lying to their own browser, and the damage
is bounded by the fact that memory may only ever collapse, emphasise and say one sentence.

The browser store is `localStorage`: per-profile, per-device. Correct blast radius for something no
server was asked to hold, and not cross-device continuity.

Memory is presentation-only by construction, so it cannot help with the thing users most often want —
a guide that knows they already have the answer to half a question. Making it do that would require
memory to inform _resolution_, which is a separate authority decision and is not taken here.

A pre-existing Closed Loop #18 wart is visible in these screenshots: `clients.create` sits inside the
page `<section data-guide="clients">`, which the runtime has observed members inside, so the contextual
sentence calls it _"the list"_. It is structurally true and reads poorly. It is **not fixed here** —
the review decision was to stop context-language work, and quietly changing frozen behaviour in a
memory loop would be the wrong way to disagree with that.

---

**`DEVELOPMENT_MEMORY_ADAPTATION_REVIEW` — UNSCORED.** Six paired items, every score `null`, reviewer
type `non_human_independent`.

**`FORMAL_HUMAN_VALIDATION_GATE` — `DEFERRED_UNTIL_PRE_RELEASE`.** Unchanged, unattempted.

No live model was called. No RAG. No autonomous actions. No chat transcript persisted.
