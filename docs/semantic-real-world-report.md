# Real-world semantic report

The fixture application is built to be hard, but it is still built by the people who wrote the
verifier. This report is the counterweight for the **semantic** half of the pipeline: candidate
discovery and evidence packing run against a production codebase that has never heard of Statewave
Guide, and the result is reported whether or not it flatters us.

It does not flatter us. The headline is one sentence: **on this application the semantic layer can
verify workflow steps and nothing else.** Every number below exists to explain why, and to say which
of the three causes is ours to fix.

> **Method.** The target repository was read **read-only**. No file was written into it, no
> `data-guide` identifier was added, nothing was modified, and its working tree was verified clean and
> byte-identical before and after the run. This document reports counts, shapes and anonymised
> distributions only. **No source, route path, permission string, component name or identifier from
> the target application is reproduced here.**

> **No model was called.** No provider credentials exist in this environment, so **no enrichment
> ran**. Where this report says what enrichment "would" cover, the figure comes from the deterministic
> half of the pipeline plus the package's stand-in provider, which derives claims mechanically from
> graph edges rather than writing anything. Those numbers are a **ceiling on what the verifier would
> accept**, not a prediction of what a model would say. See
> [Model behaviour](#what-this-report-cannot-tell-you) at the end.

## Target

|                              |                                                                           |
| ---------------------------- | ------------------------------------------------------------------------- |
| Application                  | An internal admin console (React + TypeScript + Vite, with a Node server) |
| Version / commit             | `1.2.0`, one commit, clean tree                                           |
| Files analysed               | 101 — 66 frontend, 27 backend, 8 shared                                   |
| Include patterns             | `src/**/*.{ts,tsx}`, `server/**/*.ts`, `api/**/*.ts`                      |
| `data-guide` identifiers     | **0** — the application does not use our convention                       |
| Relationship to this project | Sibling repository, unmodified                                            |

Zero guide identifiers is the point. It tests what the semantic layer extracts from an application
that has done nothing to accommodate it.

## The graph it had to work from

| Graph                 |                                                     |
| --------------------- | --------------------------------------------------- |
| Indexing time         | ~1.9 s                                              |
| Nodes / relationships | 1,104 / 1,289                                       |
| Graph hash (prefix)   | `829036ccdaad`, identical across repeated runs      |
| Components            | 152                                                 |
| Routes                | 11 — all detected from JSX, 2 parameterised         |
| Functions             | 556                                                 |
| API endpoints         | 18 — 7 GET, 10 POST, 1 PATCH; **all frontend-only** |
| Elements              | **0**                                               |
| Permissions           | **0**                                               |
| Schemas               | **0**                                               |

Relationship shapes, which is what candidate discovery actually walks:

| Shape                              | Count |
| ---------------------------------- | ----- |
| `function -calls-> function`       | 529   |
| `component -renders-> component`   | 351   |
| `component -uses_hook-> hook`      | 203   |
| `component -calls-> function`      | 164   |
| `function -calls_api-> api`        | 20    |
| `component -navigates_to-> route`  | 7     |
| `function -opens-> component`      | 3     |
| `component -submits_to-> function` | 2     |
| `component -calls_api-> api`       | 1     |
| `function -uses_service-> service` | 1     |
| `route -*-> anything`              | **0** |

That last row is the one that decides this report.

## Candidate discovery

Discovery is deterministic code and needs no provider, so this part of the pipeline ran in full.

**12 candidates**, from 1,104 nodes.

| Discovery reason | Candidates | Why                                                                      |
| ---------------- | ---------- | ------------------------------------------------------------------------ |
| `route`          | 11         | Every route became a feature, because nothing else spoke for it          |
| `form`           | 1          | One component submits to a handler no other candidate covered            |
| `guide-element`  | **0**      | There are no element nodes to root a feature on                          |
| `api-endpoint`   | **0**      | An endpoint must be observed on **both** tiers; all 18 are frontend-only |
| `permission`     | **0**      | There are no `requires_permission` edges                                 |

| Id origin     | Candidates |
| ------------- | ---------- |
| `semantic-id` | **0**      |
| `derived`     | 12         |

Every identifier here is provisional. Nothing in this application named a feature, so nothing in the
output can claim a name the application would recognise — and a derived id moves the moment the
underlying node does. That is the cost of no annotation, and it is charged before a model is ever
involved.

## Evidence packs

One pack per candidate, built with the default limits (depth 4, 40 nodes, 60 relationships).

| Pack size     | min | median | p90 | max |
| ------------- | --- | ------ | --- | --- |
| Nodes         | 1   | 2      | 40  | 40  |
| Relationships | 0   | 1      | 60  | 60  |

| Pack contents                       | Packs (of 12) |
| ----------------------------------- | ------------- |
| Truncated by a limit                | 5             |
| Carry at least one route            | 11            |
| Contain at least one `api` node     | **1**         |
| Contain at least one `element` node | **0**         |
| Contain at least one permission     | **0**         |

The distribution is bimodal and both halves are bad in different ways. Five packs hit the cap and were
truncated; six contain one node and no relationships at all, and a seventh has two nodes and one
relationship. There is almost nothing in between.

**The behaviour chain is the number that matters.** A pack is a _neighbourhood_; the subject of a
feature's claims is the chain that runs forward from its roots along the behaviour spine. Measured
across all 12 candidates:

| Behaviour chain          | Candidates |
| ------------------------ | ---------- |
| Exactly one node         | 11         |
| Four nodes               | 1          |
| Reaching an API endpoint | **0**      |

Zero. Not "few" — none. Every capability rule in the verification matrix requires a `calls_api` or
`submits_to` path from the subject to a cited endpoint, and no candidate in this application has one.

## Refusals reaching the packs

The graph's own refusals travel into the prompt so a model is told what is unknowable rather than left
to guess.

| Refusals                            |         |
| ----------------------------------- | ------- |
| Packs carrying at least one refusal | 5 of 12 |
| Refusal sentences across all packs  | 146     |
| Packs that hit the 40-refusal cap   | 3       |
| Median per pack                     | 0       |

| Diagnostic reaching a pack | Occurrences |
| -------------------------- | ----------- |
| `UNRESOLVED_API_PATH`      | 80          |
| `UNRESOLVED_DYNAMIC_CALL`  | 56          |
| `UNRESOLVED_DYNAMIC_ROUTE` | 10          |

This is the part that worked. The dominant HTTP shape in this codebase is a URL-builder call the
indexer refuses to resolve, and every one of those refusals arrives in the evidence as an explicit
"this is unknown" sentence rather than as an absence a model would fill in. The packs that carry the
most refusals are exactly the packs a model would otherwise be most tempted to invent around.

The cap is doing real work too: three packs hit 40 refusals, meaning some were dropped. A pack that
truncates its _refusals_ is under-reporting what it does not know, which is worth knowing about even
though it is the safe direction to fail in.

## What enrichment would cover

No model ran. The figures here come from the deterministic stand-in provider, which proposes only
claims it can read directly off edges in the pack — so what it gets verified is an upper bound on
what the built-in matrix could uphold for this application, and a lower bound on nothing at all.

| Outcome                          |                                    |
| -------------------------------- | ---------------------------------- |
| Features accepted                | 12 of 12                           |
| Claims produced                  | 35                                 |
| Structurally verified (facts)    | **11**                             |
| Semantically grounded (language) | 24                                 |
| Rejected                         | 0                                  |
| Evidence coverage                | 100%                               |
| Warnings                         | 5 — all the pack-truncation notice |

| Verified facts, by claim type | Count |
| ----------------------------- | ----- |
| `workflow_step`               | 11    |
| `capability`                  | **0** |
| `navigation`                  | **0** |
| `permission`                  | **0** |
| `constraint`                  | **0** |

Eleven verified facts, all of one kind, one per feature. Every one of those eleven workflows contains
**exactly one step** — which is to say it is not a workflow, it is a pointer at a screen. One feature
finished with a confidence of 0: it produced no factual claim at all, and survived on interpretation
alone.

That is the honest state of semantic coverage on this application:

- **A user could be told where something is.** Eleven route-shaped features, each addressable.
- **A user could not be told what it does.** Not one capability, permission, route transition or
  constraint can be structurally verified, so nothing may be presented as fact.
- **Interpretation would still be generated** — purposes and phrasings — and would be labelled
  `semantically_grounded`, never as truth. On this application that label carries almost the whole
  output, which is precisely the situation the three-level status vocabulary exists for.

Nothing here was rejected, and that number is not good news. Zero rejections with zero capabilities
means the stand-in never _tried_ to claim one; a real model, handed the same evidence and the words
this codebase contains, would try. What the adversarial suite in `packages/semantic/test/` and
`scripts/semantic-quality.mjs` measure is what happens when it does.

## The three causes, measured

### 1. No addressable elements — and this one is not a defect

With no `data-guide` attributes there are no `element` nodes, therefore no `contains` or `invokes`
edges, therefore no feature rooted at something a user can be pointed at. Every candidate is
`derived`.

This is the documented trade, not a gap: the behaviour graph works without annotation, the
addressability layer does not. It is stated here because it explains why 11 of 12 candidates are
routes, and because the fix belongs to the target application and was deliberately **not** applied —
adding identifiers to a repository we were reading read-only would have made the measurement
worthless.

### 2. The route → component join did not occur, and this one is ours

| Route linkage                                             |       |
| --------------------------------------------------------- | ----- |
| Routes detected                                           | 11    |
| Routes carrying a component name on the node              | 11    |
| Route names that resolve to a component node in the graph | **0** |
| `route -renders-> component` edges                        | **0** |

The indexer knows the name of the component each route renders and recorded it on the route node. It
could not turn any of those names into a node id, so it created no edge — correctly, under
"no evidence, no relationship". But the consequence lands squarely on the semantic layer: with no
outgoing edge, a route-rooted feature's subject is the route and nothing else, and every rule in the
matrix that needs a path from the subject fails before it starts.

**This is the highest-value fix for this application.** 11 of 152 components reach an API endpoint
within four hops. Those eleven are where the verifiable capabilities are, and today no feature can
reach them.

### 3. All 18 endpoints are frontend-only

No endpoint was observed on both tiers, so none is eligible to become a candidate in its own right,
and the `api-endpoint` discovery pass contributed nothing. This is the same finding the indexing
report already recorded — the server dispatches with manual `node:http` routing rather than a
recognised framework — reappearing one layer up. The semantic consequence is worth stating separately:
a frontend-only endpoint still supports a `create` claim if a chain reaches it, so this cause is
subordinate to cause 2. Fixing the route join matters more than fixing the backend join.

## What this changes

1. **Route → component resolution is the priority.** It is a single missing edge type and it is
   currently the difference between eleven one-step workflows and eleven features with real behaviour
   chains. Nothing else in this report moves as many numbers.
2. **The pack limits deserve a second look for wide neighbourhoods.** Five of twelve packs truncated,
   and three truncated their refusal lists. Truncation is flagged in the pack, carried into a warning
   and
   reported on the claim, so nothing is silent — but a pack that reaches the cap at depth 4 in an
   application this size suggests the cap, not the depth, is the binding constraint.
3. **A benchmark whose stand-in never lies proves nothing about lying.** This report measures reach;
   `scripts/semantic-quality.mjs` measures refusal. Neither substitutes for the other, and the second
   one only became meaningful once its provider was made adversarial on purpose.

## What this report cannot tell you

- **Model behaviour was not empirically measured.** No provider credentials were configured, no model
  was called, and no figure here describes how a language model behaves on this codebase. The
  hallucination question is untouched by this document.
- **One application, one team's habits.** The dominant patterns here — a URL-builder wrapper, manual
  backend dispatch, unresolvable route components — are this codebase's, and a second target would
  likely surface an entirely different set.
- **No ground truth.** Unlike the fixture, nothing states which features _should_ have been
  discovered. This report measures what the pipeline produced and what it declined; it cannot measure
  what it missed.
- **The author chose the target.** It was picked for being available, real and reasonably sized — not
  for being representative.
