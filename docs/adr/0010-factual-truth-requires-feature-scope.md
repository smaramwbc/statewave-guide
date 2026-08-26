# 10. Factual truth is not enough — a claim must be true _of this feature_

- **Status:** Accepted
- **Date:** 2026-08-26
- **Extends:** [ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md)

## Context

ADR 0007 decided that every claim must cite the graph, and gave the verifier two gates: an id that is
not in the graph fails with `UNKNOWN_GRAPH_REFERENCE`, and an id that is in the graph but not in this
feature's evidence pack fails with `NO_SUPPORTING_EVIDENCE`. Round 1 of the semantic pipeline ran
against a real model and a real fixture, and those gates held. No claim reached the Product Model
citing a node that does not exist. No claim reached it citing evidence that was not present.

What Round 1 did not prove — and could not, because nothing in the pipeline was asking the question —
is that a claim which passes both gates is a claim about the feature it was written for.

An evidence pack is a neighbourhood. Neighbourhoods contain siblings. A claim can name a real node,
cite a real relationship, satisfy every dimension of its verification rule, and be a description of
the feature next door.

## The finding

Feature `settings.new-key` is a `<code>` element that displays a freshly rotated API key. It shows a
value. It has no behaviour of its own.

The model — claude-opus-5 — produced this claim for it, and the verifier accepted it:

```
text:    "Settings changes are saved by submitting the settings form."
type:    capability, action: submit
subject: element:settings.form
targets: element:settings.form
         function:…SettingsPage.tsx#saveSettings
```

Nothing here is broken. The settings form really does submit. `saveSettings` really is its handler.
The relationship cited is real, the subject is a known identity, the evidence was in the pack, and
every dimension of the `capability`/`submit` rule was satisfied. Both of ADR 0007's gates asked their
question honestly and got a truthful answer. Neither gate asked whether the subject was _this
feature's_. The claim occurred in two runs out of three.

The mechanism is precise and worth stating exactly, because the fix follows from it:

- `element:settings.new-key` has **zero** outgoing relationships.
- `element:settings.form` has `submits_to`.
- Both are contained by `component:…#SettingsPage`.

The only route from the feature to the form goes **up** a `contains` edge into the shared page and
back **down** into a sibling. The pack builder's traversal is undirected, so it walked that route
without noticing it had turned around, and the verifier had no notion of direction to check against.

The failure is not a bad model, a weak prompt, or a hallucination. It is a missing concept. The
pipeline knew what was in the pack and had no way to say what the feature _owned_.

## Decision

> **A factual claim is not valid for a `ProductFeature` merely because the claim is true somewhere
> inside that feature's `EvidencePack`.**

The rule that decides ownership:

> A feature owns what it reaches by walking **forward** out of its own roots along edges that describe
> behaviour. It never owns what it reaches by walking an edge **backwards** and descending somewhere
> else.

**Ownership is a path, never a distance.** The path is recorded, not just the verdict, so "why does
`clients.create` own `api:POST:/api/clients`?" has a checkable answer:
`invokes > opens > renders > submits_to > calls > calls_api`.

Applied to the finding: `settings.new-key` has no outgoing edges, so it owns exactly itself and the
claim is refused. A feature genuinely rooted at the form owns `submits_to` on its first hop, so **the
identical claim still verifies there**. Wrong feature rejects, right feature accepts, and the only
difference between the two is the direction of one edge. That positive control is what tells us the
gate discriminates rather than simply tightening.

### The four scope classes

Where the pipeline previously had two answers — in the pack, or not — it now has four, because a pack
holds four genuinely different things.

| Class        | What it means                                  | May be a claim's subject | May satisfy a rule dimension | May be cited |
| ------------ | ---------------------------------------------- | ------------------------ | ---------------------------- | ------------ |
| `OWNED`      | This feature does it                           | yes                      | yes                          | yes          |
| `REACHABLE`  | This feature causes it, further down           | no                       | yes                          | yes          |
| `CONTEXTUAL` | Where it lives, or a fact _about_ what it owns | no                       | **by basis**                 | yes          |
| `OUTSIDE`    | Something that merely sits beside it           | no                       | no                           | no           |

