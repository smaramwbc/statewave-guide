# Provider Reality Check — Round 2

> **Status: run.** `anthropic-opus-5` (`claude-opus-5`), 21 candidates × 3 runs, 2026-08-26.
> Same dataset, same gold set, same model, same settings as Round 1. What changed is the
> architecture and the prompt, which is the point: this is a measurement of a design change, not of
> a vendor. Round 1's artefacts are preserved unchanged under
> `benchmarks/provider-reality-check/results/round-1/`.

## The question

Round 1 answered half of the milestone's question and left the other half open.

The verifier failed closed: across 382 factual claims from a real model under deliberate pressure,
nothing reached the Product Model citing an invented route, an invented permission or an unknown
subject. What Round 1 could not show was useful product understanding. Evidence recovery was 89% and
verified claim yield was 20%; 71% of features ended with no verified capability at all; workflow
recovery was 18%; and on all thirty refusal-band candidates the model proposed a factual claim rather
than declining, so restraint scored zero.

And one claim passed verification while describing a different feature. It was true, its evidence was
real, and the verification rule was correctly satisfied — the evidence simply belonged to a sibling
sitting in the same evidence pack. That is the defect Round 2 was built to close.

## What changed

Three things, in the order they matter.

**Feature scope.** A feature now owns what it reaches by walking forward out of its own roots along
behaviour edges, and never what it reaches by walking an edge backwards and descending somewhere
else. Ownership is a path, not a distance. Two boundaries stop it swallowing the application, and
neither is a hop count: an API endpoint's identity is owned while the controller, repository and
`db.query` behind it are only reachable, and a node many others reach along the same structural edge
is shared infrastructure rather than any one feature's. See
[ADR 0010](adr/0010-factual-truth-requires-feature-scope.md).

**Claim opportunities.** Deterministic code now enumerates which factual claims are provable, from
the same verification matrix the verifier uses, and proves each one through the same verifier code
path before offering it. The model's factual task became selection: accept an opportunity and supply
the wording, or decline it. It cannot choose the subject, the rule, the action or the evidence. See
[ADR 0011](adr/0011-deterministic-claim-opportunities-before-model-selection.md).

**One indexer change.** A `type="submit"` control inside a form now carries the form's `submits_to`
edge. Without it the submit button a user actually presses had no outgoing behaviour, so a claim that
pressing Save submits the form could only be supported by citing the _form's_ edge — structurally the
same borrowing as the bug. Three easy-band features were affected. A control that merely names a form
by id from outside it still gets no edge, because nothing proves which form it means.

<!-- BEGIN:RESULTS -->

## Results

### The defect is closed, in both directions

|                                   | Round 1        | Round 2 |
| --------------------------------- | -------------- | ------- |
| Wrong-feature claims **accepted** | 2              | **0**   |
| Wrong-feature claims proposed     | not measurable | 0       |

The regression is pinned by tests that assert both halves in one file: the exact claim from the Round
1 run is refused under `settings.new-key` with `SUBJECT_OUT_OF_SCOPE`, and the _identical_ claim is
still `structurally_verified` under `settings.form`, which genuinely owns the form. A scope narrow
enough to refuse the sibling would be worthless if it also refused the feature that owns the same
path, and the two are one edge apart.

### Yield

|                             | Round 1      | Round 2           |
| --------------------------- | ------------ | ----------------- |
| Factual claims proposed     | 382          | 120               |
| Factual claims verified     | 77           | **114**           |
| Verified share of proposals | 20%          | **95%**           |
| Required concepts recovered | 44 / 63      | 50 / 63           |
| Required evidence recovered | 75 / 84      | 72 / 84           |
| Workflow targets recovered  | 7 / 39 (18%) | **27 / 39 (69%)** |
| Stability across runs       | 0.68         | **0.86**          |
| Output tokens               | 72,226       | 36,185            |

Proposals fell by two thirds while verified claims rose. That is the shape the design predicted: the
model stopped inventing assertions and started choosing among proved ones. The 94 Round 1 rejections
of the form _"the route is real; nothing the claim points at proves this is the one"_ are gone,
because the pipeline no longer asks a model to reconstruct a proof it already has.

Required evidence recovery fell slightly, from 75 to 72 of 84. Worth being plain about: the planner
offers what it can prove, and where the graph cannot prove a path the model is no longer free to cite
the fact anyway. Three recovered facts in Round 1 were recovered by claims that did not survive
verification.

