# 13. Internal epistemic state is not user copy

- **Status:** Accepted
- **Date:** 2026-08-26
- **Extends:** [ADR 0008](0008-documentation-is-output-not-source-of-truth.md),
  [ADR 0009](0009-semantic-knowledge-is-claim-based.md)

## Context

Day 2 finished with a pipeline that was safe and guidance that was not useful. On a frozen
21-feature benchmark against a real model, 114 of 120 factual claims verified, restraint held 30 of
30 on the refusal band, and nothing wrong reached the Product Model. An independent reviewer then
scored the rendered output blind against a frozen gate: median usefulness **1**, only 24% scoring
2 or better, nothing scored 3 and nothing scored 0. Zero features were flagged `incorrect_fact`. The
output was not harmful, misleading or wrong. It was uniformly mediocre.

`too_technical` was flagged on 14 of the 21 — the largest flag by a wide margin, and the one that
turned out to have a precise cause.

**Ten of the twenty-one features carried the sentence _"No capability, route or permission has been
verified for this feature."_ All ten were flagged `too_technical`.** A perfect correlation, and the
strongest single predictor in the set. The reviewer put it plainly on R10: _"The internal
verification fallback should not be exposed to the end user."_

On R04 and R06 it did worse than read badly. It sat directly above a confident description of what
the control does, so the page said nothing had been verified and then described the thing in the next
line. Two documents contradicted themselves in consecutive sentences, and both contradictions were
produced by a renderer doing exactly what it had been told to do.

The sentence was accurate. That is what makes it worth an ADR rather than a bug fix. Every word of it
was true, evidenced and reproducible. It was also a report on the internal state of our verifier,
addressed to somebody who had opened the page to find out how to use a product.

### The vocabulary is ours, not the reader's

Once the fallback is read that way, the same category error is visible elsewhere in the copy. These
words are all load-bearing inside the pipeline and all meaningless to a user of the application being
documented:

_verified_, _structurally verified_, _semantically grounded_, _ProductClaim_, _capability_, _route_,
_graph node_, _evidence_, _verifier_, _unsupported rule_, _feature scope_.

A reader who sees "no capability has been verified" is being asked to hold a model of our
verification pipeline in order to interpret a sentence about their invoices. They have no way to act
on it, no way to check it, and no reason to know what a capability is. The correlation with
`too_technical` is not a coincidence of phrasing; it is the reviewer noticing that the document had
changed subject.

## Decision

> **Internal verification state, claim status and evidence diagnostics are never automatically
> exposed to end users. Where knowledge is missing, guidance is omitted rather than replaced with
> technical fallback language.**

The user-facing answer to "we could not establish anything about this feature" is **silence**.
`NO_VERIFIED_DESCRIPTION` is now the empty string, and the situation that used to produce a sentence
now produces a `GuidanceDiagnostic`:

```ts
{
  code: 'NO_VERIFIED_CAPABILITY',
  // "Nothing this feature does could be established, so no description was
  //  written. Silence is the output; the technical reason lives here."
  detail,
  subject: feature.id,
}
```

Two outputs, two audiences, and they are not the same object. `NO_VERIFIED_CAPABILITY` is a developer
diagnostic. Its user-facing counterpart is not a shorter sentence or a gentler one. It is nothing.

The six diagnostic codes — `NO_VERIFIED_CAPABILITY`, `NO_USER_VISIBLE_LABEL`, `NO_WORKFLOW_ORDER`,
`CONSTRAINT_WITHHELD_AS_IRRELEVANT`, `LANGUAGE_CLAIM_UNSUPPORTED`, `QUESTION_DISCARDED_AS_TECHNICAL` —
exist so that every subtraction the compiler makes is recorded somewhere. The developer keeps
everything the user stops seeing.

### Raw permission identifiers are the same error

