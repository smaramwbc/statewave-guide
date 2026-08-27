# 14. A feature reference is not a control

- **Status:** Accepted
- **Date:** 2026-08-27
- **Extends:** [ADR 0010](0010-factual-truth-requires-feature-scope.md),
  [ADR 0012](0012-product-truth-and-user-guidance-are-different-projections.md),
  [ADR 0013](0013-internal-epistemic-state-is-not-user-copy.md)

## Context

Closed Loop #4 introduced `GuidanceIR` and solved the language problem completely. The same
independent non-human reviewer scored the recompiled output blind against the same frozen gate v2, so
the two rounds are comparable line for line.

| Measure            | Round 3 | Round 4 |
| ------------------ | ------- | ------- |
| `too_technical`    | 14      | 0       |
| Natural language   | 1.14    | 1.95    |
| Clarity            | 1.43    | 1.86    |
| `missing_workflow` | 5       | 16      |
| Actionability      | 1.24    | 1.14    |

The first two rows are the result ADR 0012 predicted, and the last two are the price nobody had
priced. Two scores of 3 appeared for the first time in the project. The median stayed at 1, 33%
reached 2 or better, and the gate failed two of its four thresholds.

The output had stopped being technical and started being incomplete. Those are different failures and
the second one was previously hidden underneath the first: a reader who cannot parse a sentence has no
occasion to notice that the sentence never told them what to press.

## The finding

Fourteen items scored 0 or 1. Ten of them were a single defect.

Twelve of the low scorers carried exactly one verified `workflow_step` claim, and every one of those
claims named its subject as `feature:<id>` rather than as a graph node. The verifier accepts both
forms, and a model describing a feature as a whole reaches for the feature. The compiler had no
mapping for that shape. `roleOf()` looked the identifier up in the graph, found no node, fell through
to the `result` role, and dropped the step. What survived was the synthesised entry step, so a reader
opened the page and was told "Open Settings." and nothing further.

The three features that scored 2 or 3 were precisely the three whose steps named an element.

The failure is not that a step was discarded. Some steps should be. The failure is that the discard
was silent, so from inside the pipeline a feature with guidance missing looked identical to a feature
with nothing to say. Every gate ADR 0007, ADR 0010 and ADR 0011 installed asked whether a claim was
true and none of them asked whether an accepted claim had reached the page.

### The second correlation

A separate number in the same review redirected the work. Features with a verified capability averaged
2.00 against 1.07 for features without, a gap of 0.93. Round 2 had measured the same comparison at
0.29 and ADR 0012 read that quarter-point as evidence that knowledge was not the bottleneck.

Both readings were right about their own data. Round 2's weak signal was a real signal drowned in
presentation noise: while two thirds of documents were flagged `too_technical`, the difference between
knowing what a feature does and not knowing it could not show through. Removing the noise did not
create the correlation. It uncovered one that had been there the whole time, which is an argument for
re-running old comparisons after a large presentation change rather than treating them as settled.

## Decision

> **A claim whose subject is `feature:<id>` names a feature, not a control. It is resolved to the
> control a user presses through recorded ownership, never through the spelling of an identifier, and
> where resolution is not unique nothing is emitted.**

`resolveActionTarget` in `packages/semantic/src/guidance/action-target.ts` produces a
`WorkflowActionTarget` — `{ featureId, nodeId, source: 'feature-root' | 'owned-action', label? }` —
or one of three refusals, carried by `ActionTargetOutcome` as `no-actionable-target`, `ambiguous` or
`passive-target`.

The rules:

- **A node subject resolves to itself when the node is actionable**, and is refused as
  `passive-target` when it is not. A claim about a read-only display is not a claim about something to
  do.
- **A `feature:` subject resolves only through the candidate's own `rootNodes`**, which is the mapping
  feature discovery already recorded, and only when the node exists, the scope classifies it `OWNED`,
  and the graph proves a user can act on it. Nothing in the resolver reads the text of an identifier.
- **More than one eligible control refuses** with `ambiguous` rather than choosing.

The second rule is the whole decision. `feature:clients.export` does not become
`element:clients.export` because the suffixes match. It becomes that node because discovery recorded
that this feature is rooted there, and the three further conditions hold. A shared suffix is a
coincidence in a namespace, not a fact about an application.

### Actionability is read off the graph

An element is actionable when it has an outgoing `invokes`, `submits_to`, `navigates_to` or `opens`
edge, or when it is an input kind: `input`, `textfield`, `select`, `textarea`, `combobox`. Inputs are
recognised by kind because typing in a box leaves no edge in the graph, and that list is the whole of
what counts, kept explicit so that widening it is a decision somebody has to make on purpose.

A tag name says what an element **is**; an edge says what it **does**. A `<button>` with no outgoing
behaviour is decoration and a `NavLink` with `navigates_to` is a control whatever it is called.

Containers are never actionable, even when they carry the behaviour edge. `form`, `section`, `div`,
`table`, `ul`, `ol`, `nav` and `aside` are excluded before the edge test runs. A `<form>` has
`submits_to` and nobody presses a form. They press the control inside it, which carries the same edge
and, unlike the form, has a name a reader can look for on screen.

