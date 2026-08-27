# Round 5 — Usefulness Evaluation

> **Scored 2026-08-27 by OpenAI GPT-5.6 Sol**, `reviewerType: non_human_independent`, against the
> blinded `human-review-round-5` package under frozen gate v2.
>
> **Human Usefulness Gate: STILL OPEN.** This is independent engineering evidence. It is not formal
> human validation, and no amount of it becomes formal human validation.

Closed Loop #6 changed two features and nothing else. `settings.form` gained _Choose "Save changes"_,
recovered through a control the graph proves submits the same handler the form submits to.
`nav.clients` lost _"Open Clients."_, a synthesised entry step restating a verified navigation action.
No language template, verification rule, claim or provider call moved.

Nineteen features were byte-identical between the two packages.

## Result

| score | n   | share |
| ----- | --- | ----- |
| 0     | 1   | 5%    |
| 1     | 5   | 24%   |
| 2     | 12  | 57%   |
| 3     | 3   | 14%   |

median **2.0** · mean **1.81** · share ≥2 **71.4%** (15/21) · share 0 **4.8%** · incorrect factual
claims **0**

Dimensions: correctness **1.06** (3 not assessable, excluded), clarity **1.95**, actionability
**1.57**, natural language **1.90**.

Flags: `missing_workflow` 9 · `missing_capability` 4 · `too_vague` 1 · `good_as_is` 1 ·
`repetitive` **0**

### Gate v2 — PASS, four of four

| criterion                | required | measured  |     |
| ------------------------ | -------- | --------- | --- |
| median usefulness        | ≥ 2      | 2.0       | ✓   |
| share ≥ 2                | ≥ 70%    | **71.4%** | ✓   |
| incorrect factual claims | 0        | 0         | ✓   |
| share scoring 0          | ≤ 15%    | 4.8%      | ✓   |

The independent non-human usefulness benchmark passes the frozen thresholds for the first time, on
the fourth measured round, by one item.

Before importing, every item was checked against the package as issued: `reviewId`, `featureId` and
the rendered steps matched for all twenty-one. The reviewer scored what we sent.

## Round 4 → Round 5

|                      | Round 4        | Round 5        | change     |
| -------------------- | -------------- | -------------- | ---------- |
| distribution 0/1/2/3 | 1 / 6 / 11 / 3 | 1 / 5 / 12 / 3 | one 1 → 2  |
| median               | 2              | 2              | —          |
| mean                 | 1.76           | 1.81           | +0.05      |
| **share ≥ 2**        | 66.7%          | **71.4%**      | **+4.8pp** |
| share 0              | 4.8%           | 4.8%           | —          |
| correctness          | 1.06           | 1.06           | —          |
| clarity              | 1.95           | 1.95           | —          |
| actionability        | 1.52           | 1.57           | +0.05      |
| natural language     | 1.86           | 1.90           | +0.05      |
| `repetitive`         | 1              | **0**          | −1         |
| `incorrect_fact`     | **0**          | **0**          | —          |
| every other flag     |                |                | unchanged  |

**Exactly two features moved, and they are exactly the two the compiler changed.** Nineteen features
scored identically on usefulness, correctness, all three dimensions and every flag. As controlled
comparisons go this is about as clean as twenty-one items can be.

## The two

### `settings.form` — usefulness 1 → 2, actionability 1 → 2

```
Round 4:  Open Settings.
Round 5:  Open Settings.
          Choose "Save changes".
```

One step was added and the item crossed the threshold. The reviewer's note: _"it explains what the
Settings form is for, tells the user where to go, and reaches the visible Save changes action."_

Correctness stayed 1 and `missing_workflow` stayed on, for a reason worth keeping: the guide still
never says to edit the organisation name or the notification checkbox. Those inputs carry no visible
label and no claim of this feature names them, so `collectFields` declines to invent nouns for them.
The reviewer is right that the workflow is incomplete, and the compiler is right not to guess at it.

### `nav.clients` — usefulness 2 → 2, natural language 1 → 2, `repetitive` cleared

```
Round 4:  Open Clients.
          Choose "Clients".
Round 5:  Choose "Clients".
```

The redundant synthetic entry step is **absent**, confirmed in the scored artefact. The reviewer:
_"The redundant synthetic entry step is gone."_ Usefulness did not move — it was already 2 — and the
defect the Round 4 review identified is closed, which is what the fix was for.

