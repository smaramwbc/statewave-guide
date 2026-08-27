# Validation gates

Two gates measure whether this project's output is any good. They are not two levels of the same
gate. Reasoning in
[ADR 0016](adr/0016-development-proxy-evaluation-does-not-equal-human-validation.md).

| Gate                           | Reviewer                           | Status                           | Blocks            |
| ------------------------------ | ---------------------------------- | -------------------------------- | ----------------- |
| `DEVELOPMENT_USEFULNESS_GATE`  | `human` or `non_human_independent` | **PASS** — Round 5               | nothing           |
| `FORMAL_HUMAN_VALIDATION_GATE` | `human` only                       | **`DEFERRED_UNTIL_PRE_RELEASE`** | release readiness |

Both use the **same** thresholds: gate v2, frozen 2026-08-26.

| criterion                | required |
| ------------------------ | -------- |
| median usefulness        | ≥ 2      |
| share scoring ≥ 2        | ≥ 70%    |
| incorrect factual claims | 0        |
| share scoring 0          | ≤ 15%    |

Deferring the human gate does not license changing what it will measure. The human round is scored
against the identical bar the proxy rounds cleared.

## Where things stand

`DEVELOPMENT_USEFULNESS_GATE` — **PASS**, Round 5, 2026-08-27.

|                          |                    |                         |
| ------------------------ | ------------------ | ----------------------- |
| reviewer                 | OpenAI GPT-5.6 Sol | `non_human_independent` |
| median                   | 2.0                | ✓ ≥ 2                   |
| share ≥ 2                | 71.4% (15/21)      | ✓ ≥ 70%                 |
| incorrect factual claims | 0                  | ✓ = 0                   |
| share scoring 0          | 4.8%               | ✓ ≤ 15%                 |

`FORMAL_HUMAN_VALIDATION_GATE` — **`DEFERRED_UNTIL_PRE_RELEASE`**. Not attempted. No human has scored
any round of this benchmark, and none will be asked to until the product is feature-complete.

## The history, unedited

| round | reviewer type           | median | ≥ 2   | incorrect | gate v2  |
| ----- | ----------------------- | ------ | ----- | --------- | -------- |
| 2     | `non_human_independent` | 1      | 24%   | 0         | FAIL     |
| 3     | `non_human_independent` | 1      | 33%   | 0         | FAIL     |
| 4     | `non_human_independent` | 2      | 66.7% | 0         | FAIL     |
| 5     | `non_human_independent` | 2      | 71.4% | 0         | **PASS** |

Every round of this benchmark has been scored by a model. **None of it is human validation.**

Rounds 2 through 5 were reported with the sentence _"Human Usefulness Gate: STILL OPEN"_. That was
correct when written and remains correct; read it as `FORMAL_HUMAN_VALIDATION_GATE`, unattempted. No
historical report, artefact or commit message has been edited to say otherwise, and none may be.

## Rules

1. **Name the gate.** "Passed the usefulness gate" without a qualifier is not an acceptable summary.
2. **No fabricated humans.** A human review is a review by a person — not a persona, not a model
   instructed to act as a user, not an average of model scores.
3. **No relabelling.** `reviewerType` is set by whoever scored the package and is never edited
   afterwards.
4. **Release readiness needs the second gate.** No quantity of proxy rounds substitutes.

## What proxy evaluation has actually caught

Recorded because the case for continuing to use it rests on this and not on preference:

- **Round 2** — `too_technical` on 14 of 21 features, which produced ADR 0013 and Closed Loop #4.
- **Round 3** — reversed our own conclusion about the capability correlation (measured 0.29 at Round
  2, 0.93 once presentation noise cleared), and identified `feature:<id>` action selection as the
  dominant defect behind ten of fourteen low scores.
- **Round 4** — established that a guide naming a control scores 2.25 against 1.11 for one naming
  only a screen, which set the whole agenda for Closed Loop #6.
- **Round 5** — moved exactly the two features the compiler changed and no others, across twenty-one
  items and five scored dimensions.

It finds things. It is not a person.

## When the human round runs

At feature-completeness, against the frozen package for whatever round is current then, under gate v2
unchanged, scored by people who have not seen earlier rounds. Until that has happened the product is
not validated, whatever the development gate says.
