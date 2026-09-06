# Statewave Guide

**Your app explains itself.**

Statewave Guide is an open-source framework for memory-powered, code-aware, interactive guidance
inside real applications:

```
Source Code
   ↓
Application Graph          deterministic, evidence-backed
   ↓
Product Model              claims a verifier accepted, nothing else
   ↓
Guide                      explain · navigate · highlight · step through
   ↓
Statewave Memory           remembers the person, never rewrites the product
```

Ask _"Where do I create a client?"_ and instead of five paragraphs, the application takes you there —
highlights the control, walks the steps, and remembers next week that you already learned it.

Two rules run through everything:

> **Unknown is better than wrong.** A fact reaches the user only with source-level evidence behind
> it. No evidence, no sentence — the system refuses rather than guesses.

> **Memory remembers experience, not truth.** What you did shapes how things are presented. It can
> never add a button, an answer, or a permission the product does not have right now.

---

## Status — honest and current

This is a working end-to-end research prototype, built in public — journey chapters in
[docs/journey/](docs/journey/), and a report per closed loop from #17 on (plus several earlier ones)
in [docs/](docs/).

- **Not yet on npm.** Every `@statewavedev/guide-*` package builds a clean publishable tarball, but
  none is published. The working install path is cloning this repository.
- **Everything below is built and gated** — 139 checks, run by one manifest, green.
- What is genuinely missing is listed [at the bottom](#what-is-not-built-yet), and only things that
  are actually missing are on it.

## Quick start (10 minutes, no AI keys, no Statewave)

```bash
git clone <this repository> && cd statewave-guide
pnpm install          # Node >= 20, pnpm 9+
pnpm build
pnpm test             # 1500+ unit tests
pnpm demo             # the interactive demo host (a small CRM), local memory
```

The demo is a fixture CRM with the guide panel mounted. Ask it _how do I create a client?_ — then
press **Show me** and watch it point at the real control, or **Step through** and let it walk you.
Ask it something the product cannot do and watch it refuse instead of improvise.

Useful demo URLs once it is running:

```
?memory=local      remember in this browser (default)
?memory=off        no memory at all
?dev=1             the developer inspector (evidence, receipts, memory diagnostics)
```

Durable, cross-browser memory needs a Statewave server — see
[docs/host-integration.md](docs/host-integration.md) for the full setup, including the one PATCH
that registers Guide's claim keys.

## Index your own application

The indexer and the semantic compiler run on arbitrary React + Node repositories today, as local
CLIs (they are not published yet):

```bash
# 1. mark up controls you want the guide to know by stable ids
#    <button data-guide="clients.create">New Client</button>

# 2. build the evidence-backed application graph
node <statewave-guide>/packages/indexer/dist/cli.js .

# 3. compile the product model. The CLI ships the deterministic mock provider;
#    real providers (Anthropic, OpenAI-compatible) are used programmatically via
#    enrichApplicationGraph() and go through the identical verifier
node <statewave-guide>/packages/semantic/dist/cli.js enrich . --provider mock --docs
```

The output is byte-identical between runs over unchanged source. Wiring the resulting bundle into
the React panel in _your_ app is [docs/host-integration.md](docs/host-integration.md) — the demo
host in [`examples/guide-e2e`](examples/guide-e2e) is the reference implementation of every step.

## What "code-aware" means here

The DOM says _there is a button here_. That is not knowledge, it is scenery. The indexer
reconstructs what the product actually does, with evidence for every edge:

```
clients.create → openCreateClient() → NewClientDialog → submitClient()
              → clientService.create() → POST /api/clients
```

If a relationship cannot be proven from the source, it is not stored. One real-world pattern would
have fabricated dozens of API endpoints via the obvious shortcut; the refusal catalogue
([docs/refusals.md](docs/refusals.md)) exists so those shortcuts stay refused.

A model _is_ involved — for meaning, not facts. It selects from deterministic claim opportunities
the graph already proves, and a verifier rejects everything else. Under a real model
(claude-opus-5, 382 factual claims, two evaluation rounds): **zero fabrications reached the Product
Model** ([the run](docs/provider-reality-check.md), [round 2](docs/provider-reality-check-round-2.md)).

## What the running interface adds

Static truth is not the whole answer. At runtime the guide also uses — with receipts, and without
ever mutating the product model:

- **runtime context** — what exists on this screen right now
- **visible language** — _"use the field showing 'Search clients'"_, quoted only while those words
  are actually painted ([ADR 0028](docs/adr/0028-visible-now-is-not-named-forever.md))
- **runtime instances** — "the row you selected", as contextual identity, never persisted
  ([ADR 0025](docs/adr/0025-runtime-instances-are-contextual-identity-not-product-truth.md))

## Memory

Guide memory is a closed vocabulary of six event kinds — counters and choices, never text. It is
bounded by design: a walkthrough finished a thousand times is **one** durable record (the
idempotency key names the state), and a preference changed four times is **one** active value
(a registered Statewave claim key supersedes the rest). Measured against a real server:
504 writes → 5 durable episodes → 2 events read back.

The credential never reaches the browser: page → your backend → Statewave.
Full architecture: [ADR 0032](docs/adr/0032-remote-memory-persists-experience-not-authority.md),
[ADR 0033](docs/adr/0033-durable-memory-is-what-a-later-answer-can-read.md), and the
[#20.x closed loops](docs/).

## Trust it by evening

Don't take the README's word for any of this — the checks are runnable:

```bash
pnpm build                              # gates run against dist
pnpm exec playwright install chromium   # browser gates need it once
pnpm gates                              # all 139, ~6-7 minutes, needs ports 4319/4320 free
```

The `test:` scripts in `package.json` **are** the manifest — `scripts/gates.mjs` enumerates them and
CI runs that enumeration, so a gate cannot exist without running everywhere.
[docs/trust.md](docs/trust.md) is the one-page answer to what leaves the browser, what gets
persisted, and how to verify each claim yourself; [docs/validation-gates.md](docs/validation-gates.md)
is the unedited pass/fail history.

## Architecture

| package                         | what it is                                                  |
| ------------------------------- | ----------------------------------------------------------- |
| `@statewavedev/guide-indexer`   | source → evidence-backed application graph (build-time CLI) |
| `@statewavedev/guide-semantic`  | graph → verified Product Model + guidance (build-time CLI)  |
| `@statewavedev/guide-core`      | the query engine, contracts, memory model — framework-free  |
| `@statewavedev/guide-runtime`   | runtime evidence: DOM, visibility, behaviour, redaction     |
| `@statewavedev/guide-react`     | the panel, hooks, element registry, theming                 |
| `@statewavedev/guide-statewave` | the durable memory adapter (server-side, holds the SDK)     |
| `@statewavedev/guide-actions`   | the semantic action vocabulary and risk policy              |
| `@statewavedev/guide-shared`    | shared types                                                |

A host ships `react` + `runtime` + (optionally) `statewave`; the two CLIs are build-time tools.
Deeper: [docs/architecture.md](docs/architecture.md), 32 ADRs under [docs/adr/](docs/adr/).

## What is not built yet

Stated plainly, so nothing above is mistaken for a promise:

- **No npm publication.** Clone-only today. The tarballs are clean; the decision is deliberate
  until the interfaces stop moving.
- **No confirmation UI.** `confirm`-risk actions are refused for agents by policy; nothing asks the
  human yet.
- **No OpenAPI ingestion.** The graph comes from source analysis; spec files are not an input yet.
- **No VLM, no RAG, no autonomous actions.** Deliberate boundaries, documented in the ADRs.
- **Vue, Svelte, Tauri adapters** do not exist. The core is framework-free so they can.
- **Windows is untested.** Development happens on macOS/Linux; the gate runner assumes a POSIX shell.
- **Human validation of the review artifacts** is deferred until pre-release; every review package
  says so on its face.

## Contributing

The most useful contributions are issues that poke at the boundaries the ADRs describe. House
rules: strict TypeScript, no `any`, no new runtime dependencies without a good reason, and no fact
without evidence — the gates will hold you to that last one.

## License

[Apache-2.0](LICENSE)
