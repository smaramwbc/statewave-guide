# Closed Loop #10 — Behavioural Evidence → ProductModel

**Hypothesis.** Can `BEHAVIOR_VERIFIED` runtime evidence become accepted ProductModel capability
claims without weakening static verification, semantic-language authority, title authority,
ownership, provenance or contextual truth?

**Answer: PARTIALLY.** Seven capabilities entered the model and two features gained a purpose that
seven rounds of static analysis could not produce. Nothing was weakened — but that sentence is only
worth writing because the loop first produced a false claim, shipped it into a review package, and
had to be stopped by a rule that did not yet exist.

---

## 1. What changed

ADR 0019 built the runtime subsystem and stopped short of the Product Model on purpose: a browser
could see `clients.search` narrow a table from five rows to two, and nothing downstream read it.
This loop connects the two.

```
ApplicationGraph  ┐
                  ├→ claim → verifier → ProductModel → GuidanceIR → renderer
RuntimeEvidence   ┘
```

One model, not two. A behavioural claim faces every check a structural one faces — it simply
satisfies them with an observed effect rather than a graph path.

|                                       | Round 7 | Round 8 |
| ------------------------------------- | ------: | ------: |
| ProductModel claims                   |     106 |     113 |
| — structurally verified               |      41 |      41 |
| — behaviourally verified              |       0 |       7 |
| Features emitting a purpose           |       4 |   **6** |
| Features emitting a summary           |       5 |   **7** |
| Questions answered                    |      10 |  **12** |
| Titles emitted                        |      13 |      13 |
| Action steps                          |      31 |      31 |
| Checkable facts in the review package |      60 |  **93** |

The static half is byte-identical: `test:runtime-productmodel-integration` compares the serialised
static claims against the frozen Round 2 capture and fails on a single changed byte.

### The headline

`clients.search` has been refused for seven rounds. The graph proves a text box and a chain of hooks
no relationship expresses; `GET /api/clients` proves listing, not searching. Round 6 scored it 1 with
the note _"it never tells the user what to enter"_.

It now says:

> **Lets you filter clients.**

on the strength of one observed effect — a membership count going from five to two, with no
navigation to explain the replacement. The word _search_ appears nowhere. `filter` is the narrowest
true thing, and `search` remains absent from the rule table deliberately: a collection narrowing
proves filtering and says nothing about _where_ the filtering happened.

`settings.form` gained _"Lets you change a setting."_ the same way, from an observed `PUT`.

---

## 2. What was refused, and why that took longer to build

Five of twelve probes produced no claim.

| Control                | Proposed          | Refused because                                          |
| ---------------------- | ----------------- | -------------------------------------------------------- |
| `clients.export`       | `create`          | `NO_WRITE_OBSERVED` — no POST inside the interaction     |
| `client-detail.delete` | `delete`          | `NO_WRITE_OBSERVED` — a row leaving a screen is a render |
| `client-detail.audit`  | `reveal`          | `NOTHING_APPEARED`                                       |
| `invoices.list.open`   | `select`          | `NAVIGATION_OCCURRED`                                    |
| `invoices.list.clear`  | `clear_selection` | `NO_SELECTION_CHANGE`                                    |

### The rule that could not fail

`select` was written as _"something appeared, **or** the route changed"_ — a disjunction almost every
click on earth satisfies. It verified `invoices.list.open`, and the compiler emitted

> ~~Lets you select an invoice.~~

into the Round 8 package. The control does not select an invoice. It leaves the invoice list and
shows a **client**: `selectRow` calls the page's `onSelect`, which navigates to `/clients/c1`. The
sentence was wrong, it was checkable, and it reached a review artefact.

Three things about this are worth keeping.

**The rule ran and passed.** It was not skipped or misconfigured. A rule broad enough to be always
satisfied is not a check, and it looks exactly like a check from the outside — including in a green
test suite.

**The evidence was never wrong.** The trace recorded the route change accurately, and the `navigate`
rule verifies the same trace without complaint. Only the interpretation was wrong.

**The proposal came from an identifier.** `select` was proposed because the control is called
`invoices.list.open` and the handler is called `selectRow` — the same identifier-as-authority
substitution ADR 0018 removed from titles, reappearing one layer up as a hypothesis nobody checked.
Observation is what refuted it, which is the system working; a rule loose enough to agree with the
identifier is what let it through anyway.

`select` now requires an observable collection change **and** no navigation. That refuses this
control, correctly: nothing here selects anything a browser can see. The fixture's row does mark
itself with a CSS class, and a class is not an accessibility signal — if the interface does not tell
assistive technology that a row is selected, the pipeline is not entitled to know it either.

### One rule, stated twice, will disagree with itself

The loose `select` existed in **two** places — the runtime verifier and the semantic integration
table — written independently, identically wrong. `MECHANISM_ACTIONS` had the same shape: the
language layer withheld _"Lets you show a setting."_ for `settings.rotate-key` while the older
summary path, running off its own hard-coded `submit`, emitted

