# Interactive Review v1 — Freeze Record

Issued, unscored, and frozen at commit `d343db5`. This is the baseline any scored package must be
validated against, and it records two defects found **by** freezing.

## 1. What was issued

| file                                                    | sha256                                            |
| ------------------------------------------------------- | ------------------------------------------------- |
| `interactive-review-v1.json` (run record)               | `1cac8938ae9e3a48…`                               |
| `interactive-review-v1.package.json` (reviewer package) | pinned in `scripts/interactive-review-freeze.mjs` |
| 9 screenshots                                           | all pinned                                        |

`interactive-review-v1.json` is **evidence** — what a real Chromium session did — and is byte-identical
forever. `interactive-review-v1.package.json` is the **instrument**, derived from it by pure
re-projection: no browser, no screenshots re-captured, no product executed. `test:interactive-review-package`
proves the derivation is reproducible; `test:interactive-review-freeze` pins every issued byte with
digests held in source rather than in a sibling manifest, because a manifest that travels with its
artefacts can be regenerated alongside them — which is how a round of evidence was falsified in Closed
Loop #8.

The end-to-end suite writes into this directory, so the freeze is not theoretical: it is one
`pnpm test:guide-ui-e2e` away from being overwritten at all times.

## 2. Two defects found by freezing

Digesting every artefact revealed that **two screenshots are byte-identical** —
`D-showme-highlight-new-client.png` and `H-ambiguous-response.png`. Two questions meant to produce
different screens produced one, and both scenarios are weaker than the Closed Loop #13 report claimed.

**IR05 never exercised focus.** The scenario supplies `focusedSemanticId: clients.create`; the guide
answered as though none was supplied. Opening the panel moves focus into its composer, so by the time
the question is asked the host no longer reports the element the user was looking at. _The act of
asking destroys the context the question is about._

**IR06 is not an ambiguity.** It returned `UNSUPPORTED`, not a choice. The host marks its markup with
`data-guide` and registers nothing explicitly, so the visible-target list reaching the query contract
is empty and there is nothing to be ambiguous between.

Both are now carried in the package as computed `caveats`, so a reviewer scoring `IR05` is not told
they are looking at a focused answer while looking at a refusal. Neither is fixed: fixing would mean
re-running a frozen experiment, and removing them would hide a defect. They are issued, labelled, and
left to be scored for what they actually are.

**This corrects the Closed Loop #13 final report**, which stated that IR06 returned `AMBIGUOUS` with
candidates. It did not. The end-to-end assertions were too weak to tell the two apart — checking only
that no purpose and no feature id appeared, which an unsupported answer also satisfies.

## 3. Reviewer package structure

Facts and judgements are separated, which the raw record does not do. In the record each scenario
carries `response`, `interaction` and `safety` alongside an empty `scores`; a reviewer reading that has
the engineering verdict sitting inside the thing they are being asked to judge. **A scenario can run
flawlessly and still be unhelpful**, and the structure has to leave that outcome available.

- `facts` — verbatim from the run: routes, question, what the guide said, expected and actual target,
  interaction outcomes, safety counters.
- `caveats` — computed, where the run did not exercise what the scenario is named for.
- `scores` — seven dimensions, all `null`: usefulness 0–3, correctness / taskCompletion /
  targetAccuracy / contextualRelevance / actionSafety / uiClarity 0–2.
- `failureClassification` — one dominant cause from a closed list of thirteen, required wherever
  usefulness ≤ 1.

Every screenshot is associated. Six belong to scenarios; three are **context frames** — the host with
the guide closed, the empty panel, the developer inspector — which belong to a state rather than a
scenario and are labelled as such instead of being attributed to a scenario they did not come from.
Zero orphans.

## 4. Round 8 comparison — prepared, not asserted

The mapping from each scenario to its Round 8 feature is recorded. **No Round 8 numbers are.**

No scored Round 8 or Round 8 R1 file is committed to this repository. The R1 result exists as an
aggregate stated in a loop specification, and the only per-item Round 8 scores that ever existed belong
to the package withdrawn for a fact-attribution defect and explicitly not imported. Writing _"text
usefulness 1"_ beside `clients.search` would be citing a number this system cannot produce, from a
package it refused. The comparison is left for a reviewer to make against evidence they have.

## 5. Importing a scored package

`pnpm review:import-interactive <file>` validates before it aggregates: same package, same derivation
digest, same scenarios, and **facts byte-identical to what was issued**. It refuses a package whose
`reviewerType` is `human` — the formal gate has its own procedure and is not reachable through a
development importer — and refuses any scenario scored `usefulness ≤ 1` without a named dominant cause.

Written before the scores arrived, deliberately: an importer written after seeing the numbers is an
importer written to accept them. Round-tripped against a well-formed package, a package with one
edited fact, and one claiming to be human validation — accepted, refused, refused.

## 6. Standing

`DEVELOPMENT_INTERACTIVE_REVIEW`. The incoming review is `non_human_independent` and does **not** close
`FORMAL_HUMAN_VALIDATION_GATE`, which remains `DEFERRED_UNTIL_PRE_RELEASE`.

ProductModel, Query Contract, GuidanceIR, Guide UI, safe actions, highlight and focus behaviour,
context adapter, session, runtime evidence and Round 8 R1 are all unchanged. No Round 9 exists.
47 gates, 1265 tests, `pnpm verify` green.
