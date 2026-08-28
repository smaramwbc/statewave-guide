# 22. The UI asks for guidance; it does not interpret product truth

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0017](0017-semantic-language-is-a-projection-of-supported-propositions.md),
  [ADR 0018](0018-identifiers-identify-user-visible-evidence-names.md),
  [ADR 0020](0020-observed-behaviour-supports-product-truth-only-after-typed-verification.md),
  [ADR 0021](0021-dom-change-is-observation-product-state-requires-semantics.md)

## Context

Eleven loops produced a verified ProductModel and compiled guidance, and the only way to read either
was a Markdown page. That instrument understates an in-app guide, because it cannot use the running
application as part of the answer. `clients.search` is the standing example: the model knows _"You
can filter clients."_ and cannot name the input, so the Markdown answer stops there. In an
application the useful answer is that sentence plus **a way to point at the box**.

Pointing needs a boundary. Without one the first component that wants to highlight something reaches
into the ApplicationGraph, and product truth starts being decided in a UI — by people with a deadline
and a design review, using data structures that were never meant to leave the analyser.

## Decision

### One boundary, and the analyser is behind it

```
UI → Guide Query API → ProductModel + GuidanceIR + runtime context → safe actions
```

No type in the public contract mentions the ApplicationGraph, FeatureScope, claim opportunities, the
verifier, the effect taxonomy, the capability registry, vision proposals, the DOM, or a selector. The
query layer lives in `@statewavedev/guide-core` — already the environment-free orchestration package
— and receives compiled knowledge as **data**. Its only reference to the analysis packages is
`import type`, which is erased at compile time, so an application shipping a guide does not ship an
indexer. `test:query-contract` reads the source and fails on a value import, because a boundary
described in prose is a boundary that leaks.

### GuidanceIR remains the guidance model

No `QueryGuidanceIR`, no `ChatGuidance`, no second representation. The query layer **selects and
contextualises**; a layer that could rewrite guidance would be a second place where product truth is
settled, and the argument for having one place is the same argument as everywhere else in this
project.

### Contextual pruning removes satisfied steps, and records why

A step is omitted only when the context _proves_ its precondition — the route is already reached, the
target is already visible — never because it looked redundant. A task action is never removed. Every
omission carries a named reason, so "the guide skipped a step" is always answerable. This is not
factual expansion: nothing new is asserted, and less is said.

### Safe actions use semantic ids, and change nothing

`navigate`, `highlight`, `scroll`, `focus`, `open_guide_step`. All inert: they move the user's
attention, never the user's data. `click` and `submit` are absent by decision — a guide that can
press buttons is a different product, and adding one verb would make every sentence in this
repository about refusing to invent behaviour suddenly load-bearing on somebody's account.

Targets are semantic ids the bundle already knows, or routes already verified. Never a selector: a
selector is an instruction to go and find something, and this layer does not look for things. When a
semantic id is not mounted, execution returns `TARGET_NOT_AVAILABLE` rather than falling back to a
`querySelector` guess.

### A runtime target may be actionable without a static name

The distinction the whole contract turns on. `clients.search` is a real, addressable, highlightable
input that the interface never names. An **action** can point at it; a **sentence** cannot name it.
Those are different permissions, and conflating them is how _"Enter the client's search"_ reached a
reviewer in Round 3. So `Show me how to filter clients.` returns _"Lets you filter clients."_ with
`focus`, `highlight` and `scroll` actions on `element:clients.search`, no title, and no label on any
action — and the words _Search_, _Search box_ and _Filter field_ appear nowhere, because they exist
only in the identifier.

### Screen names require user-visible authority

The last identifier-derived name in the system. All seventeen stored entry steps read _"Open
<Screen>"_ with the name taken from a route identifier; four say **"Client Detail"**, which no
surface displays. A screen may be named from a runtime heading, a static user-visible heading, or a
navigation control that **unambiguously** names its destination — and from nothing else. `/invoices`
has two visible labels pointing at it, "Invoices" and "All invoices"; neither is more authoritative,
so it gets no name. That costs a good name in one place and removes every arbitrary tiebreak, which
is the trade made at each earlier naming decision.

Enforced at the query boundary rather than by rewriting the compiler, because the stored GuidanceIR
is what several scored benchmark rounds were produced from. Quietly improving it to make an old
artefact look better is the falsification `artifact-integrity` exists to prevent.

### The model classifies and verbalises; it cannot create

A provider may map a sentence onto one of six intents and choose among candidates this layer already
resolved. It cannot add a claim, a capability, a route, a semantic id, an action, a permission or a
title — the interface has no method through which such a thing could arrive, anything unrecognised is
discarded, and the discard is recorded. The contract works with no provider at all; a provider that
throws costs exactly the language improvement and nothing else.

### Current runtime context is part of the answer, and staleness is decidable

Freshness is decided against the application build and the route — never a clock. A snapshot is not
stale because it is old; it is stale because it describes something else. A context from another
build returns `STALE_CONTEXT` rather than an answer reasoned against a screen that has moved.

## Consequences

Ten first-UI scenarios answer correctly, including three that answer by refusing: _"How do I open an
invoice?"_ returns `UNSUPPORTED` rather than the guidance for **raising** one, _"What does this do?"_
with nothing focused returns `AMBIGUOUS` with candidates, and an unsupported product question returns
`UNSUPPORTED` with no actions.

441 responses are swept by gate, and none names a screen without authority, emits an action outside
the closed union, or contains a sentence absent from stored guidance.

**What this does not do.** It does not build a UI, and the interactive evaluation that would tell us
whether any of this helps a person has not happened. Feature resolution is lexical over supported
vocabulary with a coverage threshold — good enough to refuse confidently, and the place a provider
will earn its keep. Runtime instance names are modelled and unexercised: the bundle is compiled from
static evidence, no runtime value has a route into a response, and the privacy gate that proves it is
checking a path nothing currently travels.
