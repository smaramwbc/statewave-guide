# 8. Documentation is output, not a source of truth

- **Status:** Accepted
- **Date:** 2026-08-26

## Context

The problem this project exists to solve, stated plainly:

> I don't want developers maintaining a second version of their application in Confluence just so the
> assistant understands the first one.

Every documentation system that treats prose as the primary artefact eventually drifts, because the
code changes on one schedule and the prose on another, and only one of them breaks a build when it is
wrong. The result is a 200-page site nobody has opened since 2023.

Closed Loop #3 generates Markdown for the first time. That creates an immediate risk: as soon as
generated docs exist, someone will edit one, and the edit will be lost on the next run — or worse,
preserved, at which point the docs and the model disagree and neither is authoritative.

## Decision

The chain of authority is:

```
SOURCE CODE            the only thing anyone edits
    ↓
ApplicationGraph       deterministic facts, with evidence
    ↓
ProductModel           verified semantics — product.json
    ↓
Markdown docs          a projection
```

**`product.json` is the artefact. Markdown is a rendering of it.**

Consequences of taking that literally:

- Generated Markdown is **never** hand-edited. It is regenerated, and it may be deleted at any time
  without loss.
- Every generated document carries its source metadata — commit, graph hash, generator version,
  provider and model — so a reader can tell which version of the application it describes.
- A correction is made by changing the code, or by changing the enrichment pipeline. Never by editing
  the output.
- The docs directory is a build artefact. Committing it is a choice a consuming project makes for
  reviewability, exactly as with the application graph — not a claim that it is a source.

## Why Markdown is nonetheless generated

Because a Product Model that only a program can read does not get reviewed. Markdown is how a human
notices that a description is wrong, and noticing is the point of generating it at all. It is a
reading surface, not a storage format.

The ordering matters: `product.json` is generated first and Markdown is derived from it, so the two
cannot disagree. Structural ordering in `product.json` is deterministic even though generated prose
may vary between providers — which means a diff shows a real change in product understanding rather
than churn.

## Consequences

**We accept:**

- Anyone who wants to correct a sentence must change the code or the pipeline, which is slower than
  editing a file. That friction is the mechanism, not a side effect.
- Generated docs are less polished than hand-written ones.
- A project that wants prose we cannot derive needs its own documentation alongside — and that is
  fine, as long as it is not mistaken for this.

**We gain:**

- Documentation cannot drift from the application, because it is not stored separately from it.
- Deleting the docs directory loses nothing.
- "Which version does this describe?" is answerable from the document itself.

## Relationship to ADR 0007

ADR 0007 governs what may enter the Product Model. This one governs what leaves it. Together they
mean a generated sentence can be traced backwards through the model, to a verified claim, to a graph
relationship, to a line of source — which is the property that makes generated documentation worth
trusting at all.
