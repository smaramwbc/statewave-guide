# Interactive Review V2 — Issued Baseline

Issued, unscored, and frozen at commit `1898315`. This evaluates the Closed Loop #14 product
surface — the floating themeable card — and not the engineering panel that v1 and its revision
looked at.

## Artifact identity audit

Closed Loop #14 reported rebuilding the `interactive-review-v1-r1` package in place. That was a real
identity violation, and the audit found exactly what it was.

|                           | sha256      | status                                                        |
| ------------------------- | ----------- | ------------------------------------------------------------- |
| r1 **record**             | `cf5cf6fe…` | committed once at `2300258`, never changed                    |
| r1 **package** as issued  | `c119f19a…` | cites `derivedFrom: 651c5568…` — **a record never committed** |
| r1 **package** after CL14 | `6261243c…` | same filename, different bytes                                |

The r1 package was built from a capture that a later gate in the same sweep re-ran, so the record it
cites never reached the repository. Correcting the citation was right; doing it under the same name
was not — anyone holding r1 from the first commit and anyone pulling it afterwards had different
files and no way to know.

**Resolution.** r1 is restored to exactly what was issued and preserved unchanged, inconsistency and
all, because that is what inconsistency looks like. The corrected package is issued as
`interactive-review-v1-r2` with `supersedes: interactive-review-v1-r1` and
`REVIEW_PACKAGE_RECORD_DIVERGENCE`. Only the _package_ is superseded: the record and the thirteen
screenshots were never in question, so r2 cites them where they live rather than duplicating them to
make a directory look complete. `build-interactive-review-r1-package.mjs` is marked historical — a
green run of it would rewrite an issued artefact.

## What v2 is

14 scenarios: the ten product scenarios v1 carried, plus four that evaluate the reusable surface —
step-through, dark theme, host branding, mobile. 16 screenshots, each validated against named DOM
states before the shutter opened and each carrying route, theme, viewport, status, highlighted target
and digest.

**13 EXERCISED, 1 PARTIALLY_EXERCISED, 0 NOT_EXERCISED.** The partial one is IR2-09: invoice rows are
real, addressable and named at runtime, and the query contract has no path that turns a runtime
instance name into guidance. None was invented for this review, so the scenario says `PARTIALLY_EXERCISED`
rather than claiming a success.

## Objective metrics, kept apart from judgement

|                                     |                |
| ----------------------------------- | -------------: |
| correct target rate                 |       **1.00** |
| target resolution rate              |       **1.00** |
| task-step retention                 | **1.00** (3/3) |
| secret leaks                        |              0 |
| fabricated labels                   |              0 |
| safe-action violations              |              0 |
| raw selectors emitted               |              0 |
| stale actions executed              |              0 |
| context-pruning errors              |              0 |
| unauthorised screen names           |              0 |
| attribution exactly one, everywhere |           true |
| page errors                         |              0 |

These say the guide behaved correctly. **They do not say anybody was helped**, and the integrity gate
fails if a metric name starts sounding like a judgement or if any of them is converted into a score.

## Product freeze and theme independence

ProductClaims `113` — 41 structural, 61 grounded, 4 rejected, 7 behavioural — claim-set hash
`bb27c5db37b8a5578626bfa56ea71bc0`, unchanged since Closed Loop #11. Round 8 R1 `686284688e58c999`,
unchanged.

Six deterministic benchmark questions were run under four themes — default, dark, Acme, compact —
and all 24 responses are byte-identical. IR2-13 checks the same thing through the browser: the
branded answer's title, purpose, conditions and steps match the default exactly while
`--statewave-guide-primary` reads `#006BFF`.

## Round 8

**No score was transferred.** No scored Round 8 artefact is committed to this repository; the only
per-item scores that ever existed belong to the package withdrawn for a fact-attribution defect and
never imported. The mapping from scenario to feature id is recorded and every `textScore` is `null`.
The integrity gate fails if one is ever filled in.

## Standing

`DEVELOPMENT_INTERACTIVE_REVIEW`. `reviewerType` and `scoredBy` are `null`, all seven dimensions are
`null` on all 14 scenarios, and `FORMAL_HUMAN_VALIDATION_GATE` remains `DEFERRED_UNTIL_PRE_RELEASE`.
