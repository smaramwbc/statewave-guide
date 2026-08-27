# 12. Product truth and user guidance are different projections

- **Status:** Accepted
- **Date:** 2026-08-26
- **Extends:** [ADR 0008](0008-documentation-is-output-not-source-of-truth.md),
  [ADR 0011](0011-deterministic-claim-opportunities-before-model-selection.md)

## Context

Day 2 ended with a pipeline that was safe and a set of documents nobody would want to read.

Against a frozen 21-feature benchmark and a real model, the semantic pipeline proposed 120 factual
claims and verified 114 of them, held restraint at 30 of 30 on the refusal band, accepted zero
wrong-feature claims and zero unsupported actions, recovered 27 of 39 workflow targets, and scored
0.859 on stability between runs. Every gate ADR 0007, ADR 0010 and ADR 0011 installed did the job it
was installed to do.

Then an independent reviewer — not a human, blinded to the pipeline and scoring against a frozen gate
— read the rendered guidance for the same 21 features and rated its usefulness. The median score was

1. Only 24% reached 2 or better. Nothing scored 3, and nothing scored 0. Zero features were flagged
   `incorrect_fact`. The dimension means were correctness 0.86, clarity 1.43, actionability 1.24,
   natural language 1.14.

That distribution is the finding. Nothing was harmful, nothing was misleading, nothing was worthless.
Everything was uniformly mediocre, which is a different failure from the ones the pipeline was built
to prevent and is invisible to every gate that prevents them. A verifier can refuse a false sentence.
It has nothing to say about a true one that no reader can use.

The flags name the reason: `too_technical` on 14 of 21, `missing_capability` on 13, `too_vague` on 5,
`missing_workflow` on 5, `irrelevant_information` on 3, `repetitive` on 1.

### The correlation that redirected the work

The standing hypothesis for the bottleneck was capability recovery. Two thirds of features had no
verified capability; the obvious reading is that guidance is thin because the pipeline does not yet
know enough, and the fix is to prove more.

The measurement does not support it. Features **with** a verified capability scored 1.43. Features
**without** scored 1.14. A quarter of a point, across 7 items against 14 — the difference between
knowing what a feature does and not knowing is smaller than the difference between the best and worst
sentence describing the same fact.

Whatever separates useful guidance from useless guidance here, it is not how much the pipeline knows.
`too_technical` on two thirds of everything is a presentation defect, and presentation was the one
layer nobody had designed.

### The specific defects

They are worth stating exactly, because each one names a structural cause rather than a wording slip.

1. **The internal fallback reached users.** Ten of twenty-one features carried "No capability, route
   or permission has been verified for this feature." All ten were flagged `too_technical` — a perfect
   correlation and the strongest single predictor in the set. On two of them the sentence sat directly
   above a confident description of what the control does, so the page contradicted itself in
   consecutive lines. The reviewer on R10: "The internal verification fallback should not be exposed
   to the end user."
2. **Template joining produced ungrammatical prose.** "You can create a new invoices create form and
   submit the invoices create form form from the Invoices screen." Its facts scored correctness 2, the
   best in the set, while clarity and natural language both scored 0. The knowledge was right and the
   sentence was broken.
3. **Identifiers were rendered as phrases.** "You can open nav clients from the Clients screen." "You
   can update a client detail rename." "You can view client detail audit." All three are semantic
   identifiers with their punctuation replaced by spaces.
4. **A workflow ran backwards.** `clients.create` rendered the form's fields, then the dialog holding
   the form, then the button that opens the dialog. Steps were sorted by ownership-path depth, and
   containment nests the opposite way from use: the form is inside the dialog that is opened by the
   button, so the deepest node is the last thing a user reaches and the first thing the sort emitted.
5. **A constraint that is true of everything was reported as news.** "Input is validated before it is
   accepted", flagged irrelevant three times, and true of nearly every form ever written.
6. **Permission identifiers appeared in user copy.** "It requires the `clients:create` permission" —
   a string the reader has no way to look up.

None of these is a knowledge problem. Every one of them is the ProductModel being read aloud.

## Decision

> **The ProductModel is not rendered directly into end-user prose. It is compiled into a
> deterministic `GuidanceIR`, and the renderer phrases that.**

A third representation goes between what we know and what we say:

```
ApplicationGraph   ->   ProductModel   ->   GuidanceIR   ->   renderer
technical truth         verified meaning    communicative      phrasing
                                            intent
```

Each layer answers exactly one question, and the reason for the split is that the previous
architecture asked one layer two of them.

