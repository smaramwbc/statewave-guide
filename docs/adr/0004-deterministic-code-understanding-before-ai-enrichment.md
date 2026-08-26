# 4. Extract application facts deterministically before introducing AI enrichment

- **Status:** Accepted
- **Date:** 2026-08-25

## Context

Statewave Guide's goal is an assistant that can explain how an application works and walk a user
through it. The obvious way to build that in 2026 is to point a model at the repository, embed
everything, and answer questions from retrieval.

We are not doing that first. This ADR records why, because the ordering is the whole design and it
will look like an unnecessary detour every time a deterministic extractor fails to resolve something
a model would have guessed correctly.

The alternative we are rejecting is not "no AI". It is "AI as the _first_ layer of understanding".

## Decision

The indexer extracts application structure and behaviour deterministically — nodes, relationships,
evidence, provenance — with **no model in the loop**. Semantic enrichment runs later, over the graph,
and is recorded as a distinguishable evidence type.

The layering is:

```
Syntactic facts          what the source literally says
      ↓
Symbol resolution        which declaration an identifier refers to
      ↓
Relationship graph       how those declarations connect
      ↓
Behaviour graph          what a user action causes
      ↓
Semantic enrichment      what it means, in a person's words   ← AI enters here, and only here
```

Each layer consumes the one above and may not skip it.

## Reasons

### Source code is product truth

Routes, components, forms, endpoints, schemas, permissions and Git history already encode an enormous
amount of product knowledge. We just do not normally call it documentation. Extracting it is a
parsing problem, not an inference problem, and solving a parsing problem with inference trades a
correct answer for a plausible one.

### A hallucination in the substrate is worse than one in the model

This is the load-bearing reason. If a model invents "clients.create submits to POST /clients" and
that claim enters the graph, everything downstream inherits it wearing the authority of static
analysis. Nothing later in the pipeline is positioned to question it, and the user is told a fact
about their own application that is not true.

A deterministic layer can be wrong, but it is wrong in ways that are _findable_: the evidence names a
file and a line, and the line either says what we claimed or it does not.

### Verification requires something to verify against

`docs/quality.md` reports precision and recall per relationship type against a ground-truth manifest.
That only means something because the extractor is deterministic — you cannot compute precision for a
process whose output varies between runs. Once enrichment exists, the deterministic graph is the
control it gets measured against.

### Provenance survives; probability does not

Every relationship carries file, line, symbol and reason. A user who asks "how do you know?" gets a
line of their own source. An embedding similarity score answers the same question with a number that
means nothing to them.

### Tokens and latency

An application graph is small and structured. Feeding a model a resolved path of eight edges costs
almost nothing; feeding it enough repository text to _derive_ that path costs a great deal, on every
question, forever. Deterministic extraction is a one-time cost that amortises over every query.

### It makes the AI replaceable

Because enrichment consumes a stable graph rather than raw source, the model behind it is swappable —
a different vendor, a smaller local model, or none at all. A system whose understanding lives inside
a particular model's weights cannot make that claim.

### Incremental updates become tractable

A deterministic extractor can be re-run on a diff. Knowledge that lives in an embedding index has to
be reconciled, and knowledge that lives in a conversation cannot be updated at all.

## Consequences

**We accept:**

- The graph will be incomplete. Dynamic dispatch, runtime registries and clever indirection will not
  resolve, and we will not guess at them.
- Building deterministic extractors for React, Express, forms, dialogs and permissions is slower than
  prompting, and each new framework needs work that a model would have generalised for free.
- Recall numbers will look unimpressive next to a RAG demo, because a RAG demo has no way to be
  visibly wrong.

**We gain:**

- Every claim is traceable to a line of source.
- Precision can be measured, regressed against, and defended.
- What the system does not know is _observable_, as diagnostics, rather than silently filled in.
- The AI layer, when it arrives, starts from facts rather than from text.

## The rule this implies

> **No evidence, no relationship. Unknown is better than wrong.**

Enforced in code: `createRelationship()` throws when handed an empty evidence list. Where an
extractor declines to record something, it records a diagnostic instead — because a gap that produces
a diagnostic is a finding, and a gap that produces silence is a bug.

## What would change our mind

If deterministic extraction plateaus at a recall low enough that the assistant cannot answer ordinary
questions, enrichment moves earlier — but as a _proposal_ layer whose output is marked with its own
evidence type and, where possible, verified against the deterministic graph before being trusted. It
does not become the substrate.
