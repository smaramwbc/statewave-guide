# Round 6 — Usefulness Evaluation

> **Scored 2026-08-27 by OpenAI GPT-5.6 Sol**, `reviewerType: non_human_independent`, against the
> blinded `human-review-round-6` package under frozen gate v2.
>
> `DEVELOPMENT_USEFULNESS_GATE` **FAIL**, 3 of 4. `FORMAL_HUMAN_VALIDATION_GATE`
> **`DEFERRED_UNTIL_PRE_RELEASE`** — see [ADR 0016](adr/0016-development-proxy-evaluation-does-not-equal-human-validation.md).

Closed Loop #7 stopped passing model prose through to the reader. Every user-facing sentence is now
built from typed propositions carrying their own support. The trade was stated in advance and this is
the measurement of it.

Before importing, all 21 items were checked against the package as issued: `reviewId`, `featureId` and
rendered output matched for every one.

## Result

| score | n   | share |
| ----- | --- | ----- |
| 0     | 3   | 14.3% |
| 1     | 6   | 28.6% |
| 2     | 9   | 42.9% |
| 3     | 3   | 14.3% |

median **2.0** · mean **1.57** · share ≥2 **57.1%** (12/21) · share 0 **14.3%** · incorrect factual
claims **0**

Dimensions: correctness **1.65** (1 not assessable), clarity **1.81**, actionability **1.52**, natural
language **1.90**.

| criterion                | required | measured  |     |
| ------------------------ | -------- | --------- | --- |
| median usefulness        | ≥ 2      | 2.0       | ✓   |
| share ≥ 2                | ≥ 70%    | **57.1%** | ✗   |
| incorrect factual claims | 0        | 0         | ✓   |
| share scoring 0          | ≤ 15%    | 14.3%     | ✓   |

## Round 5 → Round 6

|                      | Round 5        | Round 6       | change      |
| -------------------- | -------------- | ------------- | ----------- |
| distribution 0/1/2/3 | 1 / 5 / 12 / 3 | 3 / 6 / 9 / 3 |             |
| median               | 2              | 2             | —           |
| mean                 | 1.81           | 1.57          | **−0.24**   |
| share ≥ 2            | 71.4%          | **57.1%**     | **−14.3pp** |
| share 0              | 4.8%           | **14.3%**     | **+9.5pp**  |
| **correctness**      | 1.06           | **1.65**      | **+0.59**   |
| clarity              | 1.95           | 1.81          | −0.14       |
| actionability        | 1.57           | 1.52          | −0.05       |
| natural language     | 1.90           | 1.90          | —           |
| `incorrect_fact`     | 0              | 0             | —           |
| `too_vague`          | 1              | **9**         | +8          |
| `missing_capability` | 4              | 8             | +4          |
| `missing_workflow`   | 9              | 9             | —           |
| `good_as_is`         | 1              | 2             | +1          |

**The correctness distribution is the finding.** Round 5: **one** item at correctness 2 and seventeen
at 1. Round 6: **thirteen** at 2 and seven at 1. The ceiling that had held for four consecutive rounds
moved, and it moved a long way.

And it cost three items dropping to 0 and the share ≥2 falling below the gate.

## The two questions, kept apart

### Has explicit semantic-language authority increased factual correctness? **YES**

Not marginally. Correctness 1.06 → 1.65; items at correctness 2 went from 1 to 13; zero incorrect
factual claims for the sixth round running. Twelve features improved, none regressed.

Two of the twelve — `nav.clients` and `invoices.list.clear` — gained **no new review facts** and
improved anyway, which isolates the cause: removing unsupported prose was sufficient on its own. For
the other ten, purpose removal and a new review fact landed in the same round and cannot be separated
per feature.

### Has useful guidance been preserved? **NO**

Share ≥2 fell 71.4% → 57.1%, three items fell to 0, and `too_vague` went from 1 to 9. The gate that
Round 5 passed now fails. This is not a marginal loss and it should not be described as one.

## What the scores correlate with

Computed after the fact, against variables the reviewer never saw.

