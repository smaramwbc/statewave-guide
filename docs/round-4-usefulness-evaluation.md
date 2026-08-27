# Round 4 — Usefulness Evaluation

> **Scored 2026-08-27 by OpenAI GPT-5.6 Sol**, `reviewerType: non_human_independent`, against the
> blinded `human-review-round-4` package under frozen gate v2.
>
> **Human Usefulness Gate: STILL OPEN.** This is independent evidence, not the human gate.

Round 3 ended with a diagnosis: the architecture was holding enough product knowledge and selecting
too little of it. Closed Loop #5 changed only selection — which verified actions reach the guide —
and left the Product Model, the verification rules, and every wording template alone. Same twenty-one
features, same frozen capture, no provider call.

This is what an independent reviewer made of the result.

## Result

| score | n   | share |
| ----- | --- | ----- |
| 0     | 1   | 5%    |
| 1     | 6   | 29%   |
| 2     | 11  | 52%   |
| 3     | 3   | 14%   |

median **2.0** · mean **1.76** · share ≥2 **67%** (14/21) · share 0 **5%** · incorrect factual claims
**0**

Dimensions: correctness **1.06** (3 not assessable, excluded), clarity **1.95**, actionability
**1.52**, natural language **1.86**.

Flags: `missing_workflow` 9 · `missing_capability` 4 · `good_as_is` 1 · `too_vague` 1 · `repetitive` 1

### Gate v2 — FAIL, one of four

| criterion                | required | measured |     |
| ------------------------ | -------- | -------- | --- |
| median usefulness        | ≥ 2      | **2.0**  | ✓   |
| share ≥ 2                | ≥ 70%    | 67%      | ✗   |
| incorrect factual claims | 0        | 0        | ✓   |
| share scoring 0          | ≤ 15%    | 5%       | ✓   |

The gate needs 15 of 21 items at 2 or above. Fourteen reached it. **One item.**

## Round 3 → Round 4

|                      | Round 3        | Round 4        | change    |
| -------------------- | -------------- | -------------- | --------- |
| distribution 0/1/2/3 | 1 / 13 / 5 / 2 | 1 / 6 / 11 / 3 |           |
| **median**           | 1              | **2**          | **+1**    |
| mean                 | 1.38           | 1.76           | +0.38     |
| **share ≥ 2**        | 33%            | **67%**        | **+33pp** |
| actionability        | 1.14           | 1.52           | +0.38     |
| clarity              | 1.86           | 1.95           | +0.10     |
| natural language     | 1.95           | 1.86           | −0.10     |
| correctness          | 1.06           | 1.06           | —         |
| `missing_workflow`   | 16             | 9              | −7        |
| `missing_capability` | 8              | 4              | −4        |
| `too_vague`          | 4              | 1              | −3        |
| `repetitive`         | 0              | 1              | +1        |
| `incorrect_fact`     | **0**          | **0**          | —         |

Every measure the loop targeted moved in the predicted direction, and nothing was traded for it. The
share of items a reviewer called useful doubled while the count of untrue statements stayed at zero —
which is the whole claim this project makes about itself.

## What the scores correlate with

Computed after the scores arrived, against variables the reviewer never saw.

**A real task action is the separator.** A "task action" here means a step that is not the synthesised
`Open <screen>.` entry — an action selected from a verified claim.

|                        | n   | mean | median | share ≥2 |
| ---------------------- | --- | ---- | ------ | -------- |
| **with a task action** | 12  | 2.25 | 2      | **100%** |
| entry-only / no task   | 9   | 1.11 | 1      | **22%**  |

**0 of the 7 low scorers have a task step. 12 of the 14 high scorers do.** The two exceptions —
`api.get.partial-clients` (`NO_TASK`, an endpoint with nothing to press) and `clients.table.forbidden`
— both describe a condition rather than an action, which is the right output for what they are.

**`TaskCompletion` now orders correctly end to end**, which `GuidanceCompleteness` did not in Round 3.

| class                     | n   | mean | share ≥2 |
| ------------------------- | --- | ---- | -------- |
| `COMPLETE_PATH`           | 1   | 3.00 | 100%     |
| `TERMINAL_ACTION_REACHED` | 2   | 2.50 | 100%     |
| `PARTIAL`                 | 9   | 2.11 | 100%     |
| `NO_TASK`                 | 1   | 2.00 | 100%     |
| `ENTRY_ONLY`              | 8   | 1.00 | **12%**  |

