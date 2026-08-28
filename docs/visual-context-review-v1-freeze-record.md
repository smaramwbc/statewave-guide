# Visual Context Review V1 — freeze record

Closed Loop #17 is complete and its evidence is frozen at commit `64fd914`.

This is the statement of what a reviewer will be looking at, so that a later argument about what
was reviewed has an answer that does not depend on anybody's memory. Everything below is checked by
`pnpm test:visual-context-freeze`; a changed hash is not automatically wrong, but it is a statement
that something moved during a review round, and that must be a deliberate act with a reason.

## The review

|                           |                                           |
| ------------------------- | ----------------------------------------- |
| package                   | `visual-context-review-v1`                |
| gate                      | `DEVELOPMENT_VISUAL_CONTEXT_REVIEW`       |
| reviewerType              | `non_human_independent`                   |
| items                     | 8 (VC01–VC08), every score `null`         |
| `FORMAL_HUMAN_VALIDATION` | `DEFERRED_UNTIL_PRE_RELEASE`, unattempted |
| external model calls      | 0                                         |

No score has been assigned internally and none may be inferred. A `SUPPORTED` correlation, correct
geometry, a zero ProductModel delta, a resisted injection and a successful redaction are engineering
facts; they say the boundary held and they say nothing about whether anybody was helped.

## Evidence, byte for byte

| file                   | sha256             |
| ---------------------- | ------------------ |
| `visual-evidence.json` | `ee37f09f364da9d9` |
| `screenshots/V01.png`  | `4f90728a0984e10d` |
| `screenshots/V02.png`  | `02ed9b81c8642aad` |
| `screenshots/V03.png`  | `e9a5c455a30bad6b` |
| `screenshots/V04.png`  | `a18acd68b8326928` |
| `screenshots/V05.png`  | `d02c7576c27371b0` |
| `screenshots/V06.png`  | `a5524fc92c70aa01` |
| `screenshots/V07.png`  | `44c98a0728b9dfed` |
| `screenshots/V08.png`  | `f7f05b87ca1b4308` |
| `screenshots/V09.png`  | `4fa5cad2b42d686f` |
| `screenshots/V10.png`  | `9b8ae3ef452b01fc` |
| `visual-scenes.ts`     | `659500d97b876a13` |

Ten screenshots exactly. A review of ten scenes that finds eleven is reviewing something else, so the
count is pinned alongside the hashes.

`visual-scenes.ts` holds the recorded proposals. It is the one input that is pinned by hash rather
than by re-derivation, because everything downstream of it is derived _from_ it.

## Correlations, pinned by re-derivation

`visual-correlations.json` is not hash-pinned. It is rebuilt from the pinned fixture and the shipped
correlation function and compared byte-for-byte, which is stronger: a hash proves the file has not
changed, and re-derivation proves the file still says what the code says.

11 proposals: **1 `SUPPORTED`**, **6 `CONTRADICTED`**, **4 `UNRESOLVED`**, and exactly one eligible
for contextual presentation. Each verdict is pinned individually, so a failure names the proposal.

| proposal   | type                     | verdict        |
| ---------- | ------------------------ | -------------- |
| `V02-p1`   | `VISUAL_GROUP`           | `SUPPORTED`    |
| `V02-p2`   | `VISUAL_LABEL_CANDIDATE` | `UNRESOLVED`   |
| `V02-p3`   | `CONTROL_RELATION`       | `UNRESOLVED`   |
| `V03-p1`   | `COLLECTION_RELATION`    | `CONTRADICTED` |
| `V03-p2`   | `SCREEN_PURPOSE`         | `CONTRADICTED` |
| `V06-p1`   | `VISIBLE_STATE`          | `CONTRADICTED` |
| `V06-p2`   | `VISIBLE_STATE`          | `CONTRADICTED` |
| `V10-p1`   | `CONTROL_RELATION`       | `UNRESOLVED`   |
| `V10-p2`   | `SCREEN_PURPOSE`         | `CONTRADICTED` |
| `VX-guide` | `REGION_PURPOSE`         | `CONTRADICTED` |
| `OCC-p1`   | `VISIBLE_STATE`          | `UNRESOLVED`   |