| Layer              | Question it answers           |
| ------------------ | ----------------------------- |
| `ApplicationGraph` | What does the code do?        |
| `ProductModel`     | What do we know?              |
| `GuidanceIR`       | What should we tell the user? |
| Renderer           | How should we phrase it?      |

The ProductModel is an evidentiary record. It holds claims, their citations, their ownership paths,
their verification verdicts and their rejections, because that is what ADR 0009 needs it to hold.
Selecting what a reader is served, in what order, in whose vocabulary, is a different decision made on
different grounds, and a renderer that reads the model directly has to make it implicitly, one
template at a time. The fallback sentence, the depth sort, the joined identifiers and the raw
permission string are all the same defect wearing four faces: a data structure built for verification
being asked to be a script.

`compileGuidance` in `packages/semantic/src/guidance/compile.ts` makes those choices explicitly and
deterministically, and produces a `GuidanceDocument` the renderer turns into words.

## The proposition taxonomy

Guidance is assembled by **choosing propositions and realising them**, never by joining fragments of
claim text. `GuidanceProposition` is a closed union of typed communicative acts:

| Kind                  | What it says                                 |
| --------------------- | -------------------------------------------- |
| `perform_action`      | The user can do something. The central kind. |
| `navigate`            | The user can get somewhere.                  |
| `requires_permission` | Doing this needs permission.                 |
| `enter_fields`        | There are fields to fill in.                 |
| `open_container`      | Something opens: a dialog, a panel.          |
| `confirm_action`      | The user commits: Save, Create, Delete.      |
| `observe`             | Something is shown to the user.              |
| `constraint`          | A rule about what is allowed.                |

"You can create a new invoices create form and submit the invoices create form form" is not
reachable from this union. There is no template with a slot for claim text, so there is no way to put
the same identifier in two slots and produce it twice. The union being closed is what makes that a
structural guarantee rather than a fixed bug.

`requires_permission` carries the raw permission string and never renders it. The identifier stays in
the IR for the inspector; the reader is told what it gates, in words.

### Labels are found, not derived

`HumanLabel` records a `LabelOrigin` in descending trustworthiness: `ui-label`, `accessible-name`,
`route-title`, `component-name`, `normalised-identifier`. The origin is kept rather than discarded
because it decides how the label may be used.

**Only `ui-label` and `accessible-name` may be quoted.** Quotation marks are an instruction: they tell
a reader to look for that exact text on screen. A noun we derived from an identifier is our guess, and
quoting it sends the reader hunting for words nobody wrote.

The module never manufactures a **verb** from an identifier. `nav.clients` becomes "Clients", never
"Open nav clients" — the first is a thing that exists and the second is a sentence we invented.
`clients.create` yields "Create", never "Create a client", because the object is not in the identifier
and guessing it is precisely how "create a new invoices create form" happened. An identifier is an
address. It was never grammar, and the application already knows what to call the control, because a
user is looking at the word right now.

## Workflow roles, and why depth sorting was wrong

`WorkflowRole` replaces the depth sort: `entry`, `trigger`, `container`, `input`, `confirmation`,
`result`, in that order.

Depth sorting was not a bug in the comparator. It was a category error. Ownership-path depth measures
how deeply a node is nested in the interface, and nesting runs the opposite way from use — the form is
_inside_ the dialog that is _opened by_ the button, so the deepest node is the last thing the user
reaches. Sorting by depth is guaranteed to produce a procedure in reverse whenever the interface has
any structure at all, and `clients.create` is the case where it did.

A role names what a step **is to the user**, which is independent of how the interface nests. Order
comes from the role, so it comes from the procedure rather than from the DOM.

Steps also carry `kind: 'action' | 'informational'`. "The dialog holds the form" is true and nobody
performs it; informational steps exist so that context has somewhere to live that is not the numbered
list.

## Mood: imperative in steps, indicative in summaries

The same fact is realised differently depending on where it sits. A step says `Choose "New client".`
A summary says `You can create a new client using "New client".` One is an instruction, the other is a
description of a capability, and a reader needs both — but a numbered list of "you can" sentences is
not a procedure and a summary written as commands is not a summary.

Mood is therefore a property of position, decided by the compiler and executed by `realiseInstruction`
and `realiseSummary`. It is not something the phrasing layer is left to infer.

## Provenance is non-optional

Every proposition, sentence and step carries `GuidanceProvenance`: the `ProductClaim` ids and the
graph fact ids behind it. The field has no optional marker anywhere in the IR.