## What the scores correlate with

Computed after the scores arrived, against variables the reviewer never saw.

**A real task action remains the separator, and it is still absolute.**

|                        | n   | mean | share ≥2 |
| ---------------------- | --- | ---- | -------- |
| **with a task action** | 13  | 2.23 | **100%** |
| entry-only / no task   | 8   | 1.13 | **25%**  |

Thirteen features name something to press and every single one scored 2 or better. Round 4 measured
the same thing at n=12 and 100%. Adding a fourteenth data point to a perfect split does not prove
causation, but it is now the third round running in which no feature naming a control has scored
below 2 and no feature naming only a screen has averaged above 1.3.

| `TaskCompletion`          | n   | mean | share ≥2 |
| ------------------------- | --- | ---- | -------- |
| `COMPLETE_PATH`           | 1   | 3.00 | 100%     |
| `TERMINAL_ACTION_REACHED` | 3   | 2.33 | 100%     |
| `PARTIAL`                 | 9   | 2.11 | 100%     |
| `NO_TASK`                 | 1   | 2.00 | 100%     |
| `ENTRY_ONLY`              | 7   | 1.00 | **14%**  |

`ENTRY_ONLY` is still the only failing class, and it lost a member.

**Every feature carrying a verified capability now scores 2 or better.**

|         | with capability (n=7) | without (n=14) | distribution with |
| ------- | --------------------- | -------------- | ----------------- |
| Round 3 | 2.00                  | 1.07           | —                 |
| Round 4 | 2.29                  | 1.50           | 0 / 1 / 3 / 3     |
| Round 5 | **2.43**              | 1.50           | **0 / 0 / 4 / 3** |

`settings.form` was the 1 in that column. It was also the only one of the seven whose verified
capability the compiler could not reach a control for.

## The six that remain below 2

| item                       | usefulness | why                                                     |
| -------------------------- | ---------- | ------------------------------------------------------- |
| R16 `clients.error`        | 0          | no verified claim of any kind                           |
| R13 `clients.table`        | 1          | a `<table>`; the graph proves nothing a user does to it |
| R14 `dashboard.new-client` | 1          | only a `requires_permission` edge                       |
| R15 `clients.search`       | 1          | an owned input the interface never names                |
| R19 `settings.new-key`     | 1          | a read-only `<code>` display                            |
| R20 `settings.danger-zone` | 1          | a `<section>`; wrapping is not doing                    |

All six emit exactly one step. None of them was touched by Closed Loop #6 and none of them moved.
The three the loop declined on purpose — R14, R15 and R16 — scored exactly what they scored in Round
4, which is the evidence that the refusals cost something real and were made anyway.

## Two honest caveats

**The added step was not independently checkable.** R01's `knownSupportedFacts` reads, in full: _"The
Settings screen contains a form."_ It does not mention the **Save changes** control, because the fact
renderer builds the list from the feature's own claim targets and `element:settings.save` is not one —
it is reached through the shared handler. So the reviewer scored the new step's usefulness without a
fact that could adjudicate its correctness. The step is true; the instrument did not confirm it. A
later round should teach the fact renderer to include recovered controls. **The issued Round 5 package
must not be edited to fix this retrospectively.**

**The gate passed by one item.** 15 of 21 against a required 15. A single reviewer scoring a single
item differently reverses the result, and one non-human reviewer has now scored four consecutive
rounds of this benchmark.

## Decision

**Closed Loop #6 hypothesis — did bounded structural action-target recovery improve externally judged
usefulness without factual expansion? YES.**

The one feature the recovery changed rose from 1 to 2 and its actionability rose from 1 to 2. The one
feature the deduplication changed lost its `repetitive` flag and rose from 1 to 2 on natural language.
Nineteen unchanged features scored identically. Zero incorrect factual claims, for the fifth round
running. The Round 4→5 expansion audit found no step lacking an accepted claim and owned work, and
none of `settings.new-key`, `settings.danger-zone`, `clients.table`, `dashboard.new-client` or
`clients.error` gained anything.

**Independent engineering gate — has the non-human usefulness benchmark passed frozen gate v2? YES.**
Four of four, first time.

**Human Usefulness Gate: STILL OPEN.** The reviewer was `non_human_independent`. The next required
step is an actual human scoring the frozen Round 5 package.
