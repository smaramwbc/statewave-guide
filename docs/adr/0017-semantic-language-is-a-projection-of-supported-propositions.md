# 17. Semantic language is a projection of supported propositions, not an authority

- **Status:** Accepted
- **Date:** 2026-08-27
- **Extends:** [ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md),
  [ADR 0010](0010-factual-truth-requires-feature-scope.md),
  [ADR 0012](0012-product-truth-and-user-guidance-are-different-projections.md),
  [ADR 0013](0013-internal-epistemic-state-is-not-user-copy.md)

## Context

Round 5 passed the development usefulness gate on all four thresholds. It also recorded, for the
fourth consecutive round, **17 of 18 assessable items at correctness 1** — nothing untrue, nothing
strong. An audit of all 194 user-facing propositions across the twenty-one features could support 97.

The split by surface is the finding:

| surface  | supported |                                                       |
| -------- | --------- | ----------------------------------------------------- |
| summary  | **82%**   | compiled from typed propositions since Closed Loop #4 |
| question | 61%       | passed through from the model                         |
| purpose  | **38%**   | passed through from the model                         |

The surface this project compiled was twice as well-supported as the surfaces it quoted, and not
because the compiler is clever. A compiled sentence contains what was put into it. A quoted one
contains whatever was written.

ADR 0009 established that a `semantically_grounded` claim is _attached to evidence, not proven true_.
That was enforced at the level of the claim and never at the level of what the claim **says**. A
sentence is not a unit:

> _"Lets an account manager move a client onto the enterprise plan without editing the record by
> hand."_

is an actor, an action, an object, a target state and a qualifier sharing one full stop, and two
evidence refs licensed all five. Grepping the fixture separates them: `changePlan('enterprise')` is
at `ClientDetailPage.tsx:114`, and `account manager` is in no file of the application.

A second, independent defect: **25 of 103 language-claim evidence refs — 24% — point at nodes the
feature does not own.** `settings.danger-zone` cites the rotate button, which is a different feature.
`clients.table` cites the row and the delete control inside a component it does not own. ADR 0010
made ownership the gate on factual truth in Closed Loop #2 and it was never applied here.

## The mechanism that was tried first, and rejected

Scan each sentence and withhold the fragments nothing grounds. It was implemented and measured:
**it withheld 19 of 21 questions**, and the casualties were `can't`, `particular`, `history` and
`name` — tokeniser artefacts and ordinary English.

Fixing that means curating a list of permitted words, and then a hand-written English lexicon decides
what ships. A word missing from it silently deletes a true sentence, and the deletion is invisible.
That is a worse failure than the one being fixed, and this project has been burned once already by
repairing strings — `submit the invoices create form form` was produced by a template with an
identifier dropped into it twice, and no amount of string surgery addressed why it existed.

**Deterministic validation of free-form English is not achievable, and pretending otherwise would be
the exact thing this project refuses.**

## Decision

**No user-facing sentence is passed through from the model. Every one is built from typed
propositions, each carrying its own support.**

```
ProductModel   → GuidanceIR → renderer         (ADR 0012)
language claim → PurposeIR  → realisePurpose   (here)
```

### What a language claim may still do

- **Decide whether to speak.** A feature the model said nothing about says nothing.
- **Choose among grounded terms** where more than one would serve.

### What it may not do

Create a role, a state transition, a workflow effect, a location or navigation guarantee, a domain
value, or a security scenario. Not because a filter removes them — because there is no path from a
sentence to the page along which one could arrive.

### The support matrix

| proposition                                                                              | support requires                                                    | never counts                                                              |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `action`                                                                                 | a verified `capability` **assertion**'s action                      | the English of a control label                                            |
| `object`                                                                                 | the resource segment of an owned endpoint or route                  | the feature id, unless it is a plain word                                 |
| `artifact`                                                                               | an owned label **and** an owned endpoint path naming the same thing | either alone                                                              |
| `condition`                                                                              | a verified `permission` or `constraint` assertion                   | inference from a label                                                    |
| `qualifier`                                                                              | membership of a closed list of thirteen terms                       | anything not on it                                                        |
| `actor`, `location`, `motive`, `target_state`, `temporal_state`, `status_classification` | —                                                                   | **nothing. These cannot be established and are refused by construction.** |

Three rules run through it.

**Support is an assertion, never a text.** `settings.new-key#workflow_step:1` is
`structurally_verified` and its text reads _"The new API key appears on the Settings page in the
danger zone after rotating the key."_ What was verified is that one element exists. Verified claims
carry unverified prose too, and admitting claim text as support would reintroduce the whole defect
one layer up.

**Support must be owned.** The same `FeatureScope` gate ADR 0010 applies to factual truth, applied to
vocabulary. `settings.rotate-key` may say _API key_ because its own button carries the words.
`settings.danger-zone` may not, because it owns nothing labelled — and it is the section that wraps
that button.