The last two rows are the pair a reviewer has to be able to tell apart, so both are pinned in both
directions: `OCC-p1` must never become `CONTRADICTED`, and `V06-p1` must never stop being it.

## The sentences

The entire user-visible result of the loop is six strings, and they are pinned as text as well as
inside the file hashes — a hash failure says something moved, and this says which sentence.

| scene | location sentence                                      |
| ----- | ------------------------------------------------------ |
| V02   | On this screen, it is directly above the list.         |
| V05   | On this screen, it is directly below the setting list. |
| V07   | On this screen, it is directly above the list.         |
| V08   | On this screen, it is directly above the list.         |
| V09   | On this screen, it is directly above the list.         |
| V10   | On this screen, it is directly above the list.         |

Four scenes have no location and are pinned as having none, so one appearing is a failure rather
than an improvement.

V07 (dark), V08 (white-label) and V09 (phone) carry byte-identical answers to V02. If appearance
could change what is true, the visual layer would be authority wearing a costume.

## The pack a provider would be handed

Pinned as a field set rather than a source hash, so a comment may be improved and a field may not
appear or disappear without somebody deciding to:

```
route  snapshotId  viewport  screenshotHash  elements  regions
redactionManifest  guideRegion  occludedSemanticIds
```

11 regions masked across the ten scenes, exactly one of them classified `SECRET` — the rotated key on
the settings screen. A masker that never fires proves nothing, so the count and the classification
are both pinned.

## WITHOUT_VISUAL / WITH_VISUAL

Every item carries both, and the difference is exactly the string vision added.

The without-visual text is not re-run and not remembered. The guide renders the location as its own
element, so it is the captured answer with that substring removed — arithmetic on frozen bytes. The
builder refuses to emit an item whose location does not appear in its answer exactly once, because
subtraction is sound only while that holds.

Two of the eight are worth reading before scoring:

- **VC01** — `Lets you filter clients.Show me` becomes `Lets you filter clients.On this screen, it
is directly above the list.Show me`. The headline case.
- **VC04** — `Show me` becomes `On this screen, it is directly below the setting list.Show me`.
  Without the location this answer has no prose at all. Whether that makes the location valuable or
  makes the runtime-only answer impoverished is a judgement, and it is the reviewer's.

Deltas for ambiguity, ProductModel and runtime-instance eligibility are zero in every scenario, each
carrying the gate or test that establishes it rather than being asserted.

## The query contract

`test:query-contract-quality` already pinned the intent taxonomy and the safe-action union, both of
which exist as exported arrays. The **status union did not exist as one**, so nothing was checking
it — a seventh status could have appeared mid-review and no gate would have said anything.

It is now read out of the type declaration and compared: `ANSWERED`, `PARTIAL`, `AMBIGUOUS`,
`UNSUPPORTED`, `UNKNOWN`, `STALE_CONTEXT`. Reading the source rather than exporting a new array is
deliberate — a freeze is the wrong moment to add to a public API. The three context and response
fields the review's arithmetic depends on (`visualContext`, `elementBoxes`, `elementContainers`) are
pinned the same way.

## What an adversarial audit found

The first version of this freeze was audited by agents whose job was to defeat it. Seven independent
gaps survived verification, and every one of them is now closed:

