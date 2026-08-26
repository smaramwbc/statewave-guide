# 11. Deterministic analysis identifies claim opportunities before the model is asked

- **Status:** Accepted
- **Date:** 2026-08-26
- **Extends:** [ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md),
  [ADR 0009](0009-semantic-knowledge-is-claim-based.md)

## Context

Round 1 asked a real model to read a feature's evidence pack and invent factual claims about it. The
prompt described the graph, the claim types and the rules, and the deterministic verifier judged
whatever came back. The results say something quite specific about where the difficulty lies.

**Evidence recovery was 89%.** Of the graph facts the gold set expected a feature's claims to rest
on, the model found nearly all of them. It was reading the application correctly.

**Verified factual claim yield was 20% — 77 claims of 382.** Having found the right facts, it could
not reliably turn them into something the verifier would uphold.

**The dominant failure was not fabrication.** Ninety-four rejections are the same shape: the route is
real, the endpoint is real, the subject is real, and nothing the claim points at proves that _this_
is the claim being made. A `create` capability cited the POST endpoint but not the `submits_to` edge
that reaches it. The model named a fact instead of naming the relationship that carried it.

**Restraint was 0 of 30.** On every candidate in the refusal band — features deliberately built so
that no capability is provable — the model proposed a factual claim rather than declining. It never
said "there is nothing here I can prove".

**71% of features ended with no verified capability at all.** Not because the application does
nothing, but because the claims that would have described it were rejected on their citations.

Read together, these are not a prompt-quality problem. Choosing which relationships satisfy a
verification rule is a decision procedure, and we already have it: the verifier is that procedure,
written down. Asking a model to re-derive it from prose and then grading it on the parts it got
wrong is a strange way to spend a model's attention, and an unfair way to report on it.

There is also a subtler failure recorded in the ownership decision (ADR 0010). A model that must
choose its own subject will sometimes choose a real, verifiable, _neighbouring_ one — the settings
form standing in for the newly rotated API key beside it. Ownership scoping refuses that claim, but
refusing it is a rejection, and a rejection is a claim the pipeline paid for and threw away.

## Decision

> **Deterministic analysis identifies which factual claims are possible before the model is asked to
> supply semantic meaning.**

Before any provider call, `planClaimOpportunities` enumerates the factual claims a feature could
truthfully make and hands the model that list. Each entry is a `ClaimOpportunity`:

```ts
interface ClaimOpportunity {
  id: string; // content-derived, stable across runs
  featureId: string;
  type: ProductClaimType;
  action?: CapabilityAction;
  subjectRef: string; // the identity this claim is about
  targets: readonly string[]; // the facts that actually proved it
  route?: string;
  permission?: string;
  ownershipPath: readonly OwnershipStep[];
  ownershipSummary: string;
}
```

The model's factual task becomes **select or decline**, over opportunities that already carry their
evidence, plus the semantic fields it is genuinely better at: the wording, and the label a reader
would recognise the subject by.

It may not choose the subject's identity, the verification rule, the capability action, or targets
outside the opportunity. Declining every opportunity is a valid answer, and declines are recorded
rather than discarded, so restraint is a number rather than an impression.

## One matrix, read in both directions

The planner enumerates from `BUILT_IN_VERIFICATION_RULES` and proves each candidate opportunity
through `createAssertionProbe` — the same verifier code path that will later judge the model's
answer. Only assertions that come back `SUPPORTED_VERIFICATION_RULE` are offered.

There is no second rule engine, and that is the load-bearing part of this decision. A planner with
its own copy of the matrix would drift from it, quietly, at the first rule anyone edited. The drift
would surface as opportunities the verifier refuses: the pipeline offering a model a claim and then
rejecting it for taking the offer, which is the pipeline blaming the model for its own disagreement.
Reading one table in both directions makes that class of bug unrepresentable.

It also means the planner cannot widen what may be claimed. An action with no rule produces no
opportunity, so `import`, `export`, `search` and `send` never appear. The only way the planner learns
an assertion is possible is by the verifier saying so.

## De-duplication, and why it is not a tidiness measure

A feature's `create` capability is usually provable from several subjects at once: the button, the
feature itself, the dialog, the endpoint. Every one of them yields the same sentence.

Offering all six is not six choices. It is one choice asked six times, and a cooperative model
accepts each of them, which turns one fact into six claims and a coverage metric into a lie. On the
fixture this is the difference between 227 opportunities and 143.

The survivor is the subject with the shortest ownership path, which is the one nearest the feature's
root: the control a user presses rather than the endpoint it eventually reaches. Ties break on the id
so the choice is stable between runs.

`workflow_step` is exempt. Its subjects are genuinely different steps, and collapsing them would
leave every feature with a one-step workflow.

## Content-free workflow steps are suppressed

The `workflow_step` rule names no `relationships` and no `httpMethods`. An element citing itself
therefore satisfies it. Measured, that made every candidate in the fixture offer at least one step
whose only target was its own subject, and a cooperative model accepts them all.

"This element is a step" is not product understanding. It is the shape of the schema showing through.
Those opportunities are dropped before they are offered.

## The extension point

An application can register a claim verifier, and the planner enumerates registered rules alongside
the built-ins — it has to, or a registration would be provable but never offered.

