# Round 8 — Runtime Review Fact Attribution Audit

The issued Round 8 package carries a defect in the **review instrument**, not in the product.
Three of its ninety-three checkable facts describe interactions that did not happen. The package has
been superseded by a corrected revision; the original is preserved byte-for-byte as the artefact that
was actually issued, and the provisional external scores are **not** imported.

## 1. Root cause

**The evidence record never recorded what was done.**

A `RuntimeCapabilityRecord` persisted the _capability_ (`reveal`, `open`, `filter`), the subject, the
effects, the rule and the trace id — and not the interaction's `action.kind` or `action.target`. So
the review-fact renderer, asked to write a sentence about an interaction, had no interaction to read.
It hard-coded three things instead:

| clause         | should come from         | actually came from                                      |
| -------------- | ------------------------ | ------------------------------------------------------- |
| the verb       | `trace.action.kind`      | a literal `"Typing into"` on every `COLLECTION_CHANGED` |
| the direction  | `before` vs `after`      | a literal `"reduced"` on every count                    |
| the collection | the container's identity | any container carrying a semantic id                    |

A fourth error followed from the second: `"from 1 items to 2"`.

This is the same failure shape as Closed Loop #10's `select` rule and its `MECHANISM_ACTIONS`
divergence — a value that ought to be _read_ was instead _assumed_, and the assumption was invisible
because it produced fluent English.

## 2. Affected features

Seven features carry runtime facts. **Five** were rendered wrongly.

| feature                | item | trace            | true `action.kind` | true target            | verdict                                           |
| ---------------------- | ---- | ---------------- | ------------------ | ---------------------- | ------------------------------------------------- |
| `settings.rotate-key`  | R05  | `rotate`         | click              | `settings.rotate-key`  | **wrong verb, wrong direction, false collection** |
| `clients.create`       | R14  | `open-create`    | click              | `clients.create`       | **wrong verb, wrong direction, false collection** |
| `clients.search`       | R10  | `filter-clients` | type               | `clients.search`       | **wrong verb on one fact**                        |
| `settings.form`        | R13  | `save-settings`  | submit             | `settings.form`        | **wrong verb**                                    |
| `nav.clients`          | R21  | `nav-clients`    | click              | `nav.clients`          | **target not named**                              |
| `dashboard.new-client` | R16  | `dashboard-new`  | click              | `dashboard.new-client` | **target not named**                              |
| `client-detail.rename` | R09  | `rename`         | click              | `client-detail.rename` | correct                                           |

## 3. Every incorrect fact

**Withdrawn as untrue:**

- R05 — _"Typing into the control labelled "Rotate API key" reduced a visible collection on the
  screen from 1 items to 2."_ The interaction was a **click**; the count **rose**; the "collection"
  was `settings.danger-zone`, a `<section>` that gained a child because a `<code>` element was
  revealed.
- R14 — _"Typing into the control labelled "New client" reduced a visible collection on the screen
  from 6 items to 7."_ A **click**; the count **rose**; the "collection" was `clients`, a
  `<section>` that gained a child because the create dialog opened.

**Corrected:**

| item | was                                                                          | now                                                                                                                     |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| R10  | Typing into one control … _reduced a visible collection … from 5 items to 2_ | Typing into an unnamed text input on this screen reduced the number of items in a table on the screen from 5 items to 2 |
| R10  | _**Activating**_ one control … sent a GET request to /api/clients            | _**Typing into**_ an unnamed text input on this screen sent a GET request to /api/clients                               |
| R13  | _**Activating**_ one control … sent a PUT request to /api/settings           | _**Submitting**_ an unnamed form on this screen sent a PUT request to /api/settings                                     |
| R16  | Activating _**this control**_ moved from / to /clients                       | Activating _**the control labelled "New client"**_ moved the screen from / to /clients                                  |
| R21  | Activating _**this control**_ moved from /settings to /clients               | Activating _**the control labelled "Clients"**_ moved the screen from /settings to /clients                             |

Seven facts withdrawn, five issued in their place.

## 4. Actual interaction and effect mapping

Each record is **one** interaction — one before-snapshot, one action, one after-snapshot — so no
effect was attached to the wrong trace and no narrative was assembled across interactions. The
attribution error was entirely in how the single interaction was _described_.