| gap                                                                                                                                                         | closed by                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| the review **instrument** was unpinned — rubric, instructions and questions could be rewritten with both gates green                                        | a digest over the package with reviewer-owned fields nulled |
| **Interactive Review V2's record** was self-referential: fabricated step text reached the reviewer-facing package with all three of its gates passing       | the record and its screenshot set pinned by hash here       |
| the **ProductModel** pin covered only `enriched.claims`, so a feature title, a workflow and a permission all moved with the hash unchanged                  | a hash over the whole model, plus its three source files    |
| the **pack format** block read the already-hash-pinned artifact, so it could never fire independently                                                       | the field set read from the interface declarations          |
| the **status union** extractor matched only `SCREAMING_CASE`, so `'Throttled'` walked past a check whose docblock promised to catch it                      | any quoted member                                           |
| a `test:` script could write via a **spawned process**, a chained command whose guard belonged to another segment, a `./` prefix, or a **vitest test file** | the analyser follows all four                               |
| `frozenLocationsMentioned` claimed in its own comment to survive path concatenation, and did not                                                            | quotes and concatenation flattened before matching          |

Two of the fixes were themselves wrong first and were caught the same way: a loosened path matcher
accused eight innocent gates because `docs/product` ends in the word "product", and a broadened spawn
scan made `tree-clean.mjs` appear to run five builders named only in its doc comment — the
comment-stripping mistake this repository has now made four times.

Three legitimate guard shapes had to be understood rather than punished: `--check` turning writing
off, `--write` turning it on, and an environment variable turning it on inside a vitest test where a
flag would silently never fire. A fourth lives in a spawn table — `historical-artifact-integrity.mjs`
passes `--check` to the builders it runs — and a fifth is a parameterised runner whose default spec is
never reached because every command supplies one.

## Product pins

A visual review is only meaningful while the product it describes stands still.

|                               |                                    |
| ----------------------------- | ---------------------------------- |
| claim set hash                | `bb27c5db37b8a5578626bfa56ea71bc0` |
| whole-model hash              | `1461144d856e4118528565362ac9eae2` |
| ProductClaims                 | 113                                |
| — structurally verified       | 41                                 |
| — semantically grounded       | 61                                 |
| — behaviourally verified      | 7                                  |
| — rejected                    | 4                                  |
| claims citing visual evidence | 0                                  |
| Round 8 R1                    | `686284688e58c999…`                |

Unchanged since Closed Loop #11. Interactive Review V2, Interactive Review V1 and its two revisions,
the runtime instance experiment and Round 8 R1 are all still checked by their own existing gates, and
the frozen directories are now enumerated in one place.

## Capture immutability

Permanent rule, enforced by `pnpm test:capture-immutability`:

> `capture:*` commands may create and update artifacts. `test:*` commands must not.

Structurally, not by convention: no check may invoke a capture, and no check may reach code that
writes into a frozen location unless the write path is unreachable with that command's arguments.
All three guard shapes in use are understood — `--check` turning writing off in a builder that writes
by default, `--write` turning it on in a script that otherwise emits to a temporary directory, and an
environment variable turning it on inside a vitest test, where a flag would look like it worked and
silently never write.

The analysis follows script aliases, one import hop, `./` prefixes, per-segment guards in a chain,
and the test directory behind a vitest filter. Every one of those was a hole first, found by trying
to defeat the gate rather than by reasoning about it — including a matcher whose own comment claimed
more than it did, and a loosened version that accused eight innocent gates because `docs/product`
ends in the word "product".

It then confirms empirically that running the fast checks moves none of the 128 frozen files, because
a structural argument that has never been tested against reality is an argument.

**What it does not claim.** Static analysis of shell strings is not a proof and this is not a
sandbox; somebody determined to write from a check can still do it through a deeper import chain or a
dynamic path. The backstop is `test:tree-clean`, which notices any mutation whatsoever at the end of
a sweep. This gate exists to catch the shape of the mistake early, with a message naming the script,
rather than as a dirty tree with nothing to point at.

This rule exists because Closed Loop #17 broke it. Running the full sweep rewrote the frozen
Interactive Review V2 record, invalidated the visual review package by re-capturing the evidence it
cites, and dirtied the tree — three commands registered as `test:` that were captures. That is
Closed Loop #15's failure arriving by a different route.

CL17 was not recaptured to prove any of this. The frozen bytes are the ones the loop issued.

