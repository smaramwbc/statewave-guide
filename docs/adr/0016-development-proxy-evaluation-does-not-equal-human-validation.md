# 16. Development proxy evaluation does not equal human validation

- **Status:** Accepted
- **Date:** 2026-08-27
- **Relates to:** [ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md)

## Context

Four rounds of this project's usefulness benchmark have been scored by a capable model — OpenAI
GPT-5.6 Sol — reviewing blinded packages under a frozen rubric. Round 5 passed all four thresholds of
gate v2: median 2, 71.4% at 2 or better, zero incorrect factual claims, 4.8% scoring zero.

Every one of those rounds recorded `reviewerType: non_human_independent`, and every report said the
same sentence: _Human Usefulness Gate: STILL OPEN._ That sentence was correct each time and it was
also becoming misleading by repetition, because it implied a gate that ought to have closed by now
and had not — as though the project were failing to obtain something it was trying to obtain.

It is not. The project owner has decided that external human reviewers are not to be involved until
the product is feature-complete and ready for pre-release testing. Recruiting people to score
twenty-one synthetic help texts against a fixture application, five times, while the compiler
underneath is still changing every week, spends real attention on output nobody will ship.

That is a legitimate engineering decision, and it needs to be written down rather than left as a
recurring caveat, because the failure mode from here is drift: a summary that says "passed the
usefulness gate" without saying which gate, and a later reader who takes it for validation.

## Decision

**There are two gates. They are different gates, they measure different things, and neither is a
weaker version of the other.**

### `DEVELOPMENT_USEFULNESS_GATE`

- **Reviewer:** `human` **or** `non_human_independent`
- **Thresholds:** gate v2, frozen 2026-08-26 — median ≥ 2, ≥ 70% at ≥ 2, 0 incorrect factual claims,
  ≤ 15% scoring 0
- **Status:** **PASS**, Round 5, 2026-08-27, reviewer `non_human_independent`
- **Purpose:** to tell engineering whether a change made the output better or worse
- **Blocks:** nothing, once passed. Development continues.

### `FORMAL_HUMAN_VALIDATION_GATE`

- **Reviewer:** `human`, and only `human`
- **Thresholds:** the same gate v2 thresholds, unchanged
- **Status:** **`DEFERRED_UNTIL_PRE_RELEASE`** — not attempted, deliberately
- **Purpose:** to tell anyone outside the project whether the output is fit for people
- **Blocks:** any declaration of release readiness. Nothing before that.

`DEFERRED_UNTIL_PRE_RELEASE` is not `OPEN`, and neither of them is `FAILED`. The distinction matters:
a gate that is open is one nobody has walked through; a gate that is deferred is one nobody has tried
to, on purpose, and the difference is a decision rather than an omission.

## What proxy evaluation is for, and what it cannot become

A model scoring blinded output under a fixed rubric is genuinely useful and this project has the
evidence to say so. It caught the `too_technical` epidemic at Round 2, reversed our own conclusion
about the capability correlation at Round 3, identified `feature:<id>` selection as the dominant
defect at Round 3, and at Round 5 moved exactly the two items the compiler changed and no others. It
finds things. It is repeatable, cheap, and blind, and blind repeatable cheap evidence is what
iteration needs.

**It cannot become human evidence, and no quantity of it adds up to any.** A model scoring text
written by a model shares the failure modes of its own training: it is fluent about fluency, it
rewards the shape of good help, and it cannot be surprised in the way a person with an actual task in
front of them is surprised. The one measure this project cares most about — _did this help somebody
do the thing they were trying to do_ — is the measure a proxy reviewer is structurally least able to
report on, because nobody was trying to do anything.

So the two gates are not on a scale. Passing the first says the change did not make things worse and
probably made them better. It says nothing at all about the second.

## Rules

1. **No relabelling.** No historical artefact, report, ADR or commit message may be edited to change
   a `reviewerType`, to describe a proxy result as human, or to soften a "STILL OPEN". Round 5 is not
   human-validated and every document that says so stays as it is. Where the older wording _"Human
   Usefulness Gate: STILL OPEN"_ appears in Rounds 2–5, read it as this ADR's
   `FORMAL_HUMAN_VALIDATION_GATE`, unattempted.
2. **No fabrication.** A human review is a review by a person. There is no synthetic human reviewer,
   no persona, no "acting as a user", and no averaging of model scores into something described as
   human consensus.
3. **Name the gate.** Any statement that a usefulness gate passed must name which one. "Passed the
   usefulness gate" without a qualifier is not an acceptable summary.
4. **Release readiness requires the second gate.** The product may not be described as validated,
   user-tested, or ready for release on proxy evidence, however many rounds of it exist.
5. **The thresholds do not move.** Deferring the human gate does not license changing what it will
   measure. Gate v2 stays byte-identical, so the human round is scored against the same bar the proxy
   rounds cleared.

## Consequences

- Development proceeds on proxy evidence, and says so every time it reports a number.
- The pre-release human round is now a scheduled piece of work rather than a permanently open
  question. It runs against the frozen package for whichever round is current when the product is
  feature-complete.
- `scripts/human-review-import.mjs` prints both gates by name, with the deferred status, so the
  distinction survives in the tool and not only in this file. The thresholds, the rubric and the
  arithmetic are untouched.
- A reader who finds only the proxy result and not this ADR still cannot be misled, because every
  report already records `reviewerType` and says the reviewer was not human.

## Alternatives rejected

**Close the gate with a model and note the caveat.** This is the failure this ADR exists to prevent.
A caveat in paragraph four does not survive being summarised.

**Recruit reviewers now.** Spends real people's attention on output that is still changing weekly,
and burns the one asset a pre-release human round depends on: reviewers who have not already seen
five versions of the same twenty-one items and formed an opinion.

**Drop the human gate entirely and rely on proxy evidence.** Would make the project's central claim —
that this produces help a person can use — unfalsifiable by anyone outside it.