"It requires the `clients:create` permission" contains no internal vocabulary and still fails the same
test. `clients:create` is a string from our authorisation code. It is not printed anywhere in the
interface, it is not what an administrator's screen calls the setting, and a reader cannot look it up.
Telling them the identifier is telling them about our implementation and calling it help.

The `requires_permission` proposition therefore realises as _"You need permission to create a client."_
The identifier stays in the proposition's provenance, where a developer inspecting the feature can
read it. The user is told the thing they can act on — that permission is involved and roughly which —
and not the thing only we can use.

## This is not a decision to hide uncertainty from the team

The information moved. It did not disappear, and it is worth naming where it went, because "stop
printing the caveat" is a decision that could easily become "stop tracking the caveat".

- **`GuidanceDocument.diagnostics`** carries every code above, with its detail and its subject. A
  feature that says nothing to a user says `NO_VERIFIED_CAPABILITY` to whoever asks why.
- **`GuidanceProvenance`** is non-optional on every proposition, sentence and step, and carries the
  claim ids and graph fact ids behind it. The permission identifier, the route and the node ids all
  live there.
- **`GuidanceCompleteness`** grades each feature — EMPTY, IDENTIFICATION_ONLY, DESCRIPTIVE,
  ACTIONABLE, COMPLETE — and is explicitly never rendered. It exists so that "how much were we able
  to say?" is a number rather than an impression.
- **`product.json`** already persists rejected claims with their rejection reasons
  ([ADR 0009](0009-semantic-knowledge-is-claim-based.md)), ownership paths
  ([ADR 0010](0010-factual-truth-requires-feature-scope.md)) and recorded declines
  ([ADR 0011](0011-deterministic-claim-opportunities-before-model-selection.md)).
- **The Inspector** is the developer surface that already shows evidence excerpts and ownership
  reasons for exactly this purpose. Nothing was removed from it.

The pipeline is now more transparent about its uncertainty than it was on Day 2, not less. What
changed is who it is transparent to. Previously the only place the uncertainty appeared at all was
inside a user's document, which is the one audience that could do nothing with it.

## What removing the fallback exposed

Two defects surfaced during this work, and both are the same shape: a fallback asserting something
nobody had established.

**A fallback verb.** The no-expansion check — every proposition must trace to an accepted claim or a
graph fact — caught a trigger step defaulting its capability action to `navigate` when the claim
carried none. Three features asserted a navigation no claim supported. `action` was made optional, and
an absent action now yields _"Choose X."_ and says no more than is known. The check earning its keep on
its first run is the argument for having it.

**A latent idempotency bug.** A feature-acceptance gate read `description !== ''` as "redaction ate the
model's prose". Once the renderer deliberately said nothing about a feature with no capability, replay
dropped that feature entirely. Acceptance now turns on the title and the claims. The model's own
description never reaches a reader in any case, because the pipeline replaces it with prose composed
from accepted claims. The bug had been there the whole time; it needed an empty description to show.

## What it measures

Compiled from the frozen Round 2 ProductModel, with no provider call, so presentation is the only
variable that moved:

| Check                                     | Result |
| ----------------------------------------- | ------ |
| Internal vocabulary in user copy          | 0      |
| Permission identifiers in user copy       | 0      |
| Documents that both disclaim and describe | 0      |
| Empty filler sections                     | 0      |
| Propositions without provenance           | 0      |

Completeness across the 21 features: COMPLETE 7, ACTIONABLE 11, DESCRIPTIVE 2, IDENTIFICATION_ONLY 1,
EMPTY 0.

That last row matters for the risk below. Silence about a capability does not produce a blank page.
One feature of twenty-one comes out at IDENTIFICATION_ONLY and none comes out EMPTY, so in practice
the ten features that used to carry the fallback now carry a title and whatever else was provable,
minus one sentence.

## The risk, stated plainly

**A user who is shown nothing cannot tell the difference between "this feature does nothing" and "we
could not work out what it does."** Those are genuinely different situations and the document no
longer distinguishes them. Someone reading a short page may conclude the control is unimportant when
in fact our graph is thin there.