|                              | n   | mean | median | ≥2       |
| ---------------------------- | --- | ---- | ------ | -------- |
| **has a compiled purpose**   | 4   | 2.75 | 3      | **100%** |
| no purpose                   | 17  | 1.29 | 1      | 47%      |
| **has compiled question(s)** | 6   | 2.50 | 2.5    | **100%** |
| no questions                 | 15  | 1.20 | 1      | 40%      |
| **has a real task action**   | 13  | 2.08 | 2      | **85%**  |
| entry-only / no task         | 8   | 0.75 | 1      | **13%**  |

Task action remains protective but is no longer sufficient: it was 100% ≥2 in Rounds 4 and 5 and is
85% now. Two features name a control and still score 1 — `settings.form` and `invoices.list.open` —
because naming a control is not the same as saying what it is for.

Correlation only. Purpose is emitted precisely where a verified capability exists, so "has a purpose"
is partly a restatement of "is a well-evidenced feature".

## The five that dropped

| feature                   | R5 → R6   | purpose removed | questions removed | task action  | correctness    |
| ------------------------- | --------- | --------------- | ----------------- | ------------ | -------------- |
| `clients.table`           | 1 → **0** | yes             | 1                 | none         | 1 → **2**      |
| `settings.danger-zone`    | 1 → **0** | yes             | 1                 | none         | n/a → 1        |
| `settings.form`           | 2 → 1     | yes             | 1                 | **retained** | 1 → **2**      |
| `api.get.partial-clients` | 2 → 1     | yes             | 1                 | none         | 1 → 1          |
| `invoices.list.open`      | 2 → 1     | yes             | 1                 | **retained** | not assessable |

Every one lost its purpose and its question. Three had no task action to fall back on and became a
title plus _"Open X."_ Two kept an action and still fell, which says the purpose was carrying real
weight rather than decorating.

`clients.table` and `settings.form` traded a usefulness point for a correctness point. That is the
whole loop in one line.

## The seven still at correctness 1 — and the surface nobody governed

| feature                   | classification                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `clients.search`          | **`NON_SEMANTIC_SURFACE`** — title                                                         |
| `settings.new-key`        | **`NON_SEMANTIC_SURFACE`** — title                                                         |
| `settings.danger-zone`    | **`NON_SEMANTIC_SURFACE`** — title                                                         |
| `clients.error`           | **`NON_SEMANTIC_SURFACE`** — title                                                         |
| `api.get.partial-clients` | **`NON_SEMANTIC_SURFACE`** — title                                                         |
| `dashboard.new-client`    | **`INDEXER_OMISSION`** — `label="New client"` at `DashboardPage.tsx:89` is not read        |
| `clients.create`          | **`INDEXER_OMISSION`** — `label="Name"`, `label="Billing email"` at `ClientForm.tsx:71,78` |

**Six of the seven are the title.** Closed Loop #7 compiled purpose, summary and questions and left
`titleFor()` falling back to `normaliseIdentifier(feature.id)` when no owned control carries visible
text. The reviewer said so almost verbatim five times: _"The Search title is more specific than the
supplied facts"_, _"the title's meaning is not independently supported"_.

Split the whole set on that one variable:

| title origin                | n   | mean usefulness | mean correctness | still at correctness 1 |
| --------------------------- | --- | --------------- | ---------------- | ---------------------- |
| a real `ui-label`           | 12  | **2.25**        | **1.92**         | 1                      |
| derived from the identifier | 9   | **0.67**        | 1.25             | 6                      |

This is the same variable that has separated every round of this benchmark, arriving in a new place:
a feature whose own control carries text a user can read scores 2.25; a feature whose name we
manufactured from its id scores 0.67.

`clients.create` is the exception that proves the classification — usefulness **3**, correctness 1,
and the only unsupported thing left in it is _"Enter the client's email, name and plan"_, whose real
labels are `Name` and `Billing email` sitting unread in the source.

## Decision

**Truth up, usefulness down.** The hypothesis was that language authority would raise correctness, and
it did, by more than any previous loop moved anything. The cost was larger than hoped and larger than
the gate tolerates.

Nothing here argues for loosening a Closed Loop #7 rule. Six of the seven remaining correctness
problems are a surface that was never governed, and the two biggest usefulness losses point at facts
the indexer could recover and does not. The next loop is evidence recovery, not permission to say more
than we can prove — see the [evidence recovery analysis](round-6-evidence-recovery-analysis.md).
