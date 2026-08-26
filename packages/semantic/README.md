# @statewavedev/guide-semantic

Verified semantic enrichment for [Statewave Guide](https://github.com/smaramwbc/statewave-guide).

Turns a deterministic `ApplicationGraph` into a **Product Model** — features, workflows, claims —
without letting a model invent a fact.

> **Code determines what exists. AI may explain what verified facts mean.**

```bash
# The deterministic half. No provider, no key, no account.
npx @statewavedev/guide-semantic enrich .
```

```
Statewave Guide

Application graph loaded.

Semantic enrichment skipped:
No model provider configured.
```

That run exits **0**. Indexing and inspection never require AI, and a tool that failed here would
have made the optional half of this system mandatory.

## The pipeline

```
discover  →  pack  →  prompt  →  provider  →  schema  →  VERIFY  →  claims
                                                                      ↓
                                           feature  ←  render  ←  accepted only
```

| Stage      | Module                             | What it guarantees                                                             |
| ---------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| discover   | `candidates.ts`                    | A model never discovers a feature. Candidates come from graph roots, in code.  |
| pack       | `evidence-pack.ts`                 | Bounded, spine-first, sensitive source excluded, refusals attached.            |
| prompt     | `prompt.ts`                        | Trusted instruction and untrusted repository data stay structurally apart.     |
| provider   | `provider.ts`, `providers/mock.ts` | One vendor-neutral seam. No vendor name appears in `src`.                      |
| schema     | `@statewavedev/guide-shared`       | A response that is not the right shape never reaches the verifier.             |
| **verify** | `verifier.ts`, `registry.ts`       | Every factual assertion resolves against the verification matrix. No fallback. |
| render     | `render.ts`                        | Prose is composed from accepted claim assertions and nothing else.             |
| assemble   | `enrich.ts`, `product-file.ts`     | Deterministic `product.json`; refusals persisted, not dropped.                 |
| project    | `docs.ts`                          | Markdown derived from the model, never from a model response.                  |

```ts
import {
  createMockProvider,
  enrichApplicationGraph,
  writeProductModel,
  writeDocs,
} from '@statewavedev/guide-semantic';

const run = await enrichApplicationGraph({ graph, provider: createMockProvider() });

await writeProductModel(run.model, { root: '.' });
await writeDocs(run.model, { root: '.' });

console.log(run.rejected); // what the model tried to say that we would not let it
```

## What is checked, and what is only scanned

The unit of verification is the **assertion**. Everything a rule evaluates lives in
`{ subjectRef, action, route, permission, targets }`, and every dimension a rule names must hold.

| Field                                       | What happens to it                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------ |
| `subjectRef`                                | resolved exactly, and required to be anchored in **this** feature's pack |
| `targets`                                   | must exist, and must be in this feature's evidence                       |
| `action`                                    | matched against the matrix rule for its `(type, action)` pair            |
| `route` / `permission`                      | must be in the pack **and** be what the claim's own cited facts prove    |
| `claim.text`, `title`, `purpose`, questions | scanned for eleven watchlist words; never verified                       |

The last row is the honest limit of the design, and it is where the audits of this package keep
landing. No check here can decide whether "creating a client also creates the matching Salesforce
contact" is true. What the scan catches is the vocabulary a model reaches for when it fills a gap —
emails, syncs, bulk actions, spreadsheets, things that happen automatically — and a claim, title or
interpretation that reaches for one without backing is refused rather than printed.

## Three truth levels, never collapsed

| Status                  | Means                                                           | Strength           |
| ----------------------- | --------------------------------------------------------------- | ------------------ |
| `structurally_verified` | A factual assertion was checked against the graph and holds.    | The strong claim.  |
| `semantically_grounded` | A sentence points at evidence that exists. **Not** proven true. | Interpretation.    |
| `rejected`              | Refused. Persisted anyway, with its reason.                     | A visible refusal. |

`ProductFeature.confidence` covers **factual claims only**. A feature with three verified facts and
ten pleasant sentences scores 3/3, not 13/13 — the sentences are the part nobody checked.
`claimSummary` carries the full breakdown so nothing is averaged away, and `unsupportedActions`
counts assertions the matrix has no rule for separately, because "we could not check this" is not
"this is false".

## Rendering

`createDeterministicRenderer()` is the **default and the authoritative docs projection**. It composes
sentences from claim _assertions_ by template:

```
You can create a new client from the Clients screen. It is reached at /clients.
It requires the clients:create permission.
```

A renderer receives accepted structured claims and the feature's graph facts — no evidence pack, no
graph, no repository text, and none of the model's own prose: `description`, `title` and `questions`
are emptied before the draft is handed over. **It cannot reintroduce a rejected assertion because it
never sees one.** What it can still see is `ProductClaim.text` on the accepted claims, because a
claim is one object; the deterministic renderer never reads it, and never reads
`ClaimAssertion.subjectLabel` either — both are free text a model chose, and a label reading "the CSV
import module" would put an unverifiable capability into a sentence that otherwise came from a
verified `create` claim.

Nouns come from `subjectRef`, an identity the verifier resolved **inside this feature's own
evidence** — a subject that resolves to a real identity somewhere else in the graph is refused, so a
sentence here cannot borrow another feature's noun. The words in a rendered sentence are therefore
either the templates' or the application's own.

### There is no model-backed renderer, and that is deliberate

A second generation pass would produce nicer prose and would reopen exactly the hole this package
exists to close. Shipping one marked "experimental" would mean shipping the failure mode with a label
on it, so this package does not.

`ProseRenderer` is nonetheless an interface, because a consuming application may have a reason we do
not. Anything passed as `renderer` to `enrichApplicationGraph` is **experimental by definition**, and
a safe one has to hold three properties:

1. It **rephrases only** — it adds no workflow step, permission, route, effect or capability that is
   not already in an accepted claim. Its instruction must say so.
2. Its output is used as `description` text **only**. Routes, permissions, elements and workflow
   targets are facts and come from the graph.
3. It is not the default, and `ProseRenderer.name` records which renderer wrote a page.

`checkRenderedPropositions` exists to test the first.

## `checkRenderedPropositions` is a detector, not a proof

```ts
const { introduced, checked } = checkRenderedPropositions(prose, acceptedClaims);
```

It scans prose for a **fixed watchlist** of eleven capability and effect words — `email`, `notify`,
`sync`, `import`, `export`, `csv`, `excel`, `bulk`, `admin-only`, `automatically`, `external` — and
reports the ones no accepted claim supports.

Backing is only what was checked: a claim's `action`, `route`, `permission` and `subjectRef`, plus
any graph facts the caller passes as `evidenceLanguage` (an element's label, a route path). A
claim's own `text` and its `subjectLabel` are **not** backing — a sentence that licensed its own
vocabulary would make the detector report zero on every input, and `subjectLabel` is free text the
verifier never resolves.

Read the result in one direction only. **A hit is strong evidence of a problem; a clean run is weak
evidence of correctness.** Its value depends entirely on the watchlist, and a fabricated capability
phrased in words that are not on it passes silently. There is no version of this approach where that
stops being true: the space of sentences a model can write is not enumerable.

For the deterministic renderer the count is **0**, and that zero is meaningful — not because the
detector is thorough, but because the renderer emits templated text built from claim assertions and
has no path by which an unlisted word could arrive either.

`test/renderer-hallucination.test.ts` covers brief section 8 both ways: the deterministic renderer
introduces none of six fabrications, and a stub renderer that deliberately adds each one is caught.
One of the six — an invented "client type" — is caught by the effect verb it arrives with rather than
by the noun itself, which is the documented limit of the approach.

## `product.json`

The artefact. Markdown is a projection of it (ADR 0008), never the other way round.

- Fixed key order, every array sorted by id, optional keys omitted rather than written as `null`.
- `source.generatedAt` is the only non-deterministic field, and `productModelHash()` excludes it.
- Rejected claims are **in** the file. "What did the model try to say that we would not let it" is
  the single most useful signal the pipeline produces.
- A claim's `provenance` carries `graphHash`, `applicationVersion`, `commit` and
  `dependencyFingerprint`, so one claim can be superseded without discarding a whole feature.

### Incremental regeneration

A feature whose `dependencyFingerprint` matches its freshly built pack skips the **provider**, not
the verifier. Its stored claims are replayed through `verifyEnrichment` against today's graph and the
feature is reassembled from what survives, so a hand-edited `product.json` — or one written by an
older generator version, which is refused outright — cannot re-project itself into documentation
under "structurally verified" for ever:

```ts
const run = await enrichApplicationGraph({ graph, provider, previous });
run.reused; // feature ids that cost nothing this time
```

Reused claims keep their original `graphHash` and their original `generatedBy`. That claim really was
derived from that graph by that model, and rewriting either would erase the record of where the words
came from; only `dependencyFingerprint`, which is what a supersession decision reads, is refreshed.

The fingerprint is a hash of **the evidence document the model would be shown**, not of a chosen
subset of fields — so relabelling a button from "Create client" to "Archive client permanently"
makes the feature stale, which a hash over ids and provenance could not see.

## Documentation

`docs/index.md`, `docs/features/<id>.md`, `docs/workflows/<id>.md`.

Every page carries its source metadata — commit, graph hash, generator version, provider, model — in
front matter, so "which version of the application does this describe?" is answerable from the page.
`generatedAt` is left out on purpose: a page that changed on every run would drown a real change in
noise.

Verified facts and generated language sit under **different headings**, and the language section says
outright that nothing establishes it is true. Refused claims get their own table with reasons.

Generated Markdown is never hand-edited. It is regenerated, and it may be deleted at any time without
loss. Pruning removes only pages carrying our own front-matter marker — a team's own writing in the
same directory is never touched.

## CLI

```
statewave-guide-semantic <command> [directory] [options]

Commands
  enrich [directory]   Verify semantics over the application graph and write product.json
  docs   [directory]   Project Markdown from product.json

Options
  --out <dir>        Directory holding the graph and the model (default: .statewave-guide)
  --docs-dir <dir>   Directory Markdown is written to (default: docs)
  --provider <name>  Model provider. Only "mock" is built in.
                     Omit it to run provider-free: the graph is loaded and enrichment is skipped.
  --limit <n>        Maximum feature candidates to enrich
  --docs             After enriching, also project Markdown
  --json             Print product.json to stdout instead of writing it
  --silent           Suppress reports. Failures are still printed.
```

The only provider this binary can construct is the deterministic mock, because no vendor adapter
exists in this package by design. An application with real credentials passes its own
`SemanticModelProvider` to `enrichApplicationGraph`.

## Extending the matrix

`import`, `export`, `search` and `send` have **no built-in rule**, on purpose: no generic graph fact
proves an import, a POST endpoint is not one, and listing is not searching. A particular application
often can prove it, so it registers a verifier for the exact `(type, action)` pair it understands:

```ts
const registry = createClaimVerifierRegistry();
registry.register({
  type: 'capability',
  action: 'import',
  verify: ({ assertion, resolveTarget }) => ({
    satisfied: assertion.targets.some((id) => resolveTarget(id)?.id.includes('importClients')),
    evidence: assertion.targets,
    detail: 'importClients is this application’s import path.',
  }),
});

await enrichApplicationGraph({ graph, provider, registry });
```

Subject identity, target existence and target scope are settled **before** a registration is
consulted, and every id it names is re-checked against the pack. A `satisfied: true` with empty
`evidence` is refused: a verifier that upholds a claim without pointing at anything has not verified
it.

## What this cannot check

Stated plainly, because the difference between "verified" and "spot-checked" is the difference
between two very different guarantees:

- **Whether a sentence is true.** The unit of verification is the _assertion_ —
  `{ subjectRef, action, route, permission, targets }`. The sentence beside it is generated language
  and gets a _scan_, not a check: the eleven-word watchlist below, applied to `claim.text`, to the
  feature `title`, and to every interpretation. A claim whose wording reaches past its evidence is
  refused; a fabrication phrased in words the watchlist does not carry — "clients may be grouped into
  tiers" — is published. `test/prose-surface.test.ts` pins both halves of that, including the miss.
- **`import`, `export`, `search`, `send`** — nothing generic proves them. They fail closed and are
  counted apart. The list on the generated index page is read from the matrix, so it cannot drift.
- **Semantics behind a verb.** A `DELETE` endpoint proves a delete path exists, not that deleting
  archives rather than destroys. Business meaning, ordering, side effects and error behaviour are all
  outside the matrix.
- **Anything the indexer refused.** An unresolved API path is rejected as evidence, and a truncated
  pack is verified against a partial neighbourhood. `EnrichmentRun.warnings` says so and the CLI
  prints it under **Caveats**; `ProductModel` has no field for a warning, so nothing in
  `product.json` or in the Markdown carries one — read the terminal, or read `run.warnings`.
- **Prose in general.** See `checkRenderedPropositions` above, and ADR 0007, which leaves this open.

## License

Apache-2.0
