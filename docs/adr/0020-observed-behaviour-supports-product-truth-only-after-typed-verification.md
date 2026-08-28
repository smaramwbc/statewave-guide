# 20. Observed behaviour may support product truth only after typed verification

- **Status:** Accepted
- **Date:** 2026-08-28
- **Extends:** [ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md),
  [ADR 0010](0010-factual-truth-requires-feature-scope.md),
  [ADR 0017](0017-semantic-language-is-a-projection-of-supported-propositions.md),
  [ADR 0019](0019-runtime-observes-behaviour-vision-proposes-meaning.md)

## Context

ADR 0019 built the runtime subsystem and stopped deliberately short of the Product Model. It
established that a browser can see what static analysis cannot — `clients.search` narrowing a table
from five rows to two, `dashboard.new-client` moving the user to `/clients` through a dispatch table
that resolves to nothing — and then left that evidence sitting in a JSON file. Nothing downstream
read it. The guide still said nothing about any of it.

Closing that gap is the only thing left that moves usefulness, and it is also the single most
dangerous change this project has made. Every previous loop tightened what may be said. This one
widens where a claim may come from, and the two are not symmetric: a rule that admits too little
costs a sentence, and a rule that admits too much costs the reader's ability to trust any sentence.

## Decision

An observed behaviour becomes a Product Model claim only by passing a **named rule for its action**,
and it enters as a claim of its own kind.

### A fourth verification status, not a relabelled third

```
proposed → structurally_verified   (the graph proves it)
         → behaviorally_verified   (a run demonstrated it)
         → refuted
```

`behaviorally_verified` is a peer of `structurally_verified`, not a synonym. `isVerifiedClaim()` is
the single predicate every consumer uses, so the two are equal in _standing_ — both may license a
sentence — while remaining distinguishable in _kind_, forever, in the artefact. That distinction is
not decorative. A structural claim is true of the code; a behavioural claim is true of one run of
one build against one seeded data set, under one set of permissions. Anything that later wants to
treat them differently must still be able to tell them apart.

### Every behavioural claim carries the run it came from

`runtimeTraceId`, `runtimeContext` (route, fixture state, permissions, feature flags), the graph hash
it was correlated against, and every observed effect, each labelled `kind: 'runtime'`. A static claim
may not carry runtime evidence and a behavioural claim may not carry static evidence — they land in
the same array, and the moment "the graph proves this" and "a browser once did this" become the same
sentence to a downstream consumer, the distinction above stops existing in practice.

### The source is never overruled

Where a run and the graph disagree, the record is **refused and reported**, not merged. Neither wins
automatically: preferring the graph discards the only evidence that a control's real behaviour
differs from its apparent one, and preferring the run lets one seeded scenario rewrite the source.
Choosing between them is a judgement about the application, and the pipeline is not entitled to make
it.

### Widening the evidence does not widen the licence

Ownership, title authority, control-name authority and the Closed Loop #7 language rules apply
unchanged to behavioural claims. A run establishes a **capability**; it establishes no endpoint, no
permission, and no name. `settings.rotate-key` is the case that proves this is not theoretical: the
run demonstrably reveals something, and what it reveals is a `<code>` block that Closed Loop #9
refuses to name because its text is a value rather than a label. The capability is in the model. The
sentence is not.

## Consequences

Seven capabilities entered the Product Model. Purposes rose from four to six and questions from
eleven to twelve, and the headline is `clients.search` — refused for seven rounds as `capability/search`,
now stating **"Lets you filter clients."** on the strength of a membership count changing from five
to two, without the word _search_ appearing anywhere.

Five records were refused, and the refusals cost more to build than the acceptances.

**The rule that could not fail.** `select` was written as _"something appeared, or the route changed"_ —
a disjunction nearly every click satisfies. It verified `invoices.list.open`, and the compiler
duly emitted **"Lets you select an invoice."** into a review package about a control that leaves the
invoice list and shows a _client_. The rule existed, ran, and passed; it was not a check. It now
requires an observable collection change **and** no navigation, which refuses that control — and the
same trace's route change was always visible to the `navigate` rule. The evidence was never the
problem. Two layers had independently written the loose version, which is the second lesson: the
runtime verifier and the integration table both encode rules for the same actions, and a rule stated
twice will eventually disagree with itself.

That is the standing hazard this ADR leaves behind. `MECHANISM_ACTIONS` had the same shape — the
language layer withheld _"Lets you show a setting."_ while the older summary path, running off its
own hard-coded `submit`, emitted **"You can show a setting using 'Rotate API key'."** from the very
same claim. Both are now single lists. Anything added later must be too.

**A gate that cannot fire is not a gate.** `test:runtime-static-contradiction` reports zero
contradictions, which is worth nothing on its own — a detector that never fires and one that cannot
fire print the same line. It therefore constructs records that conflict with static claims that
really exist in the frozen capture, requires each to be refused, and only then reports the zero.

**Silence stayed cheap.** Fifteen of twenty-one features still emit no purpose, and eleven can verify
no capability from either source. Runtime observation moved the ones with a surface to
observe. It did not move `api.get.partial-clients`, and nothing should.
