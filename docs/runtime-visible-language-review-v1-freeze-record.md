# Runtime Visible Language Review V1 — freeze record

Closed Loop #18 is complete and its evidence is frozen at commit `f9e97a6`.

Everything below is checked by `pnpm test:runtime-language-freeze`. A changed hash is not
automatically wrong; it is a statement that something moved during a review round, which must be a
deliberate act with a reason.

## The review

|                           |                                              |
| ------------------------- | -------------------------------------------- |
| package                   | `runtime-visible-language-review-v1`         |
| gate                      | `DEVELOPMENT_RUNTIME_LANGUAGE_REVIEW`        |
| reviewerType              | `non_human_independent`                      |
| items                     | 7 (RV01–RV06 plus RV01b), every score `null` |
| forms per item            | 3, plus `NEITHER` as an answer               |
| `FORMAL_HUMAN_VALIDATION` | `DEFERRED_UNTIL_PRE_RELEASE`, unattempted    |
| external model calls      | 0                                            |

## The primary question

**Does transient runtime-visible language make guidance more natural or useful than geometry-only
contextual language?**

More specific wording is not assumed to be better. The previous round scored the geometry-only
sentence **1.00/3** for helpfulness and found the useful contextual output **substantially redundant
with deterministic evidence** — so the outcome this instrument is most careful to leave available is
that neither sentence was worth having.

## Three forms, one statement

`clients.search`, from the same frozen build:

| form                       | what the user reads                                                               |
| -------------------------- | --------------------------------------------------------------------------------- |
| `BASE`                     | Lets you filter clients.                                                          |
| `GEOMETRY`                 | Lets you filter clients. _On this screen, it is directly above the list._         |
| `RUNTIME_VISIBLE_LANGUAGE` | Lets you filter clients. _Use the field showing "Search clients" above the list._ |

`preferredForm` accepts **BASE · GEOMETRY · RUNTIME_VISIBLE_LANGUAGE · NEITHER**, and is `null`.

`BASE` is not a fourth capture. The guide renders the contextual sentence as its own element, so
`BASE` is the captured answer with that exact substring removed — arithmetic on frozen bytes, the
derivation Closed Loop #17's freeze established. The builder refuses any item whose sentence does not
appear in its answer exactly once.

### The two captured forms are one verified statement

Discovered while deriving the receipts, by the derivation refusing to reconcile: **RV01's
geometry-only capture carries the same receipt id as its language capture** (`ctx_aruenp`). The
engine builds and verifies one statement — including the placeholder, which was on screen either way
— and the sentence form is a rendering choice made afterwards.

That is the strongest thing that could be true for this comparison. A reviewer preferring one wording
is choosing between two phrasings of a single verified fact, not between derivations that checked
different things.

## Evidence, byte for byte

| file                             | sha256             |
| -------------------------------- | ------------------ |
| `runtime-language-evidence.json` | `1697a8309e9d63fa` |
| `contextual-receipts.json`       | `5168947d2903ffe0` |
| `runtime-language.ts`            | `0d55f96f3d84cafa` |
| `contextual.ts`                  | `4e8c595fa4925c49` |
| 13 screenshots, as one set       | `d71459ca3c507c12` |

The last two are the authority rules — the source taxonomy and the descriptor table. They are pinned
because changing them mid-review would change what a reviewer is scoring without touching a single
artifact.

**Thirteen screenshots, not fourteen.** RV01b has only a language capture, because that scene _is_
the transition. RV03's two files are **byte-identical**, and that is the correct result rather than a
defect: the rotate-key button carries no placeholder, so both forms render the same sentence. Earlier
rounds treated identical screenshots as a failure; here it is the evidence that a scene with nothing
to quote gains nothing from being allowed to quote.

## The sentences

| scene | `RUNTIME_VISIBLE_LANGUAGE`                             | `GEOMETRY`                                     |
| ----- | ------------------------------------------------------ | ---------------------------------------------- |
| RV01  | Use the field showing "Search clients" above the list. | On this screen, it is directly above the list. |
| RV01b | On this screen, it is directly above the list.         | (same)                                         |
| RV02  | — none —                                               | — none —                                       |
| RV03  | On this screen, it is directly below the setting list. | (same)                                         |
| RV04  | — none —                                               | — none —                                       |
| RV05  | — none —                                               | — none —                                       |
| RV06  | Use the field showing "Search clients" above the list. | On this screen, it is directly above the list. |