### Restraint

|                                      | Round 1    | Round 2     |
| ------------------------------------ | ---------- | ----------- |
| Restraint held on refusal candidates | **0 / 30** | **30 / 30** |
| Forbidden capabilities proposed      | 27         | **0**       |
| Unsupported actions proposed         | 23         | **0**       |

This is the result worth dwelling on, and it did not come from persuasion. Nothing was added to the
prompt about being careful. The refusal-band features have no provable capability to offer, so there
was nothing there to accept — restraint became a property of the graph rather than a request to the
model. `clients.export`, `clients.search`, `settings.new-key` and `invoices.list.clear` are offered
zero capability opportunities, and across all 69 candidates in the fixture the only actions ever
offered are `create`, `navigate`, `submit`, `update` and `view`.

### Selection

The measurement the Round 1 design could not make at all.

|                       | Round 2      |
| --------------------- | ------------ |
| Opportunities offered | 165          |
| Accepted              | 120          |
| Declined              | **45 (27%)** |

A model handed a list of already-proved claims could simply accept all of them, and that would look
like a triumph in every other row of this report while meaning nothing: high yield, no judgement. It
declined 27% of what it was offered. Selection is doing work.

The two failure modes this design feared are therefore both absent — it neither invented claims nor
rubber-stamped them — but "declined 27%" says only that a choice was made, not that it was the right
choice. Which 45 should have been declined is a human question, and it is the open one.

### Hard safety invariants

Every one held.

|                                          | Round 2 |
| ---------------------------------------- | ------- |
| Unknown subjects accepted                | 0       |
| Unknown routes accepted                  | 0       |
| Unknown permissions accepted             | 0       |
| Unsupported generic actions accepted     | 0       |
| Evidence-less factual claims accepted    | 0       |
| Out-of-scope factual claims accepted     | 0       |
| Wrong-feature factual claims accepted    | 0       |
| Renderer-introduced factual propositions | 0       |
| Schema failures                          | 0       |
| Provider errors                          | 0       |

### What did not improve

**Features with no verified capability: 45 → 45 of 63.** Unchanged, and the honest
headline alongside the yield figure. **Features carrying only workflow steps rose from 13 to 27.**
More features now produce something accurate and thin.

Two causes, both real and both documented rather than worked around:

- `client-detail.delete` cannot offer a delete capability. Its chain is
  `element:client-detail.delete --invokes--> askToDelete`, and `askToDelete` goes nowhere: the
  confirm-dialog indirection breaks the path before the DELETE endpoint. The graph cannot prove this
  feature deletes anything.
- `clients.table` cannot reach `api:GET:/api/clients`. The element has no outgoing edges at all; the
  `uses_hook` edge belongs to the page component. Inheriting a container's edges would reintroduce
  the original bug, because the indexer also emits component-level `submits_to`, which would hand
  `settings.new-key` the submit edge straight back.

Both are missing relationships rather than incorrect ones, which is the trade this project has said
it prefers. Neither is a reason to loosen a rule; both are reasons to teach the indexer another
provable edge, the way the submit-control inference was added here.

<!-- END:RESULTS -->

## Decision gate

> Has Statewave Guide now demonstrated useful human product understanding from a real model while
> preserving evidence and feature-scope safety?

**PARTIALLY — and the safety half is now settled.**

_Feature-scope safety:_ demonstrated. Zero wrong-feature claims accepted, with a regression fixture
that fails if either direction breaks. Every other hard invariant held at zero.

_Restraint and discipline:_ demonstrated, and by construction rather than by instruction. 0/30 to
30/30, with unsupported actions unproposable rather than merely refused.

_Claim yield:_ substantially improved. 20% to 96% of proposals verified, workflow recovery 18% to
67%, stability 0.68 to 0.86.

_Useful human product understanding:_ **not yet demonstrated.** 44 of 63 features still end with no
verified capability, and 27 carry only workflow steps. A guidance product built on this today would
be accurate, safe, well-scoped, and for most features still close to empty. Whether what does survive
is worth reading is a human judgement, and it has not been made — see below.

## Usefulness review

**Gate v1: FAIL.** Scored 2026-08-26 by _OpenAI GPT-5.6 Sol_, which identified itself as an
independent non-human reviewer. It is not the model under test, so this is not self-scoring — but it
is not a human either, and the milestone asked for one. Treat what follows as strong independent
evidence and an open human gate, not as the human gate closed.

