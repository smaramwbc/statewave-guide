# Round 3 — Usefulness Evaluation

> **Scored 2026-08-27 by OpenAI GPT-5.6 Sol**, `reviewerType: non_human_independent`, against the
> blinded `human-review-round-3` package under frozen gate v2.
>
> **Human Usefulness Gate: STILL OPEN.** This is independent evidence, not the human gate.

Closed Loop #4 replaced direct rendering of the Product Model with a compilation step:
`ProductModel → GuidanceIR → renderer`. This is what an independent reviewer made of the result,
across the same twenty-one features Round 2 used, from the same frozen Product Model. The only
variable that moved between rounds was presentation.

## Result

| score | n   | share |
| ----- | --- | ----- |
| 0     | 1   | 5%    |
| 1     | 13  | 62%   |
| 2     | 5   | 24%   |
| 3     | 2   | 10%   |

median **1.0** · mean **1.38** · share ≥2 **33%** · share 0 **5%** · incorrect factual claims **0**

Dimensions: correctness **1.06** (3 not assessable, excluded), clarity **1.86**, actionability
**1.14**, natural language **1.95**.

### Gate v2 — FAIL, two of four

| criterion                | required | measured |     |
| ------------------------ | -------- | -------- | --- |
| median usefulness        | ≥ 2      | 1.0      | ✗   |
| share ≥ 2                | ≥ 70%    | 33%      | ✗   |
| incorrect factual claims | 0        | 0        | ✓   |
| share scoring 0          | ≤ 15%    | 5%       | ✓   |

## Round 2 → Round 3

|                          | Round 2        | Round 3        | change   |
| ------------------------ | -------------- | -------------- | -------- |
| distribution 0/1/2/3     | 0 / 16 / 5 / 0 | 1 / 13 / 5 / 2 | first 3s |
| median                   | 1              | 1              | —        |
| mean                     | 1.24           | 1.38           | +0.14    |
| share ≥ 2                | 24%            | 33%            | +10pp    |
| `too_technical`          | 14             | **0**          | −14      |
| natural language         | 1.14           | 1.95           | +0.81    |
| clarity                  | 1.43           | 1.86           | +0.43    |
| `missing_capability`     | 13             | 8              | −5       |
| `irrelevant_information` | 3              | 1              | −2       |
| `repetitive`             | 1              | 0              | −1       |
| `incorrect_fact`         | 0              | 0              | —        |
| `missing_workflow`       | 5              | **16**         | +11      |
| actionability            | 1.24           | 1.14           | −0.10    |

The hypothesis Closed Loop #4 was built on held exactly. Internal vocabulary went to zero, malformed
language disappeared, natural language and clarity rose sharply, two features reached 3 for the first
time, and correctness did not regress.

And actionability fell. The output stopped being technical and started being incomplete.

## What the correlations say

**The capability hypothesis reversed.** Round 2 measured a 0.29 gap between features with and without
a verified capability and concluded that capability recovery was not the bottleneck. With the
presentation noise removed, the same split is 0.93:

|         | with capability (n=7) | without (n=14) | gap       |
| ------- | --------------------- | -------------- | --------- |
| Round 2 | 1.43                  | 1.14           | +0.29     |
| Round 3 | **2.00**              | 1.07           | **+0.93** |

Every feature carrying a verified capability now averages exactly 2.00. Round 2's weak signal was a
real signal being drowned.

**`GuidanceCompleteness` orders correctly at the ends and is wrong in the middle.**

| class               | n   | median | mean | share ≥2 |
| ------------------- | --- | ------ | ---- | -------- |
| COMPLETE            | 7   | 2      | 1.86 | 57%      |
| DESCRIPTIVE         | 2   | 1.5    | 1.50 | 50%      |
| ACTIONABLE          | 11  | 1      | 1.18 | 18%      |
| IDENTIFICATION_ONLY | 1   | 0      | 0.00 | 0%       |

Eleven features classified as having a user action average 1.18. The classifier counts the
synthesised `Open Clients.` entry step as an action, so `ACTIONABLE` does not mean actionable. That
is a defect in the metric, not only in the output.

## The dominant defect

Fourteen items scored 0 or 1.

| classification                   | n   | items                                   |
| -------------------------------- | --- | --------------------------------------- |
| `BAD_GUIDANCE_SELECTION`         | 10  | R01 R04 R05 R07 R08 R14 R16 R19 R20 R21 |
| `BAD_WORKFLOW`                   | 2   | R02 R15                                 |
| `BAD_REALIZATION`                | 1   | R10                                     |
| `INSUFFICIENT_PRODUCT_KNOWLEDGE` | 1   | R11                                     |

Ten of fourteen are one defect. Twelve of the low scorers each carry exactly one verified
`workflow_step` claim, and **all twelve name their subject as `feature:<id>`** rather than as a graph
node. `roleOf()` looks the id up in the graph, finds nothing, falls through to `result`, and the step
is dropped without a word. What survives is the synthesised entry step, so the guidance says
_"Open Settings."_ and stops.

The three features that scored 2 or 3 are precisely the three whose workflow steps name an _element_.

`settings.save` (R16) is the same failure by another route: it carries a verified `capability:submit`
on a control labelled **Save changes**, and the rule suppressing bare `submit` — added in Closed Loop
#4 to stop _"submit the invoices create form form"_ — discarded it.

The knowledge was present in the Product Model. The compiler dropped it.

**`BAD_WORKFLOW`.** `invoices.list.open` and `invoices.list.clear` both emit _"Open Client Detail."_
`InvoiceList` is rendered by two pages and the entry-screen resolver took the first sorted match.

**`BAD_REALIZATION`.** `clients.search` renders _"Enter the client's search."_ — the field noun came
from the feature identifier.

**`INSUFFICIENT_PRODUCT_KNOWLEDGE`.** `clients.error` has no verified claim at all and its workflow
step was rejected. It produced a title and a question, and scored 0. The silence is correct; the
result is still useless. That distinction is worth keeping rather than fixing away.

## Strongest and weakest

**R12 `client-detail.audit`** — usefulness 3, correctness 2, every dimension 2, the only `good_as_is`
flag in the set.

**R11 `clients.error`** — usefulness 0, actionability 0. A title and a question.

## Decision

**PARTIALLY.** The gate fails two of four criteria, so not YES. But the targeted defect class was
eliminated entirely and three measures moved sharply in the predicted direction, so this is not
"broadly similar to Round 2" either. The compilation thesis is supported: the architecture was
holding enough product knowledge and presenting it badly. It now presents a _subset_ of it well.

The next problem is selection, not language.