Four scenes carry a sentence; three carry none, and their three forms are marked identical so a
reviewer does not hunt for a difference that is not there. Silence is still scored.

## Receipts

Four, one per statement, each recording target, source kind, text, freshness, route, privacy, and
what proved the geometry and the region phrase.

The capture stored only receipt _ids_, and recapturing to add the rest was not available — the
screenshots carry a clock, so any re-run changes the bytes a review is scored against. So the
receipts were **re-derived and checked**: a receipt id is a digest over the statement that produced
it, and every derived receipt reproduces the id the browser recorded.

That is only as strong as the digest, which is a 32-bit non-cryptographic hash and is **not
collision-resistant in general**. So uniqueness is checked rather than assumed: for each receipt the
builder searches every statement this fixture could realistically have produced — 17 semantic ids as
target and as region, 5 relations, 5 source kinds, 60 snapshot counts, about 4.3 million combinations
— and requires exactly one to match. Exactly one does, for all four. A receipt shared by two
realisable statements would pin nothing, and `test:runtime-language-freeze` fails if that ever
becomes true.

Within this evidence the id therefore identifies the statement. It is not a general guarantee, and
calling the match a proof without the search would have been the overclaim.

| scene | receipt       | source        | text             | privacy |
| ----- | ------------- | ------------- | ---------------- | ------- |
| RV01  | `ctx_aruenp`  | `PLACEHOLDER` | "Search clients" | SAFE    |
| RV01b | `ctx_22eb6j`  | `NONE`        | —                | SAFE    |
| RV03  | `ctx_1cfjs8r` | `NONE`        | —                | SAFE    |
| RV06  | `ctx_aruenp`  | `PLACEHOLDER` | "Search clients" | SAFE    |

Receipt correctness is **not scored as usefulness**. It is there so a reviewer can tell a checked
sentence from a confident one.

They live in `contextualReceipts`, a **sibling of the items**, and each item carries only a
`receiptRef`. The first draft of this package embedded the whole receipt inside each scored item —
the exact mistake Closed Loop #17's audit named, where a reviewer reading `HOST_UI` and
`PROVED_BY_GEOMETRY` beside an empty score box has the engineering answer sitting inside the
question. The freeze gate now fails if a verdict reappears in an item.

### A limitation the receipts would otherwise flatter

The host builds its snapshot id from the route and the number of elements _registered through React_.
The benchmark application registers none — it marks its markup with `data-guide` and lets the registry
read the DOM, which is how most applications will adopt this — so **the id is constant per route and
the snapshot clause of freshness can never fail there**.

The freshness RV01b demonstrates is real and comes from the other three conditions: the placeholder
stopped being painted, so the host stopped reporting it. But `freshness: CURRENT_SNAPSHOT` in these
receipts rests on a comparison with nothing to compare, and saying otherwise would flatter the
evidence.

## Behaviour preserved

- **RV01b** — the placeholder is quoted before typing and gone after it. Browsers keep the attribute
  and stop painting it; the guide falls back to geometry.
- **RV02 (mobile)** — the sheet covers the application, so nothing is said about where anything is.
  There is no false claim that the user can see the target.
- **RV03 (secret)** — the key is on screen and appears in no sentence, no receipt, no screenshot
  record and no artifact.
- **RV04** — INV-001 and INV-002 are plainly visible on client detail and still establish nothing.
- **RV05** — the invoices screen is unchanged. **That success is not attributable to runtime-visible
  language**: the concept is earned by `invoices.create-form.submit` and a verified `POST` claim, and
  the instance path is Closed Loop #16's.
- **RV06** — the hostile note is on screen and the guide's sentence is identical to the clean
  screen's, down to the receipt id.

## Privacy, and the historical disclosure

No secret appears in any sentence, receipt, screenshot or artifact of this round — and two of those
were only made true by this freeze.

An adversarial audit of the first draft found both. The **RV03 screenshots displayed the fixture key
in plain pixels** while the artifact asserted no secret was present: the textual records had been
masked at capture time and the image had not. And the **historical disclosure quoted the key
verbatim** in the same object that claimed the artifact held none — with the freeze gate configured
to scrub that exact string before scanning, so the one check watching for a leak was arranged to miss
the only leak there.