| Criterion                                | Required | Measured |     |
| ---------------------------------------- | -------- | -------- | --- |
| Median usefulness                        | ≥ 2      | 1.0      | ✗   |
| Share scoring ≥ 2                        | ≥ 70%    | 24%      | ✗   |
| Features with an incorrect factual claim | 0        | 0        | ✓   |
| Share scoring 0                          | ≤ 15%    | 0%       | ✓   |

The shape of that result is the useful part. **Nothing scored 0 and nothing scored 3.** Sixteen
items landed on 1 and five on 2. The pipeline is not producing anything harmful, misleading or
worthless; it is producing something uniformly mediocre. Safety passed, usefulness did not, and the
two halves separated exactly along the line the design predicted they would.

### The flags say where the problem is

| Flag                     | Count   |
| ------------------------ | ------- |
| `too_technical`          | 14 / 21 |
| `missing_capability`     | 13 / 21 |
| `too_vague`              | 5       |
| `missing_workflow`       | 5       |
| `irrelevant_information` | 3       |
| `repetitive`             | 1       |
| `incorrect_fact`         | **0**   |

Dimension means: correctness 0.86, clarity 1.43, actionability 1.24, natural language 1.14.

### Two findings that change what to do next

**Capability recovery is not the dominant bottleneck.** This was the standing hypothesis and the
correlation does not support it. Features with a verified capability scored 1.43; features without
scored 1.14. A quarter of a point, on seven items against fourteen. Meanwhile `too_technical` was
flagged on two thirds of everything. The language is the bottleneck, not the coverage — and the
renderer that produces that language is deterministic, so this is our defect and not the model's.

**The renderer leaks its own vocabulary into user-facing copy.** Ten features show the fallback
sentence _"No capability, route or permission has been verified for this feature."_ All ten were
flagged `too_technical` — a perfect correlation, and the single most reliable predictor in the set.
The reviewer put it plainly on R10: _"The internal verification fallback should not be exposed to the
end user."_ On R04 and R06 it does worse than read badly, it contradicts the copy beside it: the page
says nothing was verified and then confidently describes what the control does.

One item shows the same defect in a sharper form. R15 renders _"You can create a new invoices create
form and submit the invoices create form form from the Invoices screen."_ Its underlying facts scored
correctness 2 — the strongest in the set — while its clarity and natural language both scored 0. The
facts were right and the sentence was unusable.

### A flaw in the review instrument, disclosed

The correctness mean of 0.86 understates the pipeline, and the cause is ours. Six features produced
no `knownSupportedFacts` at all, because their only owned node is an unlabelled display element and
the fact renderer had nothing to say about it. All six were scored correctness **0**, unanimously.
Items that did carry facts averaged 1.20.

The reviewer was scoring _"I cannot check this"_ as zero, which is not _"this is wrong"_ — and
nothing was flagged `incorrect_fact` anywhere. A future package must either describe unlabelled
elements or state that a feature has nothing checkable, rather than presenting an empty list that
reads as a failed check.

### Not acted on

No prompt was tuned, no rule loosened and no renderer changed in response to these scores. The
milestone's instruction was to return the results and let the next experiment be chosen from them.

## Private repository sample

**SKIPPED — authorisation required.** Sending a production codebase's structure to a third-party API
is the user's decision to authorise, not the pipeline's. Candidate discovery against a private
repository remains available locally and read-only; no external enrichment has been run against one.

## Second provider

**SKIPPED — credentials unavailable.** Only `anthropic-opus-5` was configured. Everything here rests
on one vendor, and "a model can do this" should not. The OpenAI, OpenRouter and LiteLLM adapters are
implemented and unit-tested but have never been exercised against a live endpoint.

## Caveats that still apply

- Structured claim verification narrows the hallucination space; it is not a proof of arbitrary
  natural-language meaning. A sentence can be well-formed, cite the right facts, and still mislead.
- The renderer is deterministic. No model wrote user-facing prose in this benchmark, so nothing here
  measures writing quality.
- The fixture is one application, chosen by us, with patterns we knew to look for. Recovery figures
  on unfamiliar code will differ.
- Cost is not computed. No adapter receives a price from its provider, and inventing one would be
  worse than omitting it.
