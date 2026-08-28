# Round 8 — Freeze Record

Closed Loop #10 is complete and Round 8 is **issued, unscored, and frozen** at commit
`b020ce2`. This file is the baseline any scored package must be validated against.

Everything below was counted from the issued artifacts on disk. Where a remembered figure
disagreed with the file, the file won; none did.

## 1. Frozen surfaces

Runtime evidence · runtime capability verification · ProductModel · semantic-language authority ·
title authority · GuidanceIR · review artifacts.

No product behaviour may change while Round 8 is out for review. `test:artifact-integrity` hashes
every historical artefact, runs the checks that used to mutate them, hashes again, **and** compares
the working tree against the committed record — a deterministic rewrite is caught by the third check
even when the first two agree.

## 2. The temporary false claim is absent from the issued package

Closed Loop #10 briefly emitted **"Lets you select an invoice."** for `invoices.list.open`, from a
`select` rule written as _"something appeared, **or** the route changed"_. The control does not
select an invoice: it leaves the invoice list and navigates to `/clients/c1`.

Verified against the issued artifacts, not against recollection:

| check                                                    | result                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `"select an invoice"` in any Round 8 file                | **absent**                                                                                        |
| `select`/`Select` anywhere in the three Round 8 files    | 7 hits, **all** the UI label "Clear selection" on `invoices.list.clear` (`titleOrigin: ui-label`) |
| runtime evidence records with `action: 'select'`         | **0**                                                                                             |
| ProductModel claims with `assertion.action === 'select'` | **0**                                                                                             |
| behavioural claims for `invoices.list.open`              | **0**                                                                                             |

`invoices.list.open` is issued as **R12** and emits nothing at all:

```json
{ "title": null, "summary": null, "purpose": null, "steps": [], "conditions": [], "questions": [] }
```

with `knownSupportedFacts: []`, `hasVerifiedCapability: false`, `hasCompiledPurpose: false`, and no
`runtimeCapabilities`.

### The tightened rule, in both places it lives

```
runtime verifier   ROUTE_CHANGED present        -> rejected NAVIGATION_OCCURRED
                   no COLLECTION_CHANGED
                   and no VALUE_CHANGED         -> rejected NO_SELECTION_EFFECT

integration table  requires:    ['COLLECTION_CHANGED']
                   refusedWhen: ['ROUTE_CHANGED']
```

The committed evidence artefact records the refusal:
`select @ element:invoices.list.open -> NAVIGATION_OCCURRED`.

### One structural claim survives, and is withheld by name

`invoices.list.open#workflow_step:1` is still `structurally_verified` and still carries the Round 2
provider text _"Select an invoice by pressing the open button on its row in the invoice list."_ It
does not reach the package, and not by luck — two independent mechanisms withhold it:

- the compiler drops it with a named accounting entry, `UNSUPPORTED_PRESENTATION` — _"The control
  resolved, but nothing about it could be phrased as an instruction"_ (diagnostic
  `NO_USER_VISIBLE_LABEL`), because Closed Loop #8 forbids naming a control the interface never names;
- Closed Loop #7 compiles language from propositions and never passes model text through, so a claim's
  `text` field has no route to a reader regardless.

A reviewer scoring R12 sees an empty item. That is the correct output.

## 3. Issued-package baseline

**Authoritative.** Counted from `human-review-round-8.json` and `.key.json`.

| quantity                 | Round 8 | Round 7 |   Δ |
| ------------------------ | ------: | ------: | --: |
| **ProductClaims**        | **113** |     106 |  +7 |
| — structurally verified  |      41 |      41 |   0 |
| — behaviourally verified |   **7** |       0 |  +7 |
| — semantically grounded  |      61 |      61 |   0 |
| — rejected               |       4 |       4 |   0 |
| **purposes**             |   **6** |       4 |  +2 |
| **questions**            |  **12** |      10 |  +2 |
| **task actions**         |  **14** |      14 |   0 |
| **titles**               |  **13** |      13 |   0 |
| summaries                |       7 |       5 |  +2 |
| steps (all, incl. entry) |      31 |      31 |   0 |
| entry steps              |      17 |      17 |   0 |
| conditions               |       8 |       — |   — |
| checkable facts          |      93 |      60 | +33 |
| language propositions    |      38 |       — |   — |
| withheld language        |      15 |       — |   — |

