# 7. AI enriches, but does not define, product truth

- **Status:** Accepted
- **Date:** 2026-08-26
- **Extends:** [ADR 0004](0004-deterministic-code-understanding-before-ai-enrichment.md)

## Context

ADR 0004 decided that application facts are extracted deterministically before any model is involved.
Closed Loop #3 introduces the model. This ADR governs what it is allowed to do.

The temptation is obvious. A model handed a repository will produce a fluent, plausible product manual
in one pass, and it will be roughly right. "Roughly right" is the problem. A guide that tells a user
their application can import clients from a spreadsheet — when it cannot — has done more damage than
one that says nothing, because the user cannot tell which half of the answer to trust.

## Decision

> **Code determines what exists. AI may explain what verified facts mean.**

Concretely, four rules.

**1. The model never discovers features.** Deterministic code proposes candidates from graph roots —
guide elements, routes, forms, canonical endpoints, permission-backed actions. The model is handed a
candidate and asked to describe it. It is never asked "what can this application do?".

**2. The model never owns an identifier.** Where a `data-guide` semantic id exists it _is_ the feature
id, and a response that changes it is rejected with `FEATURE_ID_CHANGED`. Where none exists, the id is
derived deterministically from stable graph identities and marked provisional. No UUIDs, no
model-chosen names.

**3. Every claim must cite the graph.** A claim carries `SemanticEvidence` pointing at node or
relationship ids. An id not in the graph fails with `UNKNOWN_GRAPH_REFERENCE`; an id in the graph but
not in this feature's evidence pack fails with `NO_SUPPORTING_EVIDENCE`. A claim citing nothing is not
persisted as truth — it is persisted as _rejected_, which is not the same thing.

**4. The model does not grade itself.** `ProductFeature.confidence` is computed by the verifier from
how much of the feature survived. A model may supply `confidenceReason` as prose for a human reviewer;
it is never read as a number. A self-reported confidence measures nothing that can be checked, and
reporting it as though it could is worse than reporting none.

## The verifier fails closed

Everything a model returns passes through a deterministic verifier before it can become product
knowledge. The rejection matrix is exhaustive by design:

| Situation                               | Reason                      |
| --------------------------------------- | --------------------------- |
| Unknown graph id                        | `UNKNOWN_GRAPH_REFERENCE`   |
| Real id, not in this pack               | `NO_SUPPORTING_EVIDENCE`    |
| Route not in the graph                  | `UNKNOWN_ROUTE`             |
| Permission not in the graph             | `UNKNOWN_PERMISSION`        |
| Endpoint not in the graph               | `UNKNOWN_ENDPOINT`          |
| Workflow step with no resolvable target | `UNSUPPORTED_WORKFLOW_STEP` |
| Feature id altered                      | `FEATURE_ID_CHANGED`        |
| Contradicts graph structure             | `CONTRADICTS_GRAPH`         |
| Capability with no supporting node      | `INVENTED_ACTION`           |
| Response fails its schema               | `SCHEMA_VIOLATION`          |

When in doubt, reject.

## The honest limit

The structural checks are strong: ids, routes, permissions, endpoints and workflow targets are all
matched against a graph that was itself derived deterministically. Those cannot be talked around.

The **prose check is not**. Detecting that an English sentence asserts a capability an application does
not have is not something a deterministic verifier can do in general. What we implement is a
heuristic — capability vocabulary paired with nouns absent from the evidence — and it is a net, not a
wall. Prose that invents a capability using only words that _do_ appear in the evidence will pass.

This is stated here rather than buried, because the difference between the two guarantees is the
difference between "verified" and "spot-checked", and a reader deserves to know which one applies to
which part of a generated description.

Mitigations, in order of what they actually buy:

1. Facts live in structured fields — `routes`, `permissions`, `elements`, workflow `targets` — which
   are verified structurally. Prose is for reading, not for deciding.
2. Claims are atomic, so one bad sentence can be retracted without discarding the feature.
3. Rejected claims are persisted, so a reviewer can see what the model tried to say.

## Consequences

**We accept:**

- Descriptions will sometimes be bland, because a model constrained to cite evidence writes less
  colourfully than one inventing freely.
- Coverage will be lower than an unconstrained generator's. A feature whose graph neighbourhood is
  thin gets a thin description, or is rejected entirely.
- The prose blind spot is real and unclosed.

**We gain:**

- Every structural fact in the Product Model traces to a line of source.
- A hallucinated route, endpoint, permission or workflow target cannot reach a user.
- Refusals are visible: `product.json` carries rejected claims, so "what did the model try to say that
  we would not let it?" is an answerable question.

## What would change our mind

If a second-pass AI critic, benchmarked against the human gold set, catches materially more invented
prose than the heuristic — without rejecting correct claims — it becomes part of the pipeline. It
would still sit _before_ the deterministic verifier and could never override it.