`OUTSIDE` is an answer, not an absence. A node may be in the pack deliberately — so the model can see
what the feature is _not_ — and still be something the feature may never speak for.

**`CONTEXTUAL` splits by basis, and the split is load-bearing.** The two kinds of context are not
interchangeable:

- A schema reached by `validates_with` (basis `supporting-detail`) **may** satisfy a rule dimension. A
  `constraint` claim is _about_ a schema; if the schema cannot be a witness, no constraint can be
  proved at all. It is never expanded, so a schema shared by two endpoints cannot bridge their
  features.
- The page a feature sits on (basis `containment-ancestor`) **may not**. It is citable context — a
  reader wants to be told where to go — but it proves nothing about the feature.

That distinction had to exist independently of the citation gate. `workflow_step` constrains only
`nodeKinds`, so a page in the pack satisfies it on kind alone. Measured before the witness gate was
added, 203 of 203 cross-page citations were accepted, including `clients.create` describing the
settings page. A citation gate alone would have moved the misattribution up one node rather than
stopping it.

### Two ownership boundaries

Ownership walked forward without limit would swallow the application. Two boundaries stop it, and
neither is a hop count.

**The API endpoint is the frontier.** A feature owns the _endpoint identity_ it calls. The controller,
the service, the repository and `db.query` behind it are `REACHABLE`. This is the line between what
the product does and how it is built, and it is where a product description should stop. Measured on
`clients.create`, the owned node count fell from 28 to 20 once backend internals became `REACHABLE` —
and the endpoint itself, the thing the capability claim is actually about, stayed owned.

**Shared infrastructure is nobody's feature.** A node reached along a structural edge that many other
nodes also reach along that same edge belongs to none of them. Fan-in separates these cleanly on the
fixture: `lib/http.ts#unwrap` has 13 callers, `db.ts#query` has 11, `hasPermission` has 5,
`primitives/Button` has 8 incoming `renders`. Feature-specific functions have exactly one. Fan-in is
measured per edge type, because the same node can be shared as a component and specific as a caller.

### Two new rejection reasons

| Situation                                      | Reason                 |
| ---------------------------------------------- | ---------------------- |
| Subject is real, but not this feature's        | `SUBJECT_OUT_OF_SCOPE` |
| A cited target is real, but not this feature's | `TARGET_OUT_OF_SCOPE`  |

These are deliberately **not** `UNKNOWN_SUBJECT`, and the reason is about the person reading the
refusal. `element:settings.form` exists. Telling a maintainer "no such thing" about something that
demonstrably does exist sends them looking for a typo in a correct id, and they will not find one. The
refusal they need to read is "this is real, and it is not yours" — which points at the actual problem,
which is attribution.

## Two supporting changes the finding forced

Neither is cosmetic. Both were structural gaps the ownership rule exposed rather than caused.

**1. The indexer now emits `submits_to` from a submit control to its enclosing form's handler.** A new
`InferenceRule`, `submit-control-in-form`, at `STATIC_INFERENCE` confidence 0.9. The reason is that
`contains` is flat: measured on the fixture, 62 `contains` edges, **zero** of them element-to-element,
every source a component. A submit _button_ therefore had no outgoing behaviour of its own and could
only support a submit claim by citing the _form's_ edge — which is structurally the same borrowing as
the bug. Three easy-band features were affected: `settings.save`, `invoices.create-form.submit` and
`clients.create-dialog.submit`. A control carrying `form="some-id"` from outside the form gets no
edge; the fixture's own footer button names `settings-form` and no element declares that id, so it is
unprovable and stays unproved.

**2. The evidence pack is seeded from the ownership closure before its undirected BFS.** The BFS
reached siblings as readily as the behaviour path. Measured, `clients.create`'s pack held 13 sibling
elements while omitting every `submits_to` and `calls_api` edge on its own path — so no
`capability`/`create` could be proved for the flagship feature of the fixture. The pack was starving
the right claims and feeding the wrong ones at the same time.