## Disclosed to the reviewer

Six things a reviewer could not find out by reading the package are stated in it, because leaving
them implicit would let a score rest on a misunderstanding:

- The location sentence is the **only user-facing string that does not pass through
  `verifyResponse`**. Titles, purposes, summaries, conditions and step text are all checked against
  compiled guidance and rejected if they do not match; the location is computed after that check and
  added afterwards. It is constrained by construction instead — a relation and a region phrase, no
  name — but it is not verified the way the sentences beside it are.
- The region phrase is **not geometry**. Half of each sentence rests on the ProductModel and on
  members the runtime observed.
- The ambiguity delta is **0 by construction and cannot be otherwise**, because it removes a
  substring that can never contain the marker it tests for. Question G has to be answered from the
  absence of any scenario where vision could have reduced ambiguity, not from that zero.
- The recorded fixture's scene ids **collide with the captured scene ids and do not mean the same
  thing** — `recorded:V06` is a clients screen, captured `V06` is client-detail. The package
  namespaces them.
- Four of ten captured scenes produced no location at all; two items therefore have an empty delta
  and are still to be scored.
- Every number in `objectiveMetrics` describes what the machinery did, not whether anyone was helped.

The engineering verdicts live in `correlationEvidence`, a **sibling of the items rather than a field
inside one**. A reviewer reading `status: SUPPORTED` beside an empty score box has the engineering
answer sitting inside the question — the separation Closed Loop #13.1 established, applied again
here after an audit found it had quietly been broken.

## Found later, and deliberately not fixed here

Closed Loop #18's capture, written against the same fixture, hit an assertion that revealed something
about this one: **`visual-evidence.json` contains `sk_live_fixture_0000` in scene V05's
`renderedText`.**

The guide never said it, and the pack a provider would have received carries none of it — the
redaction gate proved that and still does. What it could not see is that the capture also stored
`document.body.innerText` verbatim so a reviewer could confirm a secret was on screen, and the
faithful record of a screen displaying a key is a file containing a key.

Here it is a fixture constant, named `fixture` in the value itself. Pointed at a real application,
the same harness would have written a real credential into a committed file.

It is **not corrected in this artifact**, because the artifact is frozen and a review is a promise
about the bytes somebody scored. Closed Loop #18's capture masks secret shapes before they enter its
record, keeping only the fact that one was on screen. The rule going forward: a capture records that
a secret was displayed, never which.

## Not run

No live provider call has been made, here or anywhere in this repository. The command is documented
and refuses without two separate acts of consent:

```
STATEWAVE_VISION_API_KEY=… node scripts/visual-live-provider.mjs \
  --scene V03 --i-authorize-an-external-call
```

The next-phase decision happens only after the external review returns.

## What the review is being asked

| #   | question                                                                                |
| --- | --------------------------------------------------------------------------------------- |
| A   | Does the contextual location sentence materially help?                                  |
| B   | Does `clients.search` improve compared with runtime-only guidance?                      |
| C   | Are the visual refusals understandable to a user?                                       |
| D   | Does the client-detail refusal remain acceptable despite visually obvious invoice rows? |
| E   | Does occlusion handling avoid misleading conclusions?                                   |
| F   | Does visual grouping add useful context?                                                |
| G   | Does vision reduce ambiguity?                                                           |
| H   | Is any visual output redundant with geometry / accessibility / DOM data?                |

Each item names the questions it bears on, and `questionEvidence` names the items and fields that
bear on each question. Where a question turns on a measurement, the measurement is stated — question
G is unanswerable otherwise, since **the ambiguity delta is zero in all eight items** and a reviewer
made to infer that from eight item bodies would probably infer something else.

A measurement is not a verdict. Whether that zero means this design cannot reduce ambiguity, or that
this fixture never gave it the chance, is exactly what is being asked.

Weak scores are classified with exactly one dominant cause from an eleven-value list, and the
classification — not the score — is what selects the next phase.