`ENTRY_ONLY` is the failure class, and it is the only one.

**The capability gap narrowed because the weaker group rose**, which is what selection was supposed
to do.

|         | with capability (n=7) | without (n=14) | gap   |
| ------- | --------------------- | -------------- | ----- |
| Round 3 | 2.00                  | 1.07           | +0.93 |
| Round 4 | **2.29**              | **1.50**       | +0.79 |

## The nine targeted features

Closed Loop #5 predicted improvement for the features whose verified workflow step named
`feature:<id>` rather than a graph node. **Eight of nine rose; one held.**

| feature                       | R3  | R4    |
| ----------------------------- | --- | ----- |
| `clients.export`              | 1   | 2     |
| `settings.rotate-key`         | 1   | 2     |
| `client-detail.delete`        | 1   | 2     |
| `client-detail.change-plan`   | 1   | 2     |
| `settings.save`               | 1   | 2     |
| `invoices.list.clear`         | 1   | 2     |
| `invoices.list.open`          | 1   | 2     |
| `invoices.create-form.submit` | 2   | **3** |
| `nav.clients`                 | 2   | 2     |

And the controls held flat, with **zero task steps** emitted for each: `settings.new-key` 1 → 1,
`dashboard.new-client` 1 → 1, `clients.error` 0 → 0. Nothing was invented to raise a score.

## The remaining seven

| classification                   | n   | items                                                                     |
| -------------------------------- | --- | ------------------------------------------------------------------------- |
| `UNRESOLVED_ACTION_TARGET`       | 3   | R02 `clients.search` · R11 `dashboard.new-client` · R18 `settings.form`   |
| `INSUFFICIENT_PRODUCT_KNOWLEDGE` | 3   | R08 `settings.new-key` · R17 `settings.danger-zone` · R21 `clients.table` |
| `MISSING_RECOVERY_GUIDANCE`      | 1   | R14 `clients.error`                                                       |

All seven emit exactly one step — the entry — and stop.

`UNRESOLVED_ACTION_TARGET` is the addressable subset. `clients.search` owns one unlabelled text
input; `dashboard.new-client`'s root carries only a `requires_permission` edge; `settings.form` is a
container, and a container is never the action — its submit control is a sibling the resolver does not
look at.

`INSUFFICIENT_PRODUCT_KNOWLEDGE` is a graph limit, not a selection one. `MISSING_RECOVERY_GUIDANCE`
is `clients.error`, which has no verified claim at all; the silence is correct and the result is still
useless, and that distinction is worth keeping rather than fixing away.

## Strongest and weakest

**R07 `client-detail.audit`** — usefulness 3, correctness 2, every dimension 2, the only `good_as_is`
in the set.

**R14 `clients.error`** — usefulness 0, actionability 0. A title and a question.

## Three defects this round exposed

1. **`nav.clients` says the same thing twice.** _"Open Clients."_ then _"Choose "Clients"."_ — the
   synthesised entry and a verified navigation action are one act. Flagged `repetitive`; the only new
   flag in the set.
2. **The submit verb still leaks into the summary.** Closed Loop #5 removed it from the imperative
   path and not the indicative: _"You can submit a setting using "Save changes.""_ Natural language
   scored 1 for it, and it is the whole of the −0.10 on that dimension.
3. **17 of 18 assessed items scored correctness 1, not 2** — uniformly because purpose prose asserts
   more than `knownSupportedFacts` establishes ("without leaving the page", "an admin", "enterprise
   plan"). Two rounds of selection work have not touched it, and it is now the ceiling on correctness.

## Decision

**PARTIALLY.** The gate fails one criterion of four, at 67% against a required 70% — so not YES.

But the median moved 1 → 2, the share of useful items doubled, every targeted feature improved, each
control held flat, and across four rounds of pushing on usefulness not one incorrect factual claim has
appeared. The Round 3 diagnosis was right: selection, not language, was the bottleneck.

The next problem is smaller and more specific. Seven features can name a screen and nothing to do on
it, and three of them own a control the graph can already prove.