Seeding ancestry from the roots only mattered as much. `primitives/Button` has 8 incoming `renders`,
so walking backwards out of every owned node reached every page in the application: SettingsPage,
InvoicesPage, DashboardPage and ClientDetailPage were all "where `clients.create` lives". The
contextual set fell from 14 to 3.

## Consequences

**We accept:**

- **`client-detail.delete` can no longer offer a delete capability.** Its chain is
  `element:client-detail.delete --invokes--> askToDelete`, and `askToDelete` goes nowhere. The
  confirm-dialog indirection breaks the path before the `DELETE` endpoint, so the graph cannot prove
  this feature deletes anything. It is a real feature and we now say less about it than we did. That
  is the correct trade: the previous behaviour proved nothing either, it merely borrowed something
  nearby that looked close enough.
- **`clients.table` cannot reach `api:GET:/api/clients`.** The element has no outgoing edges at all;
  the `uses_hook` edge belongs to the page _component_, not to the element. Letting an element inherit
  its container's edges would fix this case and reintroduce the bug in the same commit, because the
  indexer also emits component-level `submits_to` — `SettingsPage --submits_to--> saveSettings` — which
  would hand `settings.new-key` the submit edge straight back. The fix for `clients.table` is a real
  element-level edge from the indexer, not a relaxation of scope.
- Recall drops wherever the graph's behaviour edges are thin. Every one of those losses is a missing
  relationship we can go and add, and it is visible as a refusal rather than absent as a silence.
- Scope computation is a second traversal per feature, with its own determinism requirements.

**We gain:**

- A claim that is true of the application but not of the feature is refused, which is the class of
  error a reader cannot detect on their own. Every fact in ADR 0007's structured fields is now
  attributed as well as verified.
- Ownership is retraceable. The path from a root to any owned node is recorded and checkable against
  the graph, so an ownership decision can be argued with rather than trusted.
- The positive control holds: tightening did not cost the claim it was meant to keep.

> Precision over recall. A missing relationship is acceptable. An incorrect one is not.

## Alternatives considered

**Depth- or distance-based ownership — "a node within N hops is owned".** Rejected. It is the same
mistake in a different unit. `element:settings.form` is two hops from `settings.new-key`, so any `N`
large enough to be useful admits the exact claim that started this, and any `N` small enough to
exclude it also excludes `clients.create`'s legitimate six-hop path to its endpoint. Distance measures
how far apart two nodes are; the question is whether one causes the other, and no radius answers that.
The rule is a path, not a distance, and the two are not approximations of each other.

**Broadly refusing evidence that looks like a sibling.** Rejected. A rule of the shape "do not cite a
node that shares a parent with your subject" would have caught the finding, and would also have
refused `settings.save`, `invoices.create-form.submit` and `clients.create-dialog.submit` — three
easy-band features whose submit controls are genuinely legitimate and whose only fault was that the
indexer had not yet given them their own edge. Refusing them would have been a heuristic hiding a
missing fact. The correct response was to emit the missing edge, which made those three provable in
their own right and left the finding refused. A gate that cannot tell a real relationship from a
borrowed one is not a gate; it is a quota.

**Reusing `UNKNOWN_SUBJECT` for the new refusal.** Rejected. It saves an enum member and lies about
the failure. The subject exists, is spelled correctly, and is a legitimate part of the application;
what is wrong is the attribution, not the identity. The rejection matrix in ADR 0007 is exhaustive by
design so that each refusal names the thing a maintainer must actually fix, and "unknown" would send
them to look for a typo that is not there.

## Relationship to the other ADRs

ADR 0007 decided that a claim must cite the graph. This one decides that citing the graph is not
sufficient, and that the missing half is attribution: _whose_ graph facts. [ADR 0009](0009-semantic-knowledge-is-claim-based.md)
is what makes the refusal cheap — the out-of-scope claim is rejected and persisted with its reason,
and the rest of the feature survives.