### Ambiguity refuses

Choosing among several eligible controls by sort order is not a tie-break, it is the defect. Two
invoice features came to instruct users to open the client detail page by exactly that route.

The same shape appears in entry routes. `invoices.list.*` declares both `/invoices` and
`/clients/:clientId`, because the list component is rendered on both screens, and taking the first
told a user to open a client's detail page in order to clear an invoice selection. `ENTRY_ROUTE_AMBIGUOUS`
now refuses. Sorted-first is sorted-first wherever it is written, and a rule that is wrong in the
workflow resolver is not right in the entry step.

## The rest of the loop

Five further changes were forced by the same finding, and each is a different way for an accepted
claim to stop before it reaches a reader.

**Submit suppression was narrowed rather than kept.** Closed Loop #4 suppressed bare `submit` claims
outright, because they had produced "submit the invoices create form form". That was too broad. A
submit claim attached to a control a reader can see is sayable through the control, so suppression now
applies only where nothing on screen names the action. The internal verb never surfaces either: the
step reads `Choose "Save changes"`, not `Choose "Save changes" to submit a setting`.

**Deduplication is by target identity.** A capability claim, a workflow step and a submit claim
routinely name the same button, and emitting all three tells a user to press "Create client" three
times. Identity is the pair of control and role, never string similarity between two sentences. The
claim carrying an action wins, and the collapsed one is recorded as `DUPLICATE_ACTION` rather than
dropped.

**Field nouns are structural.** A lone unlabelled input is no longer named, because its identifier
segment says what the box is for rather than what to type in it, which is how `clients.search` produced
"Enter the client's search". Several unlabelled inputs in one form are still listed, because `name`,
`email` and `plan` genuinely are what goes in them. The distinction is between one and several rather
than a judgement about which words read well, and where it cannot be made the step is omitted.

**`StepOrigin` and `TaskCompletion` exist so that metrics do not read English.** Every step records
what produced it — `synthetic-entry`, `verified-workflow`, `verified-capability`, `verified-navigation`,
`verified-submit` — and `TaskCompletion` grades the feature `NO_TASK`, `ENTRY_ONLY`, `PARTIAL`,
`TERMINAL_ACTION_REACHED` or `COMPLETE_PATH`. Whether a user was given something to do is now a
property of the record rather than an inference from the prose.

**`GuidanceCompleteness` gained `ENTRY_ONLY`.** The old `ACTIONABLE` counted the synthesised "Open
Clients." as a user action, so eleven features were graded as offering something to do while a
reviewer scored those same features 1.18 on average. A metric that flatters the output is worse than
no metric, because the output is what you check against it.

### Action accounting

Every verified action claim now ends at a step or at a named reason. The reasons are
`NO_ACTIONABLE_TARGET`, `AMBIGUOUS_WORKFLOW_TARGET`, `PASSIVE_TARGET`, `DUPLICATE_ACTION`,
`UNSUPPORTED_PRESENTATION` and `ENTRY_ROUTE_AMBIGUOUS`. There is no third outcome and no default
branch.

This is ADR 0013's principle applied to a different subtraction. That ADR decided the developer keeps
what the user stops seeing, and named six diagnostics so every omission from the copy was recorded.
The Round 3 defect is the same omission one layer earlier: a claim that never became copy at all,
subtracted by a fall-through rather than by a decision. Recording the reason does not make the
guidance more complete. It makes incompleteness visible from the inside, which is where it gets fixed.

## Measured results

Compiled from the frozen Round 3 `ProductModel`, with no provider call, so resolution and presentation
are the only variables that moved.

Of 28 verified action claims, 18 resolved to a target and 13 were emitted. Fifteen were dropped:
`DUPLICATE_ACTION` 5, `NO_ACTIONABLE_TARGET` 6, `PASSIVE_TARGET` 3, `UNSUPPORTED_PRESENTATION` 1.
Excluding the de-duplicated claims, which are collapsed rather than lost, action retention is 13 of 13.

`TaskCompletion` across the 21 features: `NO_TASK` 1, `ENTRY_ONLY` 8, `PARTIAL` 9,
`TERMINAL_ACTION_REACHED` 2, `COMPLETE_PATH` 1. Twelve of twenty-one now carry at least one task
action.

`GuidanceCompleteness`: `DESCRIPTIVE` 1, `ENTRY_ONLY` 8, `ACTIONABLE` 6, `COMPLETE` 6.

Eleven of the twenty-one features changed between Round 3 and Round 4, and the no-expansion check
passes: every added action traces to an accepted claim and to a control the feature owns.

Recovered steps include `Choose "Export CSV"`, `Choose "Rotate API key"`, `Choose "Delete"`,
`Choose "Upgrade"` and `Choose "Save changes"`.

### What was correctly not recovered

This list matters as much as the one above, and a test suite that only checked the first would be
satisfied by a compiler that invented a step for everything.

- **`settings.new-key`** is a `<code>` element displaying a rotated key. It gained nothing. This is the
  same feature that produced the finding in ADR 0010, and it is still the right control case: it has
  no behaviour, so any rule that gives it a step is a rule that borrows one from a sibling.