Both are fixed. The key's region in `RV03-language.png` and `RV03-geometry.png` is painted out with a
visible `[secret redacted]` label, recorded in the evidence record with the region, the tool and the
hash on either side, and verified by the freeze gate. The disclosure now names the artifact rather
than the value, and the gate scrubs nothing.

Everything the RV03 scene is evidence for survives: a screen showing a secret, and a guide that did
not repeat it. What was removed was never evidence of anything.

Closed Loop #17's frozen artifact is a different matter and is disclosed rather than corrected: its
capture stored `document.body.innerText` verbatim, so `visual-evidence.json` contains the fixture key
`sk_live_fixture_0000`. The guide never said it and the provider pack never carried it — the
redaction gate scanned the pack, not the record. **The frozen artifact is not altered**, because a
review is a promise about the bytes somebody scored. The finding lives in that review's freeze record
and is fixed forward here.

## What the adversarial audit changed

The freeze was audited by agents whose job was to defeat it. Twelve enumerated tamper cases all
failed correctly. Everything below survived verification and is now closed:

| finding                                                                                                                                  | what changed                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **the RV03 screenshots showed the key in plain pixels** while the artifact said no secret was present                                    | the region is painted out and the redaction recorded       |
| **the historical disclosure quoted the key**, in the same object claiming none — and the gate scrubbed that exact string before scanning | the disclosure names the artifact; the gate scrubs nothing |
| the digest pins **5 statement fields** and the receipts presented **14** as proved                                                       | `proved` is grouped by how each field is known             |
| `itemsWithARuntimeDescriptor: 4` when only **2** items quote runtime text                                                                | counted separately, and the wider count renamed            |
| receipts sat **inside** each scored item — Closed Loop #17's mistake repeated                                                            | moved to a sibling; the gate fails if one reappears        |
| the instrument digest **blanks** `scoredBy`, `scoredAt`, `questionAnswers` and comments, so a pre-answered package would pass            | those fields are null-checked directly                     |
| **BASE is not renderable** by any shipped build and the package did not say so                                                           | stated, with what preferring it would mean                 |
| RV03's two captured forms are **identical** yet offered as a choice                                                                      | `identicalPairs` says which forms are the same words       |
| `capture-immutability`'s frozen list **omitted this loop's own directory**                                                               | added                                                      |
| the **query context** was unpinned — a field could appear mid-review                                                                     | pinned as a field set                                      |
| **only `clients.search`** had its title pinned; the rest of the product was free                                                         | all thirteen titles pinned as a set                        |
| **Round 8 R1** pinned its record but not the key or the markdown a human reads                                                           | all three pinned                                           |
| gates run against gitignored `dist` while the freeze pins `src`                                                                          | the shipped build's refusals are exercised directly        |
| the prior round's failing score was attached to `GEOMETRY` in four places                                                                | stated once, with a direction warning                      |

One correction of my own reasoning came out of it. The **uniqueness of a receipt id** was claimed as
proof; the digest is 32-bit and not collision-resistant, so it is now _checked_ — 31.7 million
statements this fixture could realistically produce are searched, and exactly one matches each
receipt. That makes the id a reliable pin on this evidence and not a general guarantee.

## Product pins

|                           |                                    |
| ------------------------- | ---------------------------------- |
| claim set hash            | `bb27c5db37b8a5578626bfa56ea71bc0` |
| whole-model hash          | `1461144d856e4118528565362ac9eae2` |
| ProductClaims             | 113                                |
| `clients.search` title    | **still absent**                   |
| `clients.search` nameable | **still false**                    |
| placeholder in the bundle | **no**                             |

The static refusal is pinned in three places, because this round is only meaningful while it holds:
the whole question is whether a placeholder may describe a control it is not allowed to name.

## CI and the artifact boundary

Unchanged. `capture:*` may create artifacts, `test:*` is read-only, and the CI workflow invokes the
gate runner without naming a gate or reaching a capture. No capture command was run during this
freeze — the receipts were derived, not recaptured.

## What the review chooses

After scoring, exactly one:

| option |                                                         |
| ------ | ------------------------------------------------------- |
| A      | Keep runtime-visible language as implemented            |
| B      | Prefer geometry-only contextual language                |
| C      | Prefer no contextual sentence; rely on Show me          |
| D      | Refine trusted runtime-visible-language authority       |
| E      | Controlled live VLM experiment                          |
| F      | Stop context-language work and move to Statewave memory |

`nextPhase` is `null`. It is not set here, and the scores that select it do not exist yet.