```
rotate        click  settings.rotate-key  -> COLLECTION_CHANGED settings.danger-zone 1->2   [<section>, not a collection]
                                          -> ELEMENT_APPEARED   settings.new-key (code)
                                          -> NETWORK_REQUEST    POST /api/settings/api-key/rotate 2xx

open-create   click  clients.create       -> COLLECTION_CHANGED clients 6->7                [<section>, not a collection]
                                          -> ELEMENT_APPEARED   x8 (dialog, form, fields, backdrop)
                                          -> REGION_APPEARED    dialog, form, contentinfo

filter-clients type  clients.search       -> COLLECTION_CHANGED clients.table 5->2          [<table>, a real collection]
                                          -> COLLECTION_CHANGED clients.table.row 5->2      [<tr>, the members themselves]
                                          -> VALUE_CHANGED      clients.search
                                          -> NETWORK_REQUEST    GET /api/clients 2xx
```

The specification's expectation for `clients.create` — that `6 → 7` came from a _Create client_
submission — is **not** what happened. No submission occurred in that trace. The count rose because
the dialog became a seventh child of the page section. Inspecting rather than assuming is what the
instruction asked for, and the assumption would have been wrong.

`clients.search` is confirmed as the positive control: typing, into a genuinely unnamed input,
narrowing a genuine `<table>` — one causal trace, correctly rendered, retained.

## 5–7. Blast radius

| subsystem                           | affected | evidence                                                                                                                                                   |
| ----------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime **capability verification** | **No**   | No rule reads the rendered sentences. `filter` rejected the dialog case via `NOT_AN_INPUT_CHANGE`; `reveal` and `open` never consume `COLLECTION_CHANGED`. |
| **ProductModel / ProductClaims**    | **No**   | Enriched claim-set hash `83e59325e4dfdbdcb922efca659483bd` is byte-identical before and after. 113 claims, 7 behavioural, unchanged.                       |
| **productOutput**                   | **No**   | All 21 outputs compared field-by-field against the issued package: zero differences.                                                                       |
| Review **instrument**               | **Yes**  | 7 facts across 5 items.                                                                                                                                    |

Adding `actionKind` and `actionTarget` changed no verification: they are recording, and each record's
`evidenceHash` — computed over `{before, after, effects}` — is unchanged.

## 8. A runtime-evidence defect, reported and not fixed

`COLLECTION_CHANGED` fires for **any** container carrying a semantic id, including page `<section>`s.
A DOM child count is not a product collection.

This is currently harmless for `filter`, which is protected incidentally by its `NOT_AN_INPUT_CHANGE`
guard. It is **not** harmless for `select`, which Closed Loop #10 tightened to require
`COLLECTION_CHANGED` with no action-kind guard. Demonstrated against the real `clients.create` trace:

```
select   -> verified   "Activating element:clients.create changed the selected state
                        within a collection, with no navigation."
filter   -> rejected   (NOT_AN_INPUT_CHANGE)
```

**Clicking a button that opens a dialog verifies as a selection.** No record exercises this today —
`invoices.list.open` is refused earlier by `NAVIGATION_OCCURRED` — so no claim is affected and no
issued artefact is wrong because of it. Per the instruction, it is reported and **left unchanged**:
fixing it means changing capability semantics, which this instrument-fix loop may not do.

The review-fact renderer consumes the distinction the _graph_ already makes — `clients.table` is a
`<table>`, `clients` and `settings.danger-zone` are `<section>`s — so the instrument is correct even
though the effect vocabulary underneath it is still too broad.

## 9. The corrected revision

`human-review-round-8-r1.{json,md,key.json}`, built by **reading the issued package** and
substituting only its runtime sentences, so identity is structural rather than checked afterwards.
Verified equal: review ids, feature ids, ordering, `userContext`, `productOutput`, `factsNote`,
`gateVersion`, `itemCount`, `instructions`, `rubric`, seed `20260901`, and the entire hidden key.

The original remains on disk unmodified (`9cc46ef5…`), and `build-human-review-8.mjs` is deliberately
**not** repaired — it is the builder that produced what was issued, and its `--check` is what proves
so. Correcting it would let a gate regenerate an issued package into something no reviewer saw.

## 10. Scores

The external Round 8 scores are **provisional and not imported**. They were produced against facts
that misdescribed five items, and two of those facts were untrue. Nothing enters benchmark history
until the corrected revision is rescored.

## 11. Gates

`test:runtime-review-fact-attribution` walks every fact back through effect → trace →
`action.kind`/`action.target` → graph node → user-visible name, and constructs seven probes it must
catch: a click never reads as typing; typing into a list may; a submit is neither; the trace target
beats any other labelled control; an unnamed target stays unnamed; a panel gaining a child is not a
collection; and a record that cannot say what was done supports no sentence at all.

Run against the **original** package it fails with eleven findings — every defect above. A gate that
cannot fail is not a gate, so it was made to fail before being trusted.

`test:runtime-review-revision-integrity` re-derives the revision and requires it byte-identical.
26 gates and 1211 tests pass; `pnpm verify` green; tree clean.