> ~~You can show a setting using "Rotate API key".~~

from the very same claim. Both are now single exported lists. This is the standing hazard the loop
leaves behind, and it is recorded in ADR 0020 rather than in a comment.

---

## 3. What was not weakened

Each of these is a gate, not a claim.

**Ownership.** `test:runtime-productmodel-integration` re-derives every feature's `FeatureScope` and
requires each behavioural claim's subject to classify `OWNED`. Evidence arriving from a browser buys
no relaxation.

**Provenance.** `test:runtime-claim-provenance` resolves every claim back to its trace in the
committed record and requires the action, subject and graph hash to agree; every cited effect must be
one that trace actually holds. Runtime evidence is labelled `kind: 'runtime'` and static evidence may
not borrow the label — they share an array, and the moment "the graph proves this" and "a browser
once did this" read the same to a consumer, the distinction has stopped existing.

**Context.** `test:runtime-context-preservation` requires the route, fixture state, permissions and
flags to travel with the claim unmodified. Nothing compiled from a behavioural claim may assert a
permission: the run observed what _one_ permission set could do and never established that the
permission was required.

**Contradiction.** `test:runtime-static-contradiction` reports zero conflicts — which is worth
nothing on its own, because a detector that never fires and one that _cannot_ fire print the same
line. It therefore builds records that conflict with static claims that really exist in the frozen
capture, requires each to be refused, and only then reports the zero. Where the two disagree neither
wins: the record is refused and surfaced for a person.

**Language and naming.** Every Closed Loop #7 and #8 rule is untouched. A run establishes a
capability and nothing else — no endpoint, no permission, no name. `test:runtime-review-fact-coverage`
and `guidance-round-7-vs-8` both enforce it.

**Typed, not cast.** `ProductClaim` now declares `runtimeContext` and `runtimeTraceId`, and
`SemanticEvidence.kind` includes `'runtime'`, with matching Zod schemas. The first implementation
reached the Product Model through `as unknown as ProductClaim` and `'runtime' as never` — the fields
were real, the contract said they did not exist, and the compiler had been told to stop asking.

---

## 4. The review instrument had to change too

A reviewer scoring _"Lets you filter clients."_ must be able to check it, and no static fact can. So
the fact list carries what was **observed**, described as an effect:

> Typing into one control on this screen that the interface does not name reduced a visible
> collection on the screen from 5 items to 2.

and never as a conclusion (_"the Search feature searches clients"_), which would hand the reviewer
the interpretation they are being asked to score. Thirty-three of the ninety-three facts in Round 8
are behavioural.

Closed Loop #8's naming rule applies inside the evidence list as much as in the guide: a control is
named by a label the interface shows, or described as unnamed. `invoices.list.open` is a real row
control with no accessible name, and calling it _"the Open control"_ here would smuggle an identifier
into a reviewer's evidence.

Coverage is 53/53 propositions, 32/32 action steps, 13/13 control names, 13/13 titles, with no
exclusions. A reference is checkable two ways now — the structure says so, or a browser was watched
doing it — and the gate accepts either.

**Round 8 is issued and unscored.** Seed `20260901`, same twenty-one features, Round 7 immutable.

---

## 5. Honest debts

**Fifteen features still emit no purpose**, and eleven of them can verify no capability from either
source.
`api.get.partial-clients` has no runtime surface at all, and nothing should invent one for it.

**`settings.rotate-key` keeps a capability whose sentence is withheld.** The run demonstrably reveals
something; what it reveals is a `<code>` block Closed Loop #9 refuses to name because its text is a
value, not a label. Without that noun the object falls back to the feature's namespace and the
sentence misdescribes the one thing it was meant to describe. The claim is in the model; the sentence
is not. Unknown beats wrong.

**Entry-step naming debt is unchanged at 17 steps**, all identifier-derived: _Clients_ (6),
_Settings_ (5), _Client Detail_ (4), _Dashboard_ (1), _Invoices_ (1). Thirteen are backable by a
navigation label the interface actually displays. Four are not — nothing in the application ever
writes the words _"Client Detail"_.

**Two layers encode rules for the same actions.** The runtime verifier checks a live trace; the
integration table re-checks the serialised record, because a record is a file and a file can be
edited. That redundancy is deliberate defence in depth, and it is also exactly how the `select` bug
came to exist twice. There is no gate that proves the two tables agree.

**One fixture, one build, one seeded data set, one permission set.** Every behavioural claim here is
true of that run. The context travels with the claim so that a later consumer can tell; nothing yet
_uses_ it to scope what a claim licenses.

---

## 6. Verification

1211 tests pass. Twenty-four quality gates pass, five of them new. `pnpm verify` is green;
`git diff --exit-code` is clean at the checkpoint.

The gate that mattered most fired on its own during the loop: `emit-evidence` refused to accept a
regenerated runtime artefact after the rules moved, forcing the evidence to be re-earned rather than
quietly rebased.