This is a real cost and it is accepted rather than solved. The alternative was measured: telling the
reader about our verifier distinguished the two cases in a vocabulary that taught them nothing about
the product, and it was flagged `too_technical` on ten of ten. Producing a distinction the reader
cannot use is not better than producing no distinction. Closing the gap properly means saying
something true about the feature — what it is called, where it is, what is shown — which is work on
the graph and the compiler, not work on the caveat.

## Consequences

**We accept:**

- Absence is ambiguous to the reader, as above.
- A thin graph now produces a quiet document rather than a loud one, so gaps are less visible from
  the outside. They are more visible from the inside, which is where they get fixed, but the two are
  not the same thing and we are trading one for the other.
- Anyone who wants to know how confident the pipeline is must open the Inspector or read
  `product.json`. There is no longer a shortcut through the rendered page.
- Two representations of the same fact — a diagnostic and a silence — must be kept in step. A
  diagnostic that stops firing when the copy stops appearing would be an unobserved regression, which
  is why the compiler emits it on the same branch that decides to say nothing.

**We gain:**

- The single strongest predictor of `too_technical` in the Day 2 review is deleted rather than
  reworded, and the ten features that carried it are ten features that no longer change subject.
- Self-contradicting documents are structurally impossible: there is no disclaimer left to
  contradict. Measured at 0 on the frozen model.
- User copy contains no string a reader cannot act on or look up. Permission identifiers, node ids
  and rule names now live only where they are useful.
- Every subtraction is recorded. The set of things the user is not told is a list a developer can
  read, rather than an inference from what is missing.

## Alternatives considered

**Rewording the fallback into friendlier language — "We could not confirm what this does."**
Rejected. It removes the jargon and keeps the category error. The sentence is still a statement about
our epistemology rather than about the product, still addressed to a reader with no use for it, and
still contradicts any description beside it. Softening the vocabulary would very likely have moved the
`too_technical` flag without moving the usefulness score, because the flag was the reviewer's name for
the problem and not the problem. The defect is the subject of the sentence, not its register.

**Showing a confidence score to end users.** Rejected, and it is the same mistake with a number in it.
A reader who cannot act on "not verified" cannot act on "0.62" either, and the score is worse in two
respects: it implies a calibration we have not established, and it invites the reader to weigh our
confidence against their own judgement of a screen they can see and we cannot. Confidence is an input
to our decision about what to say. Exporting it asks the user to make that decision for us with less
information than we had.

**Keeping the fallback only where no other content exists.** Rejected, and this is the alternative
that looks most reasonable until the data is checked. The argument is that the sentence only offends
when it sits beside a description, so suppress it there and keep it as a last resort. But R04 and R06
— the two documented contradictions — are exactly that shape: a feature whose capability was
unproved and whose other claims still described the control confidently. The rule "only when there is
nothing else" would have had to fire on precisely the pages where it did the most damage, because
"nothing else" was being decided by capability status while the rest of the copy was being produced
from other claim types. The condition is not expressible in a way that excludes the observed failures.

## Relationship to the other ADRs

[ADR 0008](0008-documentation-is-output-not-source-of-truth.md) decided that a document is a
projection of what is known. This one decides that the projection is **lossy on purpose**, and that
what it drops is the pipeline's own state. [ADR 0009](0009-semantic-knowledge-is-claim-based.md) is
what makes the omission affordable: rejected claims and their reasons are persisted, so nothing has
to be printed in order to be kept.

ADR 0007's blind spot — that constraining an assertion does not constrain the sentence — is the reason
this decision has to be made at the compiler rather than at the verifier. The fallback sentence was
never a claim. No gate in [ADR 0007](0007-ai-enriches-but-does-not-define-product-truth.md) or
[ADR 0010](0010-factual-truth-requires-feature-scope.md) could have caught it, because it was the
renderer speaking in its own voice about having nothing to say.