This is what makes the invariant checkable. ADR 0008 promised a generated sentence could be traced
back to a verified claim, to a graph relationship, to a line of source. Inserting a compiler between
the model and the prose is exactly where that chain would break if provenance were optional, because
a compiler that selects is also a compiler that could add.

## Completeness and diagnostics: the developer keeps what the user stops seeing

`GuidanceCompleteness` — `EMPTY`, `IDENTIFICATION_ONLY`, `DESCRIPTIVE`, `ACTIONABLE`, `COMPLETE` —
records how much a feature was able to say. It is diagnostic only and never shown to a user. It exists
because if capability presence is not what separates useful guidance from useless guidance, something
else is, and this is the candidate worth measuring next.

`GuidanceDiagnostic` carries `NO_VERIFIED_CAPABILITY`, `NO_USER_VISIBLE_LABEL`, `NO_WORKFLOW_ORDER`,
`CONSTRAINT_WITHHELD_AS_IRRELEVANT`, `LANGUAGE_CLAIM_UNSUPPORTED` and `QUESTION_DISCARDED_AS_TECHNICAL`.

This is why the fallback sentence could be **deleted** rather than reworded. The information did not
stop existing; it moved to where it belongs. A feature with nothing provable now emits
`NO_VERIFIED_CAPABILITY` to the developer and says nothing to the user. Suppressing the sentence
without recording the condition would have been hiding a gap. Recording it and not printing it is
addressing the right audience.

## The no-expansion invariant, extended from the renderer to the compiler

The renderer has always been forbidden to introduce a fact. That check now runs against the compiler
too: every proposition must trace to an accepted claim or a graph fact.

**It caught a real defect on its first run**, and this is the argument for having written it. A
trigger step defaulted its capability `action` to `navigate` when the claim behind it carried none.
The reasoning was benign — a control the user presses to begin usually takes them somewhere — and the
consequence was that three features asserted a navigation no claim established. A workflow-step claim
asserts that a control _is a step_, not what pressing it accomplishes.

`action` was made optional, and the optionality is load-bearing rather than defensive. An absent
action now yields "Choose X." and says no more than is known.

### And a latent bug the removal exposed

Removing the fallback broke replay. A feature-acceptance gate read `description !== ''` as "the
redaction pass ate the model's prose" and rejected the feature. That test was correct while every
feature always produced a description; once the renderer deliberately said nothing about a feature
with no verified capability, an empty description became a legitimate outcome and replay silently
dropped the feature.

Acceptance now turns on the title and the claims. The model's own description never reaches a reader
in any case, because the pipeline replaces it with prose composed from accepted claims — so it was
never a sound thing to gate on.

## Measured results

Compiled from the **frozen Round 2 ProductModel**. No provider call, no re-enrichment: the only
variable that moved is presentation.

All ten hard targets are at zero:

| Target                                    | Count |
| ----------------------------------------- | ----- |
| Internal vocabulary in user copy          | 0     |
| Semantic identifiers in prose             | 0     |
| Permission identifiers in user copy       | 0     |
| Malformed repeated phrases                | 0     |
| Propositions without provenance           | 0     |
| Steps without provenance                  | 0     |
| Passive containers rendered as actions    | 0     |
| Workflows in invalid action order         | 0     |
| Documents that both disclaim and describe | 0     |
| Empty filler sections                     | 0     |

Completeness across the 21 features: `COMPLETE` 7, `ACTIONABLE` 11, `DESCRIPTIVE` 2,
`IDENTIFICATION_ONLY` 1, `EMPTY` 0.

No factual expansion: every proposition traces to an accepted claim or a graph fact.

`clients.create`, before and after, from the same model:

```
BEFORE  You can create a new client and submit the client form.
        1. The client form asks for a name, billing email and plan, and offers
           Cancel or Create client.
        2. The new client dialog holds the form used to enter the client's details.
        3. Selecting "New client" opens the create client dialog.

AFTER   You can create a new client using "New client".
        1. Open Clients.
        2. Choose "New client".
        3. Enter the client's email, name and plan.
        4. Choose "Create client".
        - You need permission to create a client.
```

Nothing was learned between those two renderings. The same claims, verified at the same time by the
same run, are in both.

## Consequences

**We accept:**

- **A compiler that selects can select wrongly.** The old renderer emitted what the model held, so its
  errors were the model's errors. `compileGuidance` decides what a reader is served, and a bad
  selection rule is now a defect of ours that no verifier will catch, because every proposition it
  emits is individually true. This ADR trades one class of error for another; the reason it is a good
  trade is that the new class is deterministic, and a deterministic mistake can be found, fixed and
  regression-tested.
