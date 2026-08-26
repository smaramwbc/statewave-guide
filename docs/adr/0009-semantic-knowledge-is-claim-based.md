# 9. Semantic knowledge is stored as claims, not as documents

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The obvious representation for generated product knowledge is a document per feature: a title, a
description, a workflow, all produced in one call and stored as one blob.

It fails in four ways, and all four are ordinary rather than exotic.

**Partial correctness has nowhere to go.** A model produces a good title, a good description, and one
invented sentence. With a document, the choice is to keep the invention or discard the whole feature.
With claims, the invention is rejected and the rest survives.

**Regeneration is all-or-nothing.** A form gains a field. One workflow step is now wrong. A document
must be regenerated whole, which re-rolls the prose of everything that was already correct and turns
a one-line change into a full diff.

**Corrections cannot be targeted.** A human reviewer who spots one bad sentence has no unit smaller
than the document to act on.

**Refusals disappear.** If verification rejects a document, what the model tried to say is lost. That
is exactly the information a maintainer needs in order to decide whether the pipeline or the
application is at fault.

## Decision

Semantic knowledge is stored as **claims**: small, typed, individually evidenced, individually
verified.

```ts
interface ProductClaim {
  id: string; // `${featureId}#${type}:${ordinal}` — deterministic
  featureId: string;
  type: ProductClaimType; // title | description | purpose | workflow_step |
  // constraint | permission | synonym | question
  text: string; // generated language
  evidence: SemanticEvidence[]; // graph ids supporting it
  status: 'accepted' | 'rejected';
  rejection?: { reason: SemanticRejectionReason; detail: string };
}
```

Three properties follow.

**Verification is per claim.** A rejected question does not fail a feature; a rejected title does.
The granularity of the failure matches the granularity of the mistake.

**Rejected claims are persisted.** `product.json` carries them with their rejection reason, so
"what did the model try to say that we would not let it?" is answerable without re-running anything.

**Ids are deterministic.** `clients.create#description:1` is the same claim across runs, which is what
makes superseding — rather than replacing — possible.

## Designing for a memory layer we have not built

Statewave is not integrated, and this milestone deliberately does not integrate it. But the shape of
the storage decides what a memory layer can later do, and that decision is being made now whether or
not we acknowledge it.

A memory system that stores whole generated manuals can only replace them. One that stores small
evidence-backed claims can supersede an individual claim, retract one that lost its evidence, keep a
history of what was believed and when, and merge human corrections at the same granularity the
generator works at.

The relevant asymmetry: choosing claims now costs a little structure and preserves the option.
Choosing documents now and migrating later means re-deriving claim boundaries from prose, which is
exactly the kind of inference this project refuses to make about anything else.

So the model is claim-shaped from the start. **No Statewave code exists in this repository, and none
is added here.**

## Consequences

**We accept:**

- More structure than a document. A feature's description is a claim with an id, not a string.
- Rendering requires assembly — Markdown is projected by grouping claims, not by printing a field.
- `product.json` is larger, because it carries rejected claims too. That is a feature: refusals are
  the part most likely to be quietly dropped.

**We gain:**

- Partial acceptance, so one invented sentence costs one sentence.
- Targeted regeneration, once dependency fingerprints drive it.
- Visible refusals.
- A storage shape a memory layer can supersede at the granularity it actually reasons about.

## Relationship to the other ADRs

[ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md) decides what may become a claim.
[ADR 0008](0008-documentation-is-output-not-source-of-truth.md) decides that documents are projections
of claims. This one decides that the claim is the unit — which is what makes the other two
enforceable rather than aspirational.