**An artifact must be named twice.** A label alone is English on a button, which ADR 0015 already
refuses to read behaviour out of. A path segment alone is an identifier. Together they are the
application naming one thing in two independent places. `Audit trail` +
`GET /api/clients/:clientId/audit` passes. `Rotate API key` with no endpoint does not.

### Questions obey the same authority

A question mark does not reduce factual authority. _"How do I upgrade a client to the enterprise
plan?"_ asserts a plan tier while appearing to ask about one, and _"Why can't I see the New client
button?"_ presupposes conditional visibility. Both shipped in Round 5 unchecked.

So questions are compiled too, from the two shapes a verified claim licenses: a capability makes
_how do I_ answerable, and an owned permission or constraint makes _why can't I see_ answerable.

### Presentational language is a closed set

Thirteen terms, enumerated in source. This is the entire anti-escape-hatch: the obvious way to defeat
a support requirement is to relabel an unsupported fact as style, and you cannot, because style is a
finite list and `enterprise` is not on it.

Belt and braces, **nothing in `PurposeIR` is ever filled from a presentational proposition**. A
misclassification costs a diagnostic, never a falsehood. The escape hatch does not lead anywhere.

### Review facts are a projection, not an authority

Round 5 emitted _Choose "Save changes"_ for `settings.form` through action-target recovery and told
the reviewer, in full: _"The Settings screen contains a form."_ The control was reached through a
shared handler rather than the feature's own claims, so the fact renderer never mentioned it. **A step
was scored that nobody could check.**

The fact list is now built from what was emitted rather than from what the claims cite, and package
generation fails below 100% coverage. Facts add no authority — they expose authority the output
already used.

## Consequences

- 28 emitted propositions across 21 features, **28 supported, 100%**.
- 4 purposes, 5 summaries, 9 questions — down from 20, 6 and 21. **This is a large reduction and it is
  the point.** 17 propositions were withheld and 27 language claims were not rendered, 16 of them
  because they cited evidence the feature does not own.
- `client-detail.audit` reads _"Lets you view the audit trail for a client."_ — every word grounded
  twice.
- Review fact coverage 50/50, with three controls named as outside the denominator because the
  interface gives them no readable text.
- A permanent regression list: `enterprise`, `an admin`, `account manager`, `without leaving`,
  `anywhere in the app`, `freshly`, `legacy`, `compromised`. Nothing consults it at compile time. It
  exists so that if a path from prose to the page ever reopens, these come through first, because
  these are what came through last time.

## What this costs, stated plainly

Sixteen of twenty-one features now have no purpose sentence. Some of those were genuinely useful and
mostly true — _"Lets you take the client list out of the app as a CSV file"_ is a good sentence about
a real button, and it is withheld because nothing owned by that feature establishes that anything
leaves the application.

That trade is the decision, not a side effect of it. **Unknown is better than wrong**, and a system
whose whole claim is that it does not assert what it cannot prove does not get to keep the sentences
it likes. Whether a reader agrees is a question for the next review, and this ADR deliberately does
not predict the answer.

## Alternatives rejected

**Scan sentences and withhold bad fragments.** Measured: 19 of 21 questions lost, mostly to
tokenising. See above.

**Let a grounded purpose license the terms inside it.** Circular. It is the claim being checked.

**Have the model emit structured propositions instead of prose.** The honest long-term answer, and it
needs a provider call and a prompt change — both frozen for this loop, and both deserving a round
whose subject they are.

**Record call arguments in the indexer, so `enterprise` becomes provable.** Belongs to a loop about
the indexer rather than one about language, because it changes the graph every measurement in this
project is recorded against.

> **Correction, 2026-08-27.** This ADR originally added that the change "would convert 47
> `INDEXER_OMISSION` findings into support and is the single highest-value follow-up". Both halves
> are wrong, and a later analysis of all 47 measured it: **generic call-argument capture converts
> zero of them.** Six are argument-adjacent and in each a different gap is the binding constraint.
> The premise was wrong too — the graph does read call arguments, in
> `extract/permissions.ts`, `backend.ts`, `navigation.ts` and `http.ts`; what is missing is
> _generic_ capture, whose surplus measures 12 domain-meaningful literals out of 487 arguments.
> The two `enterprise` propositions that motivated the claim were reclassified to `SUPPORTED` during
> the audit's own verification pass and are not in the 47 at all.
>
> The measured ranking is element-to-element containment first (7 findings, 29 new edges,
> `DIRECT_SYNTAX`) and literal JSX attribute capture second (8 findings, 8 new labels). Call
> arguments rank fourth of four, and their one real use is a _suppression_ rather than a recovery.
> See [the evidence recovery analysis](../round-6-evidence-recovery-analysis.md).
>
> The original sentence is left above rather than deleted, because a decision record that quietly
> repairs itself is worth less than one that shows where it was wrong.