- **`dashboard.new-client`** carries only a `requires_permission` edge. The graph proves who may see
  the control and nothing at all about what pressing it does, so it gained nothing.
- **`clients.error`** has no verified claim, and remains silent.

## Consequences

**We accept:**

- **A feature whose control the graph cannot prove now says less than a reader might want**, and
  `ENTRY_ONLY` at 8 of 21 is the honest size of that gap. Those eight documents tell a reader where to
  go and stop. This is not a threshold we are comfortable with; it is a number we can now see, which
  is the change from Round 3, where the same features were graded `ACTIONABLE`.
- **Ambiguity refuses, so a feature genuinely reachable from two screens names neither.** A user who
  could have been told either of two true things is told nothing. The alternative was measured and it
  sent people to the wrong page, but the cost is real and falls on exactly the features that are used
  from more than one place.
- **Usefulness is still unmeasured.** Round 4's output is prepared, blinded and unscored. What is
  established is that accepted claims now reach the page or name a reason for not reaching it. Whether
  the resulting guidance is useful is the next measurement, not a consequence of this one.
- **The actionability test is a fixed list.** Four edge types and five input kinds decide what a user
  can act on. An application built from controls this project has not seen will be under-served until
  the list is extended, and extending it is a change to what the pipeline is willing to assert.

**We gain:**

- **The largest single defect in the Round 3 review is closed at its cause.** Ten of fourteen low
  scorers shared one fall-through, and the fall-through no longer exists.
- **Resolution is evidential rather than lexical.** The mapping from a feature to its control is one
  discovery already made and recorded, so an ownership decision made in ADR 0010 is now also the
  decision that produces a step, and there is one fewer place where the two could disagree.
- **Silent loss is structurally unavailable.** Every accepted action claim reaches a step or a reason,
  so "this feature had nothing to say" and "we failed to say it" are now different records rather than
  the same empty page.
- **The metric no longer flatters.** `ENTRY_ONLY` splits the eleven features that were counted as
  actionable on the strength of a sentence the compiler wrote itself.
- **Round 2's capability correlation is corrected in the record.** The bottleneck hypothesis ADR 0012
  set aside on a 0.29 gap is live again at 0.93.

## Alternatives considered

**Rewriting `feature:<x>` to `element:<x>` by string convention.** The cheapest fix, and it would have
recovered most of the ten features in an afternoon. Rejected, because a matching suffix is a property
of a naming habit and not a fact about an application. Two identifiers can share a tail because a
developer named a feature after the button it starts at, or because two unrelated things are both
called `export`, and nothing in the string distinguishes those cases. This project has already been
bitten once by treating adjacency as ownership ([ADR 0010](0010-factual-truth-requires-feature-scope.md)),
where a claim about the settings form was accepted for a sibling that merely sat beside it. There is
now a permanent trap test in which `feature:x` and `element:x` both exist and are unrelated, so a
future convenience of this shape fails a test rather than a review.

**Choosing among ambiguous targets by sort order or namespace similarity.** Rejected, because it is the
defect rather than a fix for it. Sorted-first is what sent `invoices.list.*` readers to the client
detail page, and namespace similarity is the string-convention alternative above with an extra step.
Both answer "which control did the claim mean?" with a fact about identifiers, and the claim's meaning
is not recorded in an identifier. Refusing produces a document that says less. Guessing produces a
document that says something wrong with the same confidence it says everything else, and a reader has
no way to tell the two apart.

**Relaxing the actionability test to admit containers, so that more features gain a step.** Rejected.
It would work, in the sense that the `ENTRY_ONLY` count would fall, and it would produce "press the
form". A `<form>` carries `submits_to` because the indexer records where a submission goes, not
because a form is a thing a person interacts with, and the same edge is available on the button
inside — which is the node a reader can actually find on screen. The container's edge is not extra
knowledge, it is the same knowledge attached to the wrong node for this purpose.

**Inventing a step for passive displays, to improve the score.** Rejected, and it is worth stating
plainly because it is the reading of the Round 3 result that the numbers most invite. Sixteen features
were flagged `missing_workflow`, and a rule that emitted "View the API key." for `settings.new-key`
would clear most of that flag. It would also assert that a user does something where the graph proves
only that something is shown. ADR 0007's line holds here unchanged: the pipeline may say less than is
true, and may not say more than is established. A metric that a compiler can satisfy by inventing
content is measuring the compiler's willingness to invent.

## Relationship to the other ADRs

[ADR 0010](0010-factual-truth-requires-feature-scope.md) decided what a feature owns, and this ADR
spends that answer: the ownership closure computed for verification is the same closure that resolves
a feature reference to a control, so the two cannot drift apart.
[ADR 0012](0012-product-truth-and-user-guidance-are-different-projections.md) put a compiler between
the model and the prose and accepted that a compiler which selects can select wrongly. This is the
first measured instance of that cost, and the shape it took was not a wrong selection but a silent
one. [ADR 0013](0013-internal-epistemic-state-is-not-user-copy.md) established that every subtraction
from user copy is recorded for the developer; action accounting extends the same requirement upstream,
to claims that never became copy at all.