Package identity: `human-review-round-8`, gate `v2`, seed **20260901**, shuffle
`mulberry32 + Fisher-Yates`, 21 items. `scoredBy`, `reviewerType` and `scoredAt` are `null`, and
every one of the five score fields is `null` on all 21 items.

All 13 titles have `titleOrigin: ui-label`. Zero identifier-derived titles.

Underlying capture: 377 graph nodes / 385 relationships,
`graphHash e265f12b59a25067f5e9f2159fadb5e4`, enriched claim-set hash `83e59325e4dfdbdcb922efca659483bd`.

Runtime: 7 accepted, 5 refused by rule, 0 refused by integration, 0 contradictions.

## 4. Artifact fingerprints

| file                            | sha256                                                             |
| ------------------------------- | ------------------------------------------------------------------ |
| `human-review-round-8.json`     | `9cc46ef5342e995e072bfb761b748c592878e5d0bbf88c1db1223d9890f522e2` |
| `human-review-round-8.md`       | `bb718a1d6bea6d463a026ec8c47686f1b1f4bde926621e1939a934423d1f849e` |
| `human-review-round-8.key.json` | `a35caf47d91cfaf268f90a98c49acfd0feb601c8624d079f8471de8b23b4eae7` |
| `runtime-evidence-v1.json`      | `30c90788439ec402383e714e425f764b862ae7cce9200bc88772f3cb3aff9bae` |
| `round-2-product-model.json`    | `bc7d05cba30687c055c1e79ae39d5ecb4671566b8e0762e664ca10a4c8924e6e` |
| `dataset-v1.json`               | `b029110218b35a2c9922225f3a31d48521983c35573961bbb1105cc04f9da352` |
| `guidance-round-7-vs-8.json`    | `2f954845fae40a0dacb3e7e5ce2df8e040b8c6ef2a238c92021df7fe0868898a` |
| `guidance-round-7-vs-8.md`      | `c9ec974baedcc82a96f714d954e5c7011ab5416de8a26dfc27e4743c9e9bcb8e` |

Regenerating the package is byte-identical, and `emit-evidence` still re-earns the runtime record
rather than rebasing it. 1211 tests and 25 gates pass.

## 5. On accepting scores

A scored package is only admissible if its 21 product outputs match the issued ones above exactly.
The scores are the reviewer's; the outputs are not theirs to change, and a package whose outputs have
drifted is scoring a different experiment.

---

## Addendum — superseded 2026-08-28

The issued package carries a **RUNTIME_REVIEW_FACT_ATTRIBUTION_DEFECT**: seven runtime-derived
entries in `knownSupportedFacts` across five items misdescribe the interaction that produced them,
two of them untruthfully. See
[the audit](round-8-runtime-fact-attribution-audit.md).

The baseline in §3 above is **unaffected** — the defect is in the evidence column of the review
instrument, not in the product. ProductClaims, purposes, questions, task actions, titles and all
twenty-one product outputs are unchanged, and the enriched claim-set hash is byte-identical.

Scoring moves to `human-review-round-8-r1`. The original stays on disk as the artefact that was
issued; `human-review-round-8.json` is still `9cc46ef5…`.

| file                               | sha256                                                             |
| ---------------------------------- | ------------------------------------------------------------------ |
| `human-review-round-8-r1.json`     | `686284688e58c99958edc5e16c6ed3a0be7714d35410b656fcccd31d3fc2fa27` |
| `human-review-round-8-r1.md`       | `2dcd6bbd810ec78035ab27a069b7b8365d090a37d778dc05b4b37d89c7a2c0d9` |
| `human-review-round-8-r1.key.json` | `618e3ba30a6bfe433760ab3048140e4138ce1d080a12dd6981d689482cd49a35` |

`runtime-evidence-v1.json` is now `ee407adf7289aec69b8ac848eda5eb45ff6ec8e7f3cef4f85047311bebb0f84c`
— it gained `actionKind` and `actionTarget`, which no verification rule reads and which leave every
`evidenceHash` unchanged.