The constraint is the same one in reverse. A custom opportunity provider must correspond to a
registered verifier able to validate the same assertion. A provider cannot make an unsupported action
supported on its own, because everything it proposes still has to pass the probe before it is
offered, and the probe has no fallback.

## What the planner measures on the fixture

Over 69 candidates, of which 21 are in the benchmark dataset:

| Measure                                           | Result                                 |
| ------------------------------------------------- | -------------------------------------- |
| Required gold evidence recovered                  | 24 of 28 (86%), deterministically      |
| Forbidden capabilities offered                    | 0                                      |
| Actions ever offered, anywhere                    | create, navigate, submit, update, view |
| Capability opportunities on refusal-band features | 0                                      |
| Opportunities after de-duplication                | 143, from 227                          |

Two of those rows are worth reading slowly.

The **86% evidence recovery is deterministic**. It is within three points of what the model achieved
in Round 1, obtained without a provider call, and it is reproducible: the same graph produces the
same list.

The **refusal band offers nothing**. All four candidates — `clients.export`, `clients.search`,
`settings.new-key`, `invoices.list.clear` — offer zero capability opportunities, because nothing in
the graph proves a capability for them. Restraint stops being a request made of the model and becomes
a property of the graph. There is no wrong answer available to give.

`import`, `export`, `search` and `send` are never offered anywhere, for the same structural reason:
they have no rule, so the planner has no way to learn they are possible.

## Reasons

**Higher claim yield.** The step the model failed 80% of the time is now performed by the code that
defines what passing means.

**Less burden on the provider.** Selecting from an evidenced list is a smaller task than composing a
citation, and it is a task a smaller or cheaper model can do.

**Fewer invalid assertions.** An assertion that would be rejected is never offered, so it is never
generated, never transmitted and never counted.

**Clearer refusal behaviour.** An empty opportunity list is unambiguous. A prompt asking a model to
decline is a request; an empty list is a fact.

**Shared verification semantics.** One matrix, enumerated from and checked against, so planner and
verifier cannot disagree.

**Better provenance.** Each opportunity carries the ownership path that made its subject eligible, so
"why is this feature allowed to say this?" is answerable from the record.

**Easier debugging.** When a claim is missing, the question splits cleanly: was the opportunity
offered? If not, the graph or the matrix is at fault. If it was, the model declined, and the decline
is recorded with its reason.

## Consequences

**We accept:**

- Coverage is bounded by the matrix. A true capability with no rule cannot be claimed, however
  obvious it is to a reader. That is the same trade ADR 0007 made, now visible earlier in the
  pipeline.
- The planner has a cost: subjects × rules probes per feature, each one a real verifier call. The
  limits in `OPPORTUNITY_LIMITS` cap it, and truncation keeps the shortest proofs rather than an
  arbitrary slice.
- Prose remains unverified. Constraining the assertion does not constrain the sentence, and a model
  can still write a misleading description of a claim it was right to select. ADR 0007's blind spot
  is untouched by this decision.
- The model has less room to be interesting. It is now choosing among sentences the graph will
  support, which is a narrower job than the one it had.

**We gain:**

- The failure mode that dominated Round 1 — real facts, wrong citation — is designed out rather than
  prompted against.
- Restraint is structural on the refusal band.
- Opportunity ids are content-derived, so a decision recorded against one replays against the same
  thing on the next run.
- Declines are data. "What did the model choose not to say, and why?" joins "what did it try to say
  that we would not let it?" as an answerable question.

## What the live run showed

The planner has now been run against a real provider — `claude-opus-5`, the same model, dataset and
gold set as Round 1, with only the architecture and the prompt changed.

The open question was whether a model handed a short list of provable, evidence-backed opportunities
would pick the ones a user would recognise, decline the rest, and write the sentence well. A
cooperative model accepting every offer would have produced high yield and low meaning, and that
behaviour had already been observed in miniature, which is why the de-duplication and self-only
workflow-step rules exist.

It did not accept indiscriminately.

|                                      | Round 1 | Round 2  |
| ------------------------------------ | ------- | -------- |
| Factual claims proposed              | 382     | 113      |
| Factual claims verified              | 77      | 108      |
| Verified share of proposals          | 20%     | 96%      |
| Restraint held on refusal candidates | 0 of 30 | 30 of 30 |
| Forbidden capabilities proposed      | 27      | 0        |
| Unsupported actions proposed         | 23      | 0        |
| Wrong-feature claims accepted        | 2       | 0        |
| Workflow targets recovered           | 7 of 39 | 26 of 39 |
| Stability across runs                | 0.68    | 0.86     |

The proposal count falling by two thirds while the verified count rose is the shape the design
predicted: the model stopped inventing assertions and started choosing among proved ones. The
restraint figure is the one worth dwelling on, because it did not move by persuasion. Nothing was
added to the prompt about being careful. The refusal-band features simply have no provable capability
to offer, so there was nothing there to accept, and restraint became a property of the graph rather
than a request to the model.

What this does not settle is whether the claims that survive are _useful_. Verified is not the same
as worth reading, 44 of 63 features still end with no verified capability, and that judgement needs a
human reviewer rather than another metric. See `docs/provider-reality-check-round-2.md`.