- **Silence is now a possible output.** A feature with nothing provable says nothing, and a reader who
  arrives expecting an explanation will experience that as a gap. It is an honest gap, and
  `NO_VERIFIED_CAPABILITY` names it for the developer, but the reader is not told why the page is
  short. Whether silence reads better than a disclaimer is not yet measured — only that ten
  disclaimers were flagged `too_technical` ten times out of ten.
- **The usefulness of the result is not measured.** Ten hard targets at zero says the specific defects
  the Day 2 review named are gone. It does not say the guidance is now useful, and those are different
  claims. An independent review of the compiled output is prepared and unscored. Until it is scored,
  the honest statement is that the known defects are absent, not that the problem is solved.
- **A third representation is more code and one more place to be wrong.** The IR has to be kept in step
  with the claim taxonomy underneath it, and a claim type with no proposition to carry it is silently
  unspeakable.
- **The proposition union bounds what can ever be said.** Anything outside the eight kinds is not
  expressible, however obviously a reader would want it. That is the same trade ADR 0007 made about
  verification rules, now made again about communicative acts.

**We gain:**

- The Day 2 defects are structurally unreachable rather than fixed. There is no template with a slot
  for claim text, so joined identifiers cannot recur; there is no depth sort, so a procedure cannot
  render in containment order; there is no user-facing fallback string, so it cannot be printed.
- Presentation is a separately testable stage. The frozen-model recompilation is the experiment the
  old architecture could not run: holding knowledge constant and varying only how it is expressed.
- Provenance survives the new layer, so ADR 0008's traceability chain holds through the compiler.
- What the user stops seeing, the developer keeps. Suppression and loss are now different things, and
  the diagnostics say which one happened.
- The no-expansion check earned its keep on its first run.

## Alternatives considered

**String-level repair of the rendered output.** The cheapest available fix, and it was available
immediately: `replace("form form", "form")` removes the doubled noun, a match on the fallback's text
suppresses the disclaimer, a regex for `[a-z]+:[a-z]+` catches the permission identifiers. Rejected.
Every one of those repairs works on exactly the example that motivated it and leaves the mechanism
that produced it running. "form form" is a symptom of joining claim text into a template; delete the
duplicate and the next identifier with a structural suffix produces a new malformation nobody has
written a rule for. Suppressing the fallback by matching its text leaves the pipeline computing a
user-facing sentence for a condition that is not the user's business, so the next person to add a
fallback adds it to user copy again. The benchmark would have gone green and the architecture would
have been exactly as wrong as before, with the evidence of its wrongness removed. A fix that improves
the measurement more than the artefact is worse than no fix, because it also costs the measurement.

**An LLM prose renderer at this stage.** A language model would write better sentences than
`realiseProposition` does, and this is not in dispute. It was rejected because of what the open
question was. Day 2 left one thing genuinely unknown: whether the architecture already held enough
product knowledge and was presenting it badly, or whether it did not know enough. The capability
correlation — 1.43 against 1.14 — pointed at presentation, and the way to test that is to hold the
knowledge frozen and change only the presentation, deterministically, so that any improvement is
attributable. A model at the phrasing layer would have improved the output and made the improvement
unattributable, because a model both rephrases and quietly supplies what is missing. The question
would have been answered by having been made unanswerable. There is a case for a model here later,
once a deterministic floor exists to measure it against; there was no case for it while the floor was
the thing under test.

**Giving the model more authority over factual content.** The reading that `missing_capability` on 13
of 21 means the model should be trusted to fill the gaps. Rejected, and ADR 0011 already contains the
measurement that settles it: a model asked to compose its own factual assertions produced 382
proposals of which 77 verified, and held restraint 0 of 30. Widening its authority now would trade the
one property Day 2 established — zero features flagged `incorrect_fact` — for prose that reads better
while being unfalsifiable. The Day 2 result is that the pipeline is trustworthy and dull. Restoring
model authority makes it interesting and untrustworthy, which is the state it started in.

## Relationship to the other ADRs

ADR 0007 governs what may enter the ProductModel. ADR 0008 governs that documentation leaves it as a
projection and is never a source. This one governs the shape of that projection: not one step from the
model to Markdown, but two, with an explicit and inspectable decision about _what to say_ standing
between the record of what we know and the words a person reads.
